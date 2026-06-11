'use client';
import { useEffect, useState } from 'react';
import { getTaxonomyTree, type TaxonomyTreeNode } from '@/lib/api';

// Phase 1d v2: cascading Category → Sub → [Group] → Type picker for the post-property chat.
// Submits the chosen leaf TYPE node id as a plain string via onSubmit (wired to sendQuickReply).
export default function ChatTaxonomyPicker({ onSubmit, sending }: { onSubmit: (v: string) => void; sending: boolean }) {
    const [tree, setTree] = useState<TaxonomyTreeNode[]>([]);
    const [path, setPath] = useState<TaxonomyTreeNode[]>([]);
    const [err, setErr] = useState('');

    useEffect(() => {
        getTaxonomyTree().then(setTree).catch((e) => setErr(e?.message || 'Failed to load property types'));
    }, []);

    const levels: TaxonomyTreeNode[][] = [];
    let opts: TaxonomyTreeNode[] = tree;
    for (let i = 0; i <= path.length; i++) {
        if (!opts || opts.length === 0) break;
        levels.push(opts);
        opts = path[i]?.children || [];
    }
    const leaf = path.length > 0 ? path[path.length - 1] : null;
    const leafChosen = !!leaf && (!leaf.children || leaf.children.length === 0);

    if (err) return <div className="text-sm text-red-600">{err}</div>;

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                {levels.map((lvl, i) => (
                    <select
                        key={i}
                        value={path[i]?.id || ''}
                        disabled={sending}
                        className="flex-1 min-w-[150px] rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                        onChange={(e) => {
                            const node = lvl.find((n) => n.id === e.target.value) || null;
                            const np = path.slice(0, i);
                            if (node) np.push(node);
                            setPath(np);
                        }}
                    >
                        <option value="">{i === 0 ? 'Category…' : 'Select…'}</option>
                        {lvl.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                    </select>
                ))}
            </div>
            <button
                disabled={!leafChosen || sending}
                onClick={() => leaf && onSubmit(leaf.id)}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
                {leafChosen ? 'Continue →' : 'Pick a property type'}
            </button>
        </div>
    );
}
