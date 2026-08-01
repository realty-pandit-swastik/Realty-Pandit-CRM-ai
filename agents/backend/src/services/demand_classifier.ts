/**
 * LLM demand classifier (2026-08-01) — reads a portal/enquiry description and infers a
 * structured requirement {main_category, property_type, bhk}. Used as an ASYNC refinement
 * after the deterministic ingest: it only UPGRADES a coarse (CATEGORY/SUBCATEGORY-level)
 * classification to a specific TYPE, and fills BHK when missing — it never clobbers an
 * existing specific type or an existing BHK. Fully guarded: never throws, short timeout,
 * so it can never block or fail lead ingestion (which holds a fail-loud watermark).
 */
import prisma from '../db';
import logger from '../utils/logger';
import { LLMService } from './llm';
import { resolveDemandTaxonomy } from '../utils/demand_taxonomy';

const llmService = new LLMService();

export interface DemandClassification {
    main_category: 'residential' | 'commercial' | null;
    property_type: string | null;
    bhk: number | null;
}

const SYSTEM = [
    'You classify a real-estate enquiry into a structured requirement.',
    'Reply with ONLY compact JSON, no prose, no markdown fences:',
    '{"main_category":"residential|commercial|null","property_type":"<flat|villa|plot|builder floor|studio|penthouse|office|shop|showroom|warehouse|null>","bhk":<integer or null>}',
    'Infer from the property description. "N Bed"/"N BHK" => bhk N. A named society/apartment implies residential flat.',
    'If a field is unclear, use null. Never guess a property_type when the text only says "residential"/"commercial".',
].join(' ');

export async function classifyDemandFromText(text: string): Promise<DemandClassification | null> {
    const t = (text || '').trim();
    if (t.length < 4) return null;
    try {
        const raw = await Promise.race([
            llmService.generateResponse(SYSTEM, t),
            new Promise<string>((_, rej) => setTimeout(() => rej(new Error('llm-timeout')), 12000)),
        ]);
        const m = String(raw).match(/\{[\s\S]*\}/);
        if (!m) return null;
        const j = JSON.parse(m[0]);
        const mc = typeof j.main_category === 'string' ? j.main_category.toLowerCase() : null;
        const pt = j.property_type && String(j.property_type).toLowerCase() !== 'null' ? String(j.property_type).toLowerCase() : null;
        const bhk = j.bhk == null || j.bhk === 'null' ? null : (parseInt(String(j.bhk), 10) || null);
        return {
            main_category: mc === 'residential' || mc === 'commercial' ? mc : null,
            property_type: pt,
            bhk,
        };
    } catch (e) {
        logger.warn('[DemandClassifier] classify failed: ' + (e as Error).message);
        return null;
    }
}

/** Walk up to the SUBCATEGORY (or CATEGORY) ancestor of a node — keeps demand broad. */
async function subcategoryAncestor(nodeId: string): Promise<string | null> {
    let cur = await prisma.taxonomyNode.findUnique({ where: { id: nodeId }, select: { id: true, node_kind: true, parent_id: true } });
    let hops = 0;
    while (cur && hops < 4) {
        if (cur.node_kind === 'SUBCATEGORY' || cur.node_kind === 'CATEGORY') return cur.id;
        if (!cur.parent_id) return cur.id;
        cur = await prisma.taxonomyNode.findUnique({ where: { id: cur.parent_id }, select: { id: true, node_kind: true, parent_id: true } });
        hops++;
    }
    return cur?.id ?? nodeId;
}

/**
 * Fire-and-forget refinement — call after a portal lead is ingested. Safe to await or not.
 */
export async function refineDemandWithLLM(phone: string, text: string): Promise<void> {
    try {
        const contact = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: { demand_taxonomy_node_id: true, demand_schema_values: true },
        });
        if (!contact) return;

        const cls = await classifyDemandFromText(text);
        if (!cls || (!cls.property_type && cls.bhk == null)) return;

        const curNode = contact.demand_taxonomy_node_id
            ? await prisma.taxonomyNode.findUnique({ where: { id: contact.demand_taxonomy_node_id }, select: { node_kind: true } })
            : null;
        const curKind = curNode?.node_kind || null;
        const curSV: Record<string, any> = (contact.demand_schema_values && typeof contact.demand_schema_values === 'object' && !Array.isArray(contact.demand_schema_values))
            ? { ...(contact.demand_schema_values as any) } : {};

        const patch: any = {};

        // Upgrade the NODE only when the LLM found a type AND we're currently coarse (null/CATEGORY).
        // Keep requirements BROAD: cap the upgrade at the SUBCATEGORY level (walk up from any TYPE to
        // its subcategory ancestor). The user narrows to a specific type at Match & Share, not here.
        if (cls.property_type && (!curKind || curKind === 'CATEGORY')) {
            const dt = await resolveDemandTaxonomy({ main_category: cls.main_category ?? undefined, property_type: cls.property_type, bhk: cls.bhk ?? null });
            if (dt.demand_taxonomy_node_id) {
                const targetId = await subcategoryAncestor(dt.demand_taxonomy_node_id);
                if (targetId && targetId !== contact.demand_taxonomy_node_id) patch.demand_taxonomy_node_id = targetId;
            }
        }
        // Fill BHK only when missing.
        if (cls.bhk != null && (curSV.bhk == null || curSV.bhk === '')) {
            patch.demand_schema_values = { ...curSV, bhk: String(cls.bhk) };
        }

        if (!Object.keys(patch).length) return;

        await prisma.contact.update({ where: { phone_number: phone }, data: patch });
        // Keep the active deal(s) in sync (the deal mirrors the lead).
        await prisma.transaction.updateMany({
            where: { demand_contact: { phone_number: phone }, status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
            data: patch,
        });
        logger.info(`[DemandClassifier] refined ${phone}: ${JSON.stringify(patch)}`);
    } catch (e) {
        logger.warn(`[DemandClassifier] refine ${phone} failed: ${(e as Error).message}`);
    }
}
