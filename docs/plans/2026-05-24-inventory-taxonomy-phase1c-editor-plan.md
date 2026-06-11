# Inventory Taxonomy — Phase 1c (Admin Editor, v1) Implementation Plan

**STATUS: ✅ SHIPPED & backend-verified in prod 2026-05-24.** Super_boss-only `/api/taxonomy/*` admin router (fields, set node fields, review-queue, reassign-one, bulk) + `PropertyTaxonomy.tsx` page (Field Schema + Needs Review tabs) wired into nav (super_boss-gated) + App. E2E: review-queue=180 grouped; fields catalog=35; **employee→403**; setfields 200; **bulk reassign cleared 1 (Hotel) → 179**. SW v20260524c. Remaining 179 flags = owner clears via the UI. Playwright UI capture pending (user Chrome open). Per-item reassign + node CRUD = v1.5.
> **INCIDENT 2026-05-24:** the first frontend deploy of this page **wiped dist + 404'd admin.realtypandit.in for ~25min** — `PropertyTaxonomy.tsx` had a `tsc -b`-only type error (showToast prop) that `tsc --noEmit` missed, and `deploy-agent` masks build failures after `rm -rf dist`. Fixed (children call `useToast()` directly), rebuilt, site verified 200. New rule recorded: [feedback_frontend_build_verify]. The page now builds + is live.



> **Execution:** Ships via `node deployment/deploy-agent.js backend|frontend` (no git). Checkpoints replace commits. Steps use `- [ ]`. Builds on 1a+1b (shipped). Spec: `docs/plans/2026-05-24-inventory-taxonomy-phase1c-editor-design.md`.

**Goal:** A super_boss-only "Property Taxonomy" admin page to (1) edit each type's field schema (BHK/Rooms label, required, options, attach/detach) and (2) clear the 180 `needs_taxonomy_review` listings (grouped, bulk + per-item reassign). Read-only tree (node CRUD = v1.5).

**Architecture:** Authed admin router added to `routes/taxonomy.ts`, mounted at `/api/taxonomy` (`authMiddleware` + `requireSuperBoss`). New `PropertyTaxonomy.tsx` page (mirrors `PartnerManagement.tsx`) with two tabs, wired into nav + App switch, calling new `client.ts` helpers.

**Tech Stack:** Express/Prisma/TS, React + inline styles, shared CSRF axios (`api/client.ts`).

---

## File Structure
| File | Responsibility | Action |
|---|---|---|
| `backend/src/routes/taxonomy.ts` | Add authed admin router (5 routes) | Modify |
| `backend/src/app.ts` | Mount `/api/taxonomy` (authed) | Modify |
| `frontend/src/api/client.ts` | 5 helpers | Modify |
| `frontend/src/components/PropertyTaxonomy.tsx` | The editor page (2 tabs) | Create |
| `frontend/src/components/DashboardLayout.tsx` | Nav item (super_boss only) | Modify |
| `frontend/src/App.tsx` | `case 'taxonomy'` (both render fns) | Modify |
| `frontend/index.html` | SW bump | Modify |

---

## Task 1: Backend admin router

**Files:** Modify `backend/src/routes/taxonomy.ts`, `backend/src/app.ts`

- [ ] **Step 1: Add imports + admin router** at the top of `taxonomy.ts` (after the existing `import prisma`):
```ts
import { authMiddleware } from '../middleware/auth';
import { requireSuperBoss } from '../middleware/require_super_boss';
import { captureRouteError } from '../utils/capture';

export const adminTaxonomyRouter = Router();
adminTaxonomyRouter.use(authMiddleware, requireSuperBoss);
```

