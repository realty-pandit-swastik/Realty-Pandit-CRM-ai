/**
 * TaxonomyCascade — Category → Sub-category → Type cascading dropdowns driven by the
 * live taxonomy tree (`GET /public/taxonomy/tree`). Used by the Edit-Inventory editors
 * (desktop InventoryList + mobile) to set `taxonomy_node_id`, mirroring the Add wizard's
 * picker but as a controlled field (value + onChange) that pre-fills from an existing node.
 *
 * onChange fires with the leaf TYPE node id once a leaf is reached, or null while the
 * selection is still mid-tree.
 */
import React, { useEffect, useState } from 'react';
import { getTaxonomyTree } from '../api/client';

interface TaxNode { id: string; name: string; children?: TaxNode[] }

/** Depth-first path (root→…→target) for pre-filling the dropdowns from a saved node. */
function findPath(nodes: TaxNode[], targetId: string): TaxNode[] | null {
    for (const n of nodes) {
        if (n.id === targetId) return [n];
        if (n.children && n.children.length) {
            const sub = findPath(n.children, targetId);
            if (sub) return [n, ...sub];
        }
    }
    return null;
}

export default function TaxonomyCascade({
    value,
    onChange,
    inputStyle,
}: {
    value?: string | null;
    onChange: (nodeId: string | null) => void;
    inputStyle?: React.CSSProperties;
}) {
    const [tree, setTree] = useState<TaxNode[]>([]);
    const [path, setPath] = useState<TaxNode[]>([]);
    const [loadErr, setLoadErr] = useState('');

    useEffect(() => {
        getTaxonomyTree()
            .then((d: any) => {
                const nextTree = d.tree || [];
                setTree(nextTree);
                if (value) {
                    const nextPath = findPath(nextTree, value);
                    if (nextPath) setPath(nextPath);
                }
            })
            .catch((e: any) => setLoadErr(e?.message || 'Failed to load taxonomy'));
    }, []);

    // Build the visible dropdown levels from the current path.
    const levels: TaxNode[][] = [];
    let opts: TaxNode[] = tree;
    for (let i = 0; i <= path.length; i++) {
        if (!opts || opts.length === 0) break;
        levels.push(opts);
        opts = path[i]?.children || [];
    }

    if (loadErr) return <div style={{ color: '#f87171', fontSize: '13px' }}>{loadErr}</div>;

    return (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {levels.map((lvl, i) => (
                <select
                    key={i}
                    value={path[i]?.id || ''}
                    style={inputStyle || { flex: '1 1 180px', minWidth: '160px' }}
                    onChange={e => {
                        const node = lvl.find(n => n.id === e.target.value) || null;
                        const np = path.slice(0, i);
                        if (node) np.push(node);
                        setPath(np);
                        const leaf = np.length ? np[np.length - 1] : null;
                        const leafChosen = !!leaf && (!leaf.children || leaf.children.length === 0);
                        onChange(leafChosen ? leaf!.id : null);
                    }}
                >
                    <option value="">{i === 0 ? 'Category…' : 'Select…'}</option>
                    {lvl.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
            ))}
        </div>
    );
}
