import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { Deal } from '../../api/client';
import { updateDealRequirements, updateDealStatus, updateLeadRequirements, getTaxonomyTree } from '../../api/client';
import client from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { AIStatusBadge } from '../AIStatusBadge';
import DemandRequirementsForm, { type DemandPayload, type DemandRequirementsFormHandle } from '../leads/DemandRequirementsForm';
import CloseWonDialog from './CloseWonDialog';

// ── Canonical taxonomy tree shape (from GET /public/taxonomy/tree) ────────────
// Same source the Edit form (<DemandRequirementsForm>) reads. The legacy slug-based
// master-category tree was retired here once the legacy demand_* slug columns were dropped.
interface TaxonomyTreeNode { id: string; name: string; slug: string; node_kind: string; children?: TaxonomyTreeNode[] }

// BHK_OPTIONS and COMMON_AMENITIES constants removed Phase 2 demand-side unification
// (2026-05-29). Both come from the taxonomy 'bhk' / 'amenities' FieldDefinition rows
// now (rendered inside <DemandRequirementsForm>'s dynamic by-type panel).
const INTENT_LABELS: Record<string, string> = { buy: 'Buy', rent: 'Rent', rent_lease: 'Rent / Lease' };

interface Props {
    deal: Deal;
    stageLabels: Record<string, string>;
    onRefresh: () => void;
    // Re-fetch the open deal after a requirements save so Match & Share reflects it in-session.
    onDealUpdated?: () => void;
    onVisitOutcome?: (deal: Deal) => void;
    onRevive?: (deal: Deal) => void;
}

function formatBudget(v?: number | null): string {
    if (!v) return '—';
    if (v >= 10000000) return `Rs.${(v / 10000000).toFixed(1)}Cr`;
    if (v >= 100000)   return `Rs.${(v / 100000).toFixed(1)}L`;
    return `Rs.${(v / 1000).toFixed(0)}K`;
}