- [ ] **Step 2: Add the 5 admin routes** at the end of `taxonomy.ts` (before/after `export default router`):
```ts
// GET /api/taxonomy/fields — full FieldDefinition catalog (for the attach dropdown)
adminTaxonomyRouter.get('/fields', async (_req, res) => {
    try {
        const fields = await prisma.fieldDefinition.findMany({
            where: { is_active: true },
            orderBy: { key: 'asc' },
            select: { id: true, key: true, label: true, input_type: true, options_json: true, unit: true },
        });
        res.json({ success: true, fields });
    } catch (e: any) { captureRouteError(e, _req, { route: 'taxonomy#fields' }); res.status(500).json({ error: e.message }); }
});

// PATCH /api/taxonomy/nodes/:id/fields — set a type's NodeField schema (replace set)
adminTaxonomyRouter.patch('/nodes/:id/fields', async (req, res) => {
    try {
        const nodeId = req.params.id;
        const fields: { key: string; required?: boolean; label_override?: string | null; options_override?: any; display_order?: number }[] = req.body?.fields || [];
        const node = await prisma.taxonomyNode.findUnique({ where: { id: nodeId }, select: { id: true } });
        if (!node) return res.status(404).json({ error: 'Node not found' });
        const catalog = await prisma.fieldDefinition.findMany({ select: { id: true, key: true } });
        const idByKey = Object.fromEntries(catalog.map(f => [f.key, f.id]));
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
        // delete detached fields
        ops.push(prisma.nodeField.deleteMany({ where: { taxonomy_node_id: nodeId, field_id: { notIn: keepFieldIds.length ? keepFieldIds : ['__none__'] } } }));
        await prisma.$transaction(ops);
        res.json({ success: true, count: keepFieldIds.length });
    } catch (e: any) { captureRouteError(e, req, { route: 'taxonomy#setfields' }); res.status(500).json({ error: e.message }); }
});

// GET /api/taxonomy/review-queue — flagged inventory grouped by current node
adminTaxonomyRouter.get('/review-queue', async (_req, res) => {
    try {
        const flagged = await prisma.inventory.findMany({
            where: { needs_taxonomy_review: true },
            select: { id: true, taxonomy_node_id: true, type: true, apartment_name: true, locality: true, city: true, display_id: true },
            orderBy: { updated_at: 'desc' },
        });
        const nodeIds = [...new Set(flagged.map(f => f.taxonomy_node_id).filter(Boolean) as string[])];
        const nodes = await prisma.taxonomyNode.findMany({ where: { id: { in: nodeIds } }, select: { id: true, name: true } });
        const nameById = Object.fromEntries(nodes.map(n => [n.id, n.name]));
        const groups: Record<string, any> = {};
        for (const f of flagged) {
            const key = f.taxonomy_node_id || 'none';
            groups[key] = groups[key] || { node_id: f.taxonomy_node_id, node_name: nameById[f.taxonomy_node_id || ''] || 'Unassigned', count: 0, sample: [] };
            groups[key].count++;
            if (groups[key].sample.length < 8) groups[key].sample.push({ id: f.id, title: f.apartment_name || f.display_id || f.type, location: [f.locality, f.city].filter(Boolean).join(', ') });
        }
        res.json({ success: true, total: flagged.length, groups: Object.values(groups).sort((a: any, b: any) => b.count - a.count) });
    } catch (e: any) { captureRouteError(e, _req, { route: 'taxonomy#reviewqueue' }); res.status(500).json({ error: e.message }); }
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
```

- [ ] **Step 3: Mount the admin router** in `app.ts`. After `import taxonomyRoutes from './routes/taxonomy';` change to also import the admin router:
```ts
import taxonomyRoutes, { adminTaxonomyRouter } from './routes/taxonomy';
```
And after the existing `app.use('/public/taxonomy', publicLimiter, taxonomyRoutes);` line add:
```ts
app.use('/api/taxonomy', apiLimiter, adminTaxonomyRouter); // Taxonomy admin (super_boss only)
```

- [ ] **Step 4: tsc.** `cd backend && npx tsc --noEmit 2>&1 | grep -E "routes/taxonomy|app.ts" || echo CLEAN` → CLEAN (ignore pre-existing baseline).

---

## Task 2: Client helpers

