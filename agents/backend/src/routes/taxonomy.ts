/**
 * Phase 1a — canonical taxonomy READ API.
 * Serves the tree + per-type field schema that will drive the dynamic add-inventory form
 * (and, in later phases, search/matching/sharing/AI). Read-only; supersedes classification.ts
 * once consumers migrate. Mounted at /public/taxonomy.
 */
import { Router } from 'express';
import prisma from '../db';
import { authMiddleware } from '../middleware/auth';
import { requireSuperBoss } from '../middleware/require_super_boss';
import { captureRouteError } from '../utils/capture';

const router = Router();

// Admin router — mounted at /api/taxonomy; super_boss only (Phase 1c).
export const adminTaxonomyRouter = Router();
adminTaxonomyRouter.use(authMiddleware, requireSuperBoss);

// GET /public/taxonomy/tree — full active tree, nested (Category → Subcategory → [Group] → Type)
router.get('/tree', async (_req, res) => {
    try {
        const nodes = await prisma.taxonomyNode.findMany({
            where: { is_active: true },
            orderBy: [{ display_order: 'asc' }, { name: 'asc' }],
            select: { id: true, parent_id: true, name: true, slug: true, node_kind: true },
        });
        const byId: Record<string, any> = {};
        nodes.forEach((n) => (byId[n.id] = { ...n, children: [] }));
        const roots: any[] = [];
        nodes.forEach((n) => (n.parent_id ? byId[n.parent_id]?.children.push(byId[n.id]) : roots.push(byId[n.id])));
        res.json({ success: true, tree: roots });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// GET /public/taxonomy/nodes/:id/fields — the per-type field schema (drives the dynamic form)
router.get('/nodes/:id/fields', async (req, res) => {
    try {
        const nf = await prisma.nodeField.findMany({
            where: { taxonomy_node_id: req.params.id },
            orderBy: { display_order: 'asc' },
            include: { field: true },
        });
        res.json({
            success: true,
            fields: nf.map((x) => ({
                key: x.field.key,
                label: x.label_override || x.field.label,
                input_type: x.field.input_type,
                required: x.required,
                options: (x.options_override as any) ?? (x.field.options_json as any) ?? null,
                unit: x.field.unit,
            })),
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ── Admin (super_boss) — Phase 1c editor ───────────────────────────────

// GET /api/taxonomy/fields — full FieldDefinition catalog (for the attach dropdown)
adminTaxonomyRouter.get('/fields', async (req, res) => {
    try {
        const fields = await prisma.fieldDefinition.findMany({
            where: { is_active: true },
            orderBy: { key: 'asc' },
            select: { id: true, key: true, label: true, input_type: true, options_json: true, unit: true },
        });
        res.json({ success: true, fields });
    } catch (e: any) { captureRouteError(e, req, { route: 'taxonomy#fields' }); res.status(500).json({ error: e.message }); }
});

// PATCH /api/taxonomy/nodes/:id/fields — set a type's NodeField schema (replace set)
adminTaxonomyRouter.patch('/nodes/:id/fields', async (req, res) => {
    try {
        const nodeId = req.params.id;
        const fields: { key: string; required?: boolean; label_override?: string | null; options_override?: any; display_order?: number }[] = req.body?.fields || [];
        const node = await prisma.taxonomyNode.findUnique({ where: { id: nodeId }, select: { id: true } });
        if (!node) return res.status(404).json({ error: 'Node not found' });
        const catalog = await prisma.fieldDefinition.findMany({ select: { id: true, key: true } });
        const idByKey: Record<string, string> = Object.fromEntries(catalog.map((f) => [f.key, f.id]));
        const keepFieldIds: string[] = [];
        const ops: any[] = [];
        fields.forEach((f, i) => {
            const fieldId = idByKey[f.key];
            if (!fieldId) return;
            keepFieldIds.push(fieldId);
            ops.push(prisma.nodeField.upsert({
                where: { taxonomy_node_id_field_id: { taxonomy_node_id: nodeId, field_id: fieldId } },
                update: { required: !!f.required, label_override: f.label_override ?? null, options_override: f.options_override ?? undefined, display_order: f.display_order ?? i },
                create: { taxonomy_node_id: nodeId, field_id: fieldId, required: !!f.required, label_override: f.label_override ?? null, options_override: f.options_override ?? undefined, display_order: f.display_order ?? i },
            }));
        });
        ops.push(prisma.nodeField.deleteMany({ where: { taxonomy_node_id: nodeId, field_id: { notIn: keepFieldIds.length ? keepFieldIds : ['__none__'] } } }));
        await prisma.$transaction(ops);
        res.json({ success: true, count: keepFieldIds.length });
    } catch (e: any) { captureRouteError(e, req, { route: 'taxonomy#setfields' }); res.status(500).json({ error: e.message }); }
});

// GET /api/taxonomy/review-queue — flagged inventory grouped by current node
adminTaxonomyRouter.get('/review-queue', async (req, res) => {
    try {
        const flagged = await prisma.inventory.findMany({
            where: { needs_taxonomy_review: true },
            select: { id: true, taxonomy_node_id: true, type: true, apartment_name: true, locality: true, city: true, display_id: true },
            orderBy: { updated_at: 'desc' },
        });
        const nodeIds = [...new Set(flagged.map((f) => f.taxonomy_node_id).filter(Boolean) as string[])];
        const nodes = await prisma.taxonomyNode.findMany({ where: { id: { in: nodeIds } }, select: { id: true, name: true } });
        const nameById: Record<string, string> = Object.fromEntries(nodes.map((n) => [n.id, n.name]));
        const groups: Record<string, any> = {};
        for (const f of flagged) {
            const key = f.taxonomy_node_id || 'none';
            groups[key] = groups[key] || { node_id: f.taxonomy_node_id, node_name: nameById[f.taxonomy_node_id || ''] || 'Unassigned', count: 0, sample: [] };
            groups[key].count++;
            if (groups[key].sample.length < 8) groups[key].sample.push({ id: f.id, title: f.apartment_name || f.display_id || f.type, location: [f.locality, f.city].filter(Boolean).join(', ') });
        }
        res.json({ success: true, total: flagged.length, groups: Object.values(groups).sort((a: any, b: any) => b.count - a.count) });
    } catch (e: any) { captureRouteError(e, req, { route: 'taxonomy#reviewqueue' }); res.status(500).json({ error: e.message }); }
});

// PATCH /api/taxonomy/inventory/:id/node — reassign one flagged listing + clear flag
adminTaxonomyRouter.patch('/inventory/:id/node', async (req, res) => {
    try {
        const { taxonomy_node_id } = req.body || {};
        if (!taxonomy_node_id) return res.status(400).json({ error: 'taxonomy_node_id required' });
        const node = await prisma.taxonomyNode.findUnique({ where: { id: taxonomy_node_id }, select: { id: true } });
        if (!node) return res.status(404).json({ error: 'Target node not found' });
        await prisma.inventory.update({ where: { id: req.params.id }, data: { taxonomy_node_id, needs_taxonomy_review: false } });
        res.json({ success: true });
    } catch (e: any) { captureRouteError(e, req, { route: 'taxonomy#reassign1' }); res.status(500).json({ error: e.message }); }
});

// PATCH /api/taxonomy/review/bulk — reassign all flagged on from_node_id → to_node_id + clear
adminTaxonomyRouter.patch('/review/bulk', async (req, res) => {
    try {
        const { from_node_id, to_node_id } = req.body || {};
        if (!to_node_id) return res.status(400).json({ error: 'to_node_id required' });
        const node = await prisma.taxonomyNode.findUnique({ where: { id: to_node_id }, select: { id: true } });
        if (!node) return res.status(404).json({ error: 'Target node not found' });
        const r = await prisma.inventory.updateMany({
            where: { needs_taxonomy_review: true, taxonomy_node_id: from_node_id ?? undefined },
            data: { taxonomy_node_id: to_node_id, needs_taxonomy_review: false },
        });
        res.json({ success: true, count: r.count });
    } catch (e: any) { captureRouteError(e, req, { route: 'taxonomy#reviewbulk' }); res.status(500).json({ error: e.message }); }
});

export default router;
