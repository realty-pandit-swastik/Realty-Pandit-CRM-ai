import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
    getTaxonomyTree, getNodeFields, getFieldCatalog, updateNodeFields,
    getReviewQueue, bulkReassignReview,
} from '../api/client';

interface TreeNode { id: string; name: string; node_kind: string; children: TreeNode[]; }
interface FieldRow { key: string; label: string; input_type: string; required: boolean; options: string[] | null; }

function flattenTypes(tree: TreeNode[]): { id: string; path: string }[] {
    const out: { id: string; path: string }[] = [];
    const walk = (n: TreeNode, anc: string[]) => {
        const path = [...anc, n.name];
        if (n.node_kind === 'TYPE') out.push({ id: n.id, path: path.join(' › ') });
        n.children?.forEach((c) => walk(c, path));
    };
    tree.forEach((r) => walk(r, []));
    return out;
}

export function PropertyTaxonomy() {
    const { agent } = useAuth();
    const [tab, setTab] = useState<'fields' | 'review'>('fields');

    if (agent?.role !== 'super_boss') {
        return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Access denied — super boss only.</div>;
    }

    return (
        <div style={{ padding: 20 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>🌳 Property Taxonomy</h1>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Edit per-type fields and clear the classification review queue.</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {(['fields', 'review'] as const).map((t) => (
                    <button key={t} onClick={() => setTab(t)} style={{
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                        backgroundColor: tab === t ? 'var(--accent-primary)' : 'var(--bg-secondary)', color: tab === t ? '#fff' : 'var(--text-secondary)',
                    }}>{t === 'fields' ? 'Field Schema' : 'Needs Review'}</button>
                ))}
            </div>
            {tab === 'fields' ? <FieldSchemaTab /> : <ReviewTab />}
        </div>
    );
}

function FieldSchemaTab() {
    const { showToast } = useToast();
    const [types, setTypes] = useState<{ id: string; path: string }[]>([]);
    const [sel, setSel] = useState<string>('');
    const [rows, setRows] = useState<FieldRow[]>([]);
    const [catalog, setCatalog] = useState<{ key: string; label: string; input_type: string }[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getTaxonomyTree().then((d) => setTypes(flattenTypes(d.tree || []))).catch(() => {});
        getFieldCatalog().then((d) => setCatalog(d.fields || [])).catch(() => {});
    }, []);
    useEffect(() => {
        if (!sel) { setRows([]); return; }
        getNodeFields(sel).then((d) => setRows((d.fields || []).map((f: any) => ({ ...f, options: Array.isArray(f.options) ? f.options : null }))));
    }, [sel]);

    const save = async () => {
        setSaving(true);
        try {
            await updateNodeFields(sel, rows.map((r, i) => ({ key: r.key, required: r.required, label_override: r.label, options_override: r.options, display_order: i })));
            showToast('Fields saved', 'success');
        } catch { showToast('Save failed', 'error'); } finally { setSaving(false); }
    };
    const addField = (key: string) => {
        const c = catalog.find((x) => x.key === key);
        if (!c || rows.some((r) => r.key === key)) return;
        setRows([...rows, { key: c.key, label: c.label, input_type: c.input_type, required: false, options: null }]);
    };

    const inp: React.CSSProperties = { padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12 };
    return (
        <div style={{ display: 'flex', gap: 16 }}>
            <select style={{ ...inp, minWidth: 280, alignSelf: 'flex-start' }} value={sel} onChange={(e) => setSel(e.target.value)}>
                <option value="">Select a property type…</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.path}</option>)}
            </select>
            {sel && (
                <div style={{ flex: 1 }}>
                    {rows.map((r, i) => (
                        <div key={r.key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, padding: 8, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 90 }}>{r.key}</span>
                            <input style={{ ...inp, flex: 1 }} value={r.label} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="Label (e.g. BHK / Rooms)" />
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}><input type="checkbox" checked={r.required} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, required: e.target.checked } : x))} /> req</label>
                            <input style={{ ...inp, flex: 1 }} value={(r.options || []).join(', ')} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, options: e.target.value ? e.target.value.split(',').map((s) => s.trim()) : null } : x))} placeholder="options (comma-sep)" />
                            <button onClick={() => setRows(rows.filter((_, j) => j !== i))} style={{ ...inp, cursor: 'pointer', color: '#ef4444' }}>✕</button>
                        </div>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <select style={inp} onChange={(e) => { addField(e.target.value); e.target.value = ''; }} defaultValue="">
                            <option value="">+ Add field…</option>
                            {catalog.filter((c) => !rows.some((r) => r.key === c.key)).map((c) => <option key={c.key} value={c.key}>{c.label} ({c.key})</option>)}
                        </select>
                        <button onClick={save} disabled={saving} style={{ ...inp, cursor: 'pointer', fontWeight: 700, background: '#10b981', color: '#fff', border: 'none' }}>{saving ? 'Saving…' : 'Save fields'}</button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ReviewTab() {
    const { showToast } = useToast();
    const [groups, setGroups] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [types, setTypes] = useState<{ id: string; path: string }[]>([]);
    const [picks, setPicks] = useState<Record<string, string>>({});
    const load = () => getReviewQueue().then((d) => { setGroups(d.groups || []); setTotal(d.total || 0); });
    useEffect(() => { load(); getTaxonomyTree().then((d) => setTypes(flattenTypes(d.tree || []))); }, []);

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
            {groups.map((g) => (
                <div key={g.node_id || 'none'} style={{ padding: 12, marginBottom: 10, background: 'var(--bg-secondary)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <b style={{ color: 'var(--text-primary)' }}>{g.count} × {g.node_name}</b>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.sample.map((s: any) => s.title).slice(0, 4).join(' · ')}…</span>
                        <select style={{ ...inp, minWidth: 240, marginLeft: 'auto' }} value={picks[g.node_id || 'none'] || ''} onChange={(e) => setPicks({ ...picks, [g.node_id || 'none']: e.target.value })}>
                            <option value="">Reassign all to…</option>
                            {types.map((t) => <option key={t.id} value={t.id}>{t.path}</option>)}
                        </select>
                        <button onClick={() => bulk(g.node_id || 'none')} style={{ ...inp, cursor: 'pointer', fontWeight: 700, background: 'var(--accent-primary)', color: '#fff', border: 'none' }}>Reassign all {g.count}</button>
                    </div>
                </div>
            ))}
            {total === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>✓ Review queue is clear.</div>}
        </div>
    );
}