**Files:** Modify `frontend/src/api/client.ts`

- [ ] **Step 1: Add helpers** (near the other taxonomy/partner helpers):
```ts
export const getFieldCatalog = async () => (await client.get('/api/taxonomy/fields')).data;
export const updateNodeFields = async (nodeId: string, fields: any[]) =>
    (await client.patch(`/api/taxonomy/nodes/${nodeId}/fields`, { fields })).data;
export const getReviewQueue = async () => (await client.get('/api/taxonomy/review-queue')).data;
export const reassignInventoryNode = async (inventoryId: string, taxonomy_node_id: string) =>
    (await client.patch(`/api/taxonomy/inventory/${inventoryId}/node`, { taxonomy_node_id })).data;
export const bulkReassignReview = async (from_node_id: string | null, to_node_id: string) =>
    (await client.patch('/api/taxonomy/review/bulk', { from_node_id, to_node_id })).data;
export const getTaxonomyTree = async () => (await client.get('/public/taxonomy/tree')).data;
export const getNodeFields = async (nodeId: string) => (await client.get(`/public/taxonomy/nodes/${nodeId}/fields`)).data;
```
(If `getTaxonomyTree`/`getNodeFields` already exist, skip those two.)

- [ ] **Step 2: tsc.** `cd frontend && npx tsc --noEmit 2>&1 | grep "api/client" || echo CLEAN` → CLEAN.

---

## Task 3: PropertyTaxonomy page

**Files:** Create `frontend/src/components/PropertyTaxonomy.tsx`