export function RequirementsTab({ deal, stageLabels, onRefresh, onDealUpdated, onVisitOutcome, onRevive }: Props) {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [isEditing, setIsEditing]   = useState(false);
    const [saving, setSaving]         = useState(false);
    const [statusChanging, setStatusChanging] = useState(false);
    const [closeWonOpen, setCloseWonOpen] = useState(false);
    const [aiToggling, setAiToggling] = useState(false);
    // Lets the top-bar "Save & Close" button drive the embedded form's submit.
    const formRef = useRef<DemandRequirementsFormHandle>(null);

    // ── State — three-level hierarchy ─────────────────────────────────────────
    // dc = contact SSOT: used as fallback when transaction snapshot fields are null.
    // Phase 5 (2026-05-29): legacy demand_main_category / demand_type_slug /
    // demand_bhk / demand_amenities columns dropped from Contact + Transaction.
    // Read canonical demand_schema_values first; legacy fields kept as type-level
    // shims so older Deal payloads still parse. bhk derives the legacy display
    // string ("3BHK" / "Studio") for the read-mode summary.
    const dc = deal.demand_contact;
    const canonicalSchema = (deal.demand_schema_values || dc?.demand_schema_values || {}) as Record<string, any>;
    const canonicalBhk: string | null = (() => {
        const v = canonicalSchema.bhk;
        if (v == null) return null;
        if (typeof v === 'string') {
            if (v === '1 RK' || v.toLowerCase() === '1rk') return 'Studio';
            const n = parseInt(v.replace('+', '').trim(), 10);
            return Number.isNaN(n) ? v : `${n}BHK`;
        }
        if (typeof v === 'number') return `${v}BHK`;
        return null;
    })();
    const canonicalAmenities: string[] = Array.isArray(canonicalSchema.amenities)
        ? canonicalSchema.amenities as string[]
        : [];

    const [fields, setFields] = useState({
        demand_intent:
            deal.demand_intent || dc?.intent || '',
        demand_property_type:
            (deal.demand_property_type as string | null) || '',
        demand_category:
            deal.demand_category || '',
        demand_type_slug:
            deal.demand_type_slug || '',
        demand_bedrooms:
            deal.demand_bedrooms || canonicalBhk || '',
        demand_location:
            deal.demand_location || dc?.preferred_location || '',
        demand_budget_min:
            deal.demand_budget_min ?? dc?.budget_min ?? ('' as any),
        demand_budget_max:
            deal.demand_budget_max ?? dc?.budget_max ?? ('' as any),
        demand_area_min:
            deal.demand_area_min ?? dc?.area_min ?? ('' as any),
        demand_area_max:
            deal.demand_area_max ?? dc?.area_max ?? ('' as any),
        demand_amenities:
            (deal.demand_amenities as string[] | null)
            || (canonicalAmenities.length ? canonicalAmenities : null)
            || [],
        demand_notes:
            deal.demand_notes || '',
    });

    // ── Canonical taxonomy resolution for the read-only view (2026-06-01) ─────
    // Phase 5 (2026-05-29) dropped demand_property_type / demand_category / demand_type_slug,
    // but this view kept reading those slugs → Category/Sub/Type rendered "—" even when the
    // canonical demand_taxonomy_node_id is set (the Edit form reads the node and shows it
    // correctly). Resolve the node → category/sub/type NAMES from the SAME taxonomy tree the
    // Edit form uses (<DemandRequirementsForm>), so the view matches the edit.
    const demandNodeId: string | null =
        (deal as any).demand_taxonomy_node_id
        ?? (dc as any)?.demand_taxonomy_node_id
        ?? null;

    const [tree, setTree] = useState<TaxonomyTreeNode[]>([]);
    useEffect(() => {
        let cancelled = false;
        getTaxonomyTree().then((data: any) => {
            if (cancelled) return;
            const roots: TaxonomyTreeNode[] = Array.isArray(data) ? data : (data?.tree || data?.roots || []);
            setTree(roots);
        }).catch(() => { if (!cancelled) setTree([]); });
        return () => { cancelled = true; };
    }, []);

    // Walk the tree to the node, collecting the ancestor path (root → node).
    const demandPath = useMemo(() => {
        if (!demandNodeId || !tree.length) return [] as TaxonomyTreeNode[];
        const path: TaxonomyTreeNode[] = [];
        const walk = (nodes: TaxonomyTreeNode[], anc: TaxonomyTreeNode[]): boolean => {
            for (const n of nodes) {
                if (n.id === demandNodeId) { path.push(...anc, n); return true; }
                if (n.children?.length && walk(n.children, [...anc, n])) return true;
            }
            return false;
        };
        walk(tree, []);
        return path;
    }, [tree, demandNodeId]);

    // Resolve labels by PATH POSITION (root→node = category, sub-category, type, leaf), not by
    // node_kind — the tree's node_kind casing varies (DB stores CATEGORY/SUBCATEGORY/TYPE, no
    // underscore). The Edit form (<DemandRequirementsForm>) likewise keys its cascade off position.
    const mainCatLabel = demandPath[0]?.name || '—';
    const subCatLabel  = demandPath[1]?.name || null;
    const typeLabel    = demandPath[2]?.name || null;
    const isResidential = (demandPath[0]?.slug || '').toLowerCase() === 'residential';

    // ── Auto-save with debounce ───────────────────────────────────────────────
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Phase 5 (2026-05-29): legacy debounced auto-save kept only for the Notes
    // textarea (the one remaining inline-editable field outside the canonical
    // <DemandRequirementsForm>). All demand_* requirement fields now flow
    // through handleSaveDemandCanonical → canonical SoT only. Sending any of
    // the dropped columns (demand_bedrooms / demand_amenities / demand_category
    // / demand_type_slug / demand_property_type) causes the backend to 500.
    const save = useCallback(async (updated: typeof fields) => {
        setSaving(true);
        try {
            const payload: Record<string, any> = {};
            if (updated.demand_notes !== undefined) payload.demand_notes = updated.demand_notes;
            if (Object.keys(payload).length === 0) return;
            await updateDealRequirements(deal.id, payload);
        } catch {
            showToast('Failed to save', 'error');
        } finally {
            setSaving(false);
        }
    }, [deal.id, showToast]);

    const handleChange = (key: keyof typeof fields, value: any) => {
        const next = { ...fields, [key]: value };
        setFields(next);
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => save(next), 600);
    };

    // Phase 2 demand-side unification (2026-05-29) — canonical save handler used by
    // the new <DemandRequirementsForm>. Sends demand_taxonomy_node_id + demand_schema_values
    // (the SoT) alongside derived legacy mirrors so Phase 1's deal-sync block keeps working.
    const handleSaveDemandCanonical = async (payload: DemandPayload) => {
        setSaving(true);
        try {
            // Phase 5 (2026-05-29): legacy demand_bedrooms / demand_amenities /
            // demand_bhk columns are DROPPED. Keep deriving local-only
            // display strings (for the read-mode summary), but do NOT POST
            // them — backend Prisma rejects them as Unknown arguments.
            const bhkRaw = payload.demand_schema_values?.bhk;
            let demandBedroomsDisplay = '';
            if (typeof bhkRaw === 'string') {
                if (bhkRaw === '1 RK' || bhkRaw.toLowerCase() === '1rk') {
                    demandBedroomsDisplay = 'Studio';
                } else {
                    const cleaned = bhkRaw.replace('+', '').trim();
                    const n = parseInt(cleaned, 10);
                    if (!Number.isNaN(n)) demandBedroomsDisplay = `${n}BHK`;
                }
            } else if (typeof bhkRaw === 'number') {
                demandBedroomsDisplay = `${bhkRaw}BHK`;
            }
            const amenitiesDisplay = Array.isArray(payload.demand_schema_values?.amenities)
                ? (payload.demand_schema_values.amenities as string[])
                : [];

            // PATCH the deal — canonical SoT only. Backend deep-merges
            // demand_schema_values onto existing JSON.
            await updateDealRequirements(deal.id, {
                demand_intent: payload.intent || undefined,
                // Send the location even when emptied (string, incl. '') so the user can
                // CLEAR a brittle/typo'd location — backend maps '' → null. `|| undefined`
                // would silently skip an emptied field and leave the stale value in place.
                demand_location: payload.preferred_location ?? undefined,
                demand_budget_min: payload.budget_min ?? undefined,
                demand_budget_max: payload.budget_max ?? undefined,
                demand_area_min: payload.area_min ?? undefined,
                demand_area_max: payload.area_max ?? undefined,
                demand_taxonomy_node_id: payload.demand_taxonomy_node_id,
                demand_schema_values: payload.demand_schema_values,
            });

            // Sync to Contact (SSOT) — fire-and-forget. Canonical fields only.
            const contactPhone = deal.demand_contact?.phone_number;
            if (contactPhone) {
                updateLeadRequirements(contactPhone, {
                    intent: payload.intent || undefined,
                    budget_min: payload.budget_min,
                    budget_max: payload.budget_max,
                    preferred_location: payload.preferred_location || undefined,
                    // Geo lives on the Contact (Transaction has no lat/lng) — persist it here so
                    // the deal's matched-inventory can do precise radius search. (2026-06-01)
                    preferred_lat: payload.preferred_lat ?? undefined,
                    preferred_lng: payload.preferred_lng ?? undefined,
                    area_min: payload.area_min,
                    area_max: payload.area_max,
                    area_unit: payload.area_unit,
                    timeline: payload.timeline || null,
                    demand_taxonomy_node_id: payload.demand_taxonomy_node_id,
                    demand_schema_values: payload.demand_schema_values,
                }).catch(() => {/* silent — contact sync is best-effort */});
            }

            // Update local fields so the read-mode summary reflects the save.
            setFields(prev => ({
                ...prev,
                demand_intent: payload.intent,
                demand_location: payload.preferred_location,
                demand_budget_min: payload.budget_min != null ? String(payload.budget_min) as any : '',
                demand_budget_max: payload.budget_max != null ? String(payload.budget_max) as any : '',
                demand_area_min: payload.area_min != null ? String(payload.area_min) as any : '',
                demand_area_max: payload.area_max != null ? String(payload.area_max) as any : '',
                demand_bedrooms: demandBedroomsDisplay,
                demand_amenities: amenitiesDisplay,
            }));
            showToast('Requirements saved', 'success');
            // Refresh the pipeline list so the saved value survives a close+reopen
            // (the list otherwise keeps the stale deal object), then exit edit mode.
            onRefresh();
            // Re-fetch the open deal so a switch to Match & Share (which remounts) reads the new
            // requirements without a manual close+reopen.
            onDealUpdated?.();
            setIsEditing(false);
        } catch {
            showToast('Failed to save', 'error');
        } finally {
            setSaving(false);
        }
    };

    // handleMainCategoryChange / handleSubCategoryChange / toggleAmenity removed
    // Phase 2 demand-side unification (2026-05-29) — the cascade + amenity toggling
    // now live inside <DemandRequirementsForm>.

    const handleStatusChange = async (status: string) => {
        // (NEG-2) Closing as Won opens the price dialog so the agreed final_price is captured.
        if (status === 'CLOSED_WON') { setCloseWonOpen(true); return; }
        const ok = await confirm(`Move deal to ${stageLabels[status] || status}?`);
        if (!ok) return;
        setStatusChanging(true);
        try {
            await updateDealStatus(deal.id, status);
            onRefresh();
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Status change failed', 'error');
        } finally { setStatusChanging(false); }
    };

    const confirmCloseWon = async (finalPrice?: number) => {
        setStatusChanging(true);
        try {
            await updateDealStatus(deal.id, 'CLOSED_WON', undefined, finalPrice);
            setCloseWonOpen(false);
            onRefresh();
        } catch (err: any) {
            showToast(err?.response?.data?.error || 'Close failed', 'error');
        } finally { setStatusChanging(false); }
    };

    const labelStyle: React.CSSProperties = {
        fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3,
    };
    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '7px 10px', borderRadius: 7,
        border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
    };
    const valStyle: React.CSSProperties = {
        fontSize: 13, color: 'var(--text-primary)', fontWeight: 500,
        padding: '6px 0', minHeight: 28,
    };

    // ── View-only render ──────────────────────────────────────────────────────
    if (!isEditing) {
        const rows: { label: string; value: string; fullWidth?: boolean }[] = [
            { label: 'Intent',    value: INTENT_LABELS[fields.demand_intent] || fields.demand_intent || '—' },
            { label: 'Category',  value: mainCatLabel },
            ...(subCatLabel ? [{ label: 'Sub-Category', value: subCatLabel }] : []),
            ...(typeLabel    ? [{ label: 'Type',         value: typeLabel }]   : []),
            ...(isResidential || fields.demand_bedrooms
                ? [{ label: 'BHK', value: fields.demand_bedrooms || '—' }]
                : []),
            {
                label: 'Budget',
                value: (fields.demand_budget_min || fields.demand_budget_max)
                    ? `${formatBudget(fields.demand_budget_min)} – ${formatBudget(fields.demand_budget_max)}`
                    : '—',
            },
            ...(fields.demand_area_min || fields.demand_area_max
                ? [{ label: 'Area', value: `${fields.demand_area_min || '?'} – ${fields.demand_area_max || '?'} sqft` }]
                : []),
            { label: 'Location', value: fields.demand_location || '—', fullWidth: true },
            ...(fields.demand_notes ? [{ label: 'Notes', value: fields.demand_notes, fullWidth: true }] : []),
        ];

        return (
            <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Lead Requirements
                    </div>
                    <button type="button" onClick={() => setIsEditing(true)} style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)',
                        color: 'var(--accent-primary)',
                    }}>
                        Edit
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginBottom: 16 }}>
                    {rows.map(r => (
                        <div key={r.label} style={r.fullWidth ? { gridColumn: '1 / -1' } : {}}>
                            <div style={labelStyle}>{r.label}</div>
                            <div style={valStyle}>{r.value}</div>
                        </div>
                    ))}
                </div>

                {fields.demand_amenities.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                        <div style={labelStyle}>Amenities</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                            {fields.demand_amenities.map((a: string) => (
                                <span key={a} style={{
                                    padding: '3px 10px', borderRadius: 16, fontSize: 11, fontWeight: 600,
                                    backgroundColor: 'var(--accent-primary)', color: '#fff',
                                }}>{a}</span>
                            ))}
                        </div>
                    </div>
                )}

                {(deal as any).ai_status && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 14px', borderRadius: 8, backgroundColor: 'var(--bg-secondary)' }}>
                        <AIStatusBadge status={(deal as any).ai_status} />
                        <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
                            {(deal as any).ai_paused ? 'AI paused' : 'AI automation running'}
                        </div>
                        <button type="button" disabled={aiToggling} onClick={async () => {
                            setAiToggling(true);
                            try {
                                const action = (deal as any).ai_paused ? 'RESUMED_AI' : 'PAUSED_AI';
                                await client.post(`/api/deals/${deal.id}/log-action`, { action_type: action });
                                onRefresh();
                            } catch (err: any) { showToast(err?.response?.data?.error || 'Failed', 'error'); }
                            finally { setAiToggling(false); }
                        }} style={{
                            padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            backgroundColor: (deal as any).ai_paused ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
                            border: '1px solid ' + ((deal as any).ai_paused ? 'rgba(34,197,94,0.4)' : 'rgba(107,114,128,0.4)'),
                            color: (deal as any).ai_paused ? '#22c55e' : '#6b7280',
                        }}>
                            {aiToggling ? '...' : (deal as any).ai_paused ? 'Resume AI' : 'Pause AI'}
                        </button>
                    </div>
                )}

                <StageActions
                    deal={deal} stageLabels={stageLabels}
                    statusChanging={statusChanging}
                    onStatusChange={handleStatusChange}
                    onVisitOutcome={onVisitOutcome}
                    onRevive={onRevive}
                />
            </div>
        );
    }

    // ── Edit mode ─────────────────────────────────────────────────────────────
    return (
        <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Edit Requirements {saving && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>· saving…</span>}
                </div>
                {/* Cancel discards; "Save & Close" persists via the embedded form's submit.
                    (The old single "Done" button only closed the editor WITHOUT saving —
                    users lost their edits. The save action now lives here, at the top.) */}
                <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setIsEditing(false)} disabled={saving} style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                        backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)',
                    }}>
                        Cancel
                    </button>
                    <button type="button" onClick={() => formRef.current?.submit()} disabled={saving} style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                        backgroundColor: 'var(--accent-primary)', border: 'none', color: '#fff',
                    }}>
                        {saving ? 'Saving…' : 'Save & Close'}
                    </button>
                </div>
            </div>

            {/* Phase 2 demand-side unification (2026-05-29): the inline Intent/Category-cascade/
                BHK-hardcoded/Area/Budget/Location/Amenities-chips block is REPLACED by the shared
                <DemandRequirementsForm> which renders a taxonomy picker + dynamic by-type panel.
                Same component used by the Lead detail panel (ExternalLeads.tsx) — single source of
                truth for buyer demand capture. Notes stay below as a deal-specific textarea. */}
            <DemandRequirementsForm
                initial={{
                    intent: fields.demand_intent || 'buy',
                    budget_min: fields.demand_budget_min !== '' ? Number(fields.demand_budget_min) : null,
                    budget_max: fields.demand_budget_max !== '' ? Number(fields.demand_budget_max) : null,
                    area_min: fields.demand_area_min !== '' ? Number(fields.demand_area_min) : null,
                    area_max: fields.demand_area_max !== '' ? Number(fields.demand_area_max) : null,
                    area_unit: 'sqft',
                    timeline: '',
                    preferred_location: fields.demand_location || '',
                    preferred_lat: (deal.demand_contact as any)?.preferred_lat ?? null,
                    preferred_lng: (deal.demand_contact as any)?.preferred_lng ?? null,
                    demand_taxonomy_node_id: (deal as any).demand_taxonomy_node_id
                        ?? (deal.demand_contact as any)?.demand_taxonomy_node_id
                        ?? null,
                    demand_schema_values: (deal as any).demand_schema_values
                        ?? (deal.demand_contact as any)?.demand_schema_values
                        ?? {},
                }}
                onSubmit={handleSaveDemandCanonical}
                submitting={saving}
                submitLabel="Save Requirements"
                ref={formRef}
                hideSubmitButton
            />


            <div style={{ marginBottom: 16 }}>
                <div style={labelStyle}>Notes</div>
                <textarea
                    style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                    value={fields.demand_notes}
                    onChange={e => handleChange('demand_notes', e.target.value)}
                    placeholder="Any additional customer notes…"
                />
            </div>

            <StageActions
                deal={deal} stageLabels={stageLabels}
                statusChanging={statusChanging}
                onStatusChange={handleStatusChange}
                onVisitOutcome={onVisitOutcome}
                onRevive={onRevive}
            />

            <CloseWonDialog
                open={closeWonOpen}
                dealLabel={`${deal.demand_contact?.name ? deal.demand_contact.name + ' · ' : ''}Deal #${deal.id.slice(0, 8)}`}
                submitting={statusChanging}
                onConfirm={confirmCloseWon}
                onClose={() => setCloseWonOpen(false)}
            />
        </div>
    );
}