- [ ] **Step 1: Create the component.** Paste complete:
```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
    getTaxonomyTree, getNodeFields, getFieldCatalog, updateNodeFields,
    getReviewQueue, bulkReassignReview, reassignInventoryNode,
} from '../api/client';

interface TreeNode { id: string; name: string; node_kind: string; children: TreeNode[]; }
interface FieldRow { key: string; label: string; input_type: string; required: boolean; options: string[] | null; }

function flattenTypes(tree: TreeNode[]): { id: string; path: string }[] {
    const out: { id: string; path: string }[] = [];
    const walk = (n: TreeNode, anc: string[]) => {
        const path = [...anc, n.name];
        if (n.node_kind === 'TYPE') out.push({ id: n.id, path: path.join(' › ') });
        n.children?.forEach(c => walk(c, path));
    };
    tree.forEach(r => walk(r, []));
    return out;
}

export function PropertyTaxonomy() {
    const { agent } = useAuth();
    const { showToast } = useToast();
    const [tab, setTab] = useState<'fields' | 'review'>('fields');

    if (agent?.role !== 'super_boss') {
        return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Access denied — super boss only.</div>;
    }

    return (
        <div style={{ padding: 20 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>🌳 Property Taxonomy</h1>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Edit per-type fields and clear the classification review queue.</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {(['fields', 'review'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)} style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                        backgroundColor: tab === t ? 'var(--accent-primary)' : 'var(--bg-secondary)', color: tab === t ? '#fff' : 'var(--text-secondary)',
                    }}>{t === 'fields' ? 'Field Schema' : 'Needs Review'}</button>
                ))}
            </div>
            {tab === 'fields' ? <FieldSchemaTab showToast={showToast} /> : <ReviewTab showToast={showToast} />}
        </div>
    );
}

function FieldSchemaTab({ showToast }: { showToast: (m: string, t?: string) => void }) {
    const [types, setTypes] = useState<{ id: string; path: string }[]>([]);
    const [sel, setSel] = useState<string>('');
    const [rows, setRows] = useState<FieldRow[]>([]);
    const [catalog, setCatalog] = useState<{ key: string; label: string; input_type: string }[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getTaxonomyTree().then(d => setTypes(flattenTypes(d.tree || []))).catch(() => {});
        getFieldCatalog().then(d => setCatalog(d.fields || [])).catch(() => {});
    }, []);
    useEffect(() => {
        if (!sel) { setRows([]); return; }
        getNodeFields(sel).then(d => setRows((d.fields || []).map((f: any) => ({ ...f, options: Array.isArray(f.options) ? f.options : null }))));
    }, [sel]);

    const save = async () => {
        setSaving(true);
        try {
            await updateNodeFields(sel, rows.map((r, i) => ({ key: r.key, required: r.required, label_override: r.label, options_override: r.options, display_order: i })));
            showToast('Fields saved', 'success');
        } catch { showToast('Save failed', 'error'); } finally { setSaving(false); }
    };
    const addField = (key: string) => {
        const c = catalog.find(x => x.key === key);
        if (!c || rows.some(r => r.key === key)) return;
        setRows([...rows, { key: c.key, label: c.label, input_type: c.input_type, required: false, options: null }]);
    };

    const inp: React.CSSProperties = { padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12 };
    return (
        <div style={{ display: 'flex', gap: 16 }}>
            <select style={{ ...inp, minWidth: 280, alignSelf: 'flex-start' }} value={sel} onChange={e => setSel(e.target.value)}>
                <option value="">Select a property type…</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.path}</option>)}
            </select>
            {sel && (
                <div style={{ flex: 1 }}>
                    {rows.map((r, i) => (
                        <div key={r.key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, padding: 8, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 90 }}>{r.key}</span>
                            <input style={{ ...inp, flex: 1 }} value={r.label} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="Label (e.g. BHK / Rooms)" />
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}><input type="checkbox" checked={r.required} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, required: e.target.checked } : x))} /> req</label>
                            <input style={{ ...inp, flex: 1 }} value={(r.options || []).join(', ')} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, options: e.target.value ? e.target.value.split(',').map(s => s.trim()) : null } : x))} placeholder="options (comma-sep)" />
                            <button onClick={() => setRows(rows.filter((_, j) => j !== i))} style={{ ...inp, cursor: 'pointer', color: '#ef4444' }}>✕</button>
                        </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <select style={inp} onChange={e => { addField(e.target.value); e.target.value = ''; }} defaultValue="">
                            <option value="">+ Add field…</option>
                            {catalog.filter(c => !rows.some(r => r.key === c.key)).map(c => <option key={c.key} value={c.key}>{c.label} ({c.key})</option>)}
                        </select>
                        <button onClick={save} disabled={saving} style={{ ...inp, cursor: 'pointer', fontWeight: 700, background: '#10b981', color: '#fff', border: 'none' }}>{saving ? 'Saving…' : 'Save fields'}</button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ReviewTab({ showToast }: { showToast: (m: string, t?: string) => void }) {
    const [groups, setGroups] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [types, setTypes] = useState<{ id: string; path: string }[]>([]);
    const [picks, setPicks] = useState<Record<string, string>>({});
    const load = () => getReviewQueue().then(d => { setGroups(d.groups || []); setTotal(d.total || 0); });
    useEffect(() => { load(); getTaxonomyTree().then(d => setTypes(flattenTypes(d.tree || []))); }, []);

    const bulk = async (fromNodeId: string) => {
        const to = picks[fromNodeId];
        if (!to) { showToast('Pick a target type', 'error'); return; }
        try { const r = await bulkReassignReview(fromNodeId === 'none' ? null : fromNodeId, to); showToast(`Reassigned ${r.count}`, 'success'); load(); }
        catch { showToast('Bulk reassign failed', 'error'); }
    };
    const inp: React.CSSProperties = { padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12 };
    return (
        <div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{total} listing(s) need review.</div>
            {groups.map(g => (
                <div key={g.node_id || 'none'} style={{ padding: 12, marginBottom: 10, background: 'var(--bg-secondary)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <b style={{ color: 'var(--text-primary)' }}>{g.count} × {g.node_name}</b>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.sample.map((s: any) => s.title).slice(0, 4).join(' · ')}…</span>
                        <select style={{ ...inp, minWidth: 240, marginLeft: 'auto' }} value={picks[g.node_id || 'none'] || ''} onChange={e => setPicks({ ...picks, [g.node_id || 'none']: e.target.value })}>
                            <option value="">Reassign all to…</option>
                            {types.map(t => <option key={t.id} value={t.id}>{t.path}</option>)}
                        </select>
                        <button onClick={() => bulk(g.node_id || 'none')} style={{ ...inp, cursor: 'pointer', fontWeight: 700, background: 'var(--accent-primary)', color: '#fff', border: 'none' }}>Reassign all {g.count}</button>
                    </div>
                </div>
            ))}
            {total === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>✓ Review queue is clear.</div>}
        </div>
    );
}
```

- [ ] **Step 2: tsc.** `cd frontend && npx tsc --noEmit 2>&1 | grep PropertyTaxonomy || echo CLEAN` → CLEAN.

---

## Task 4: Nav + App wiring (super_boss only)

**Files:** Modify `frontend/src/components/DashboardLayout.tsx`, `frontend/src/App.tsx`

- [ ] **Step 1: Add the nav item** in `DashboardLayout.tsx`. In the "Properties" section's `items` array (where `inventory`/`property-map` are), add:
```tsx
                { id: 'taxonomy', label: 'Property Taxonomy', icon: '🌳', permission: null, superBossOnly: true },
```
Then in the nav-filtering logic, gate `superBossOnly` items by role: find where items are filtered by `permission`/`hasPermission` and add — for any item with `superBossOnly`, only show when `agent?.role === 'super_boss'`. (Read the existing filter; it already has `agent`/`hasPermission` from `useAuth`. Add `&& (!item.superBossOnly || agent?.role === 'super_boss')` to the visibility condition, and add `superBossOnly?: boolean` to the item type.)

- [ ] **Step 2: Add the import + route** in `App.tsx`:
```tsx
import { PropertyTaxonomy } from './components/PropertyTaxonomy';
```
In **both** `renderContent()` and `renderMobileContent()`, add next to `case 'partners':`:
```tsx
      case 'taxonomy':
        return <PropertyTaxonomy />;
```

- [ ] **Step 3: tsc.** `cd frontend && npx tsc --noEmit 2>&1 | grep -E "DashboardLayout|App.tsx" || echo CLEAN` → CLEAN.

---

## Task 5: Deploy + verify

- [ ] **Step 1: SW bump** `frontend/index.html` → `<!-- v20260524c-taxonomy-editor-swbust -->`.
- [ ] **Step 2: Deploy** backend then frontend (`deploy-agent.js`).
- [ ] **Step 3: Server E2E (super_boss JWT).** `GET /api/taxonomy/review-queue` → total ≈180, groups sum to total. `PATCH /api/taxonomy/review/bulk {from_node_id:<Flat node>, to_node_id:<a real flat type>}` → returns count, those drop from a re-fetched queue. `PATCH /api/taxonomy/nodes/:id/fields` with a changed label → `GET /public/taxonomy/nodes/:id/fields` reflects it. **Non-super_boss JWT → 403** on any `/api/taxonomy/*`.
- [ ] **Step 4: Playwright (Chrome closed).** Open Property Taxonomy as super_boss → Field Schema: pick a type, edit a label, Save → toast. Needs Review: pick a target, "Reassign all N" → count drops. Screenshot. (No client sends involved.)
- [ ] **Step 5: GlitchTip clean; update plan status + memory.**

---

## Notes / risk
- All writes are super_boss-gated (`requireSuperBoss`) + reversible (taxonomy_node_id/needs_review/NodeField rows). No consumer reads this yet beyond the form (1d).
- The field-set PATCH replaces a node's NodeField rows (upsert kept + delete removed) in one transaction — re-runnable.
- Read-only tree in v1 (no node CRUD) — keeps scope tight.
- `requireSuperBoss` confirmed at `backend/src/middleware/require_super_boss.ts` (used by partner-reassign).