// ── Shared stage-action buttons ───────────────────────────────────────────────
function StageActions({ deal, stageLabels, statusChanging, onStatusChange, onVisitOutcome, onRevive }: {
    deal: Deal;
    stageLabels: Record<string, string>;
    statusChanging: boolean;
    onStatusChange: (s: string) => void;
    onVisitOutcome?: (deal: Deal) => void;
    onRevive?: (deal: Deal) => void;
}) {
    const nextStatuses: string[] = (deal as any).valid_next_statuses || [];
    if (!nextStatuses.length && !onVisitOutcome && !onRevive) return null;

    return (
        <div style={{ borderTop: '1px solid var(--border-secondary)', paddingTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                Stage Actions
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {nextStatuses.map((s: string) => (
                    <button key={s} type="button" disabled={statusChanging} onClick={() => onStatusChange(s)} style={{
                        padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
                        border: '1px solid var(--border-secondary)',
                    }}>
                        Move to {stageLabels[s] || s}
                    </button>
                ))}
                {deal.status === 'VISIT_SCHEDULED' && onVisitOutcome && (
                    <button type="button" onClick={() => onVisitOutcome(deal)} style={{
                        padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        backgroundColor: 'rgba(245,158,11,0.1)', border: '1.5px solid rgba(245,158,11,0.4)', color: '#f59e0b',
                    }}>
                        Submit Visit Outcome
                    </button>
                )}
                {deal.status === 'ON_HOLD' && onRevive && (
                    <button type="button" onClick={() => onRevive(deal)} style={{
                        padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        backgroundColor: 'rgba(34,197,94,0.1)', border: '1.5px solid rgba(34,197,94,0.4)', color: '#22c55e',
                    }}>
                        Revive Deal
                    </button>
                )}
            </div>
        </div>
    );
}
