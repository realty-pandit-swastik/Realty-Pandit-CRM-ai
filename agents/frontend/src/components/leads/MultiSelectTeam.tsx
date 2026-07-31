import React, { useEffect, useMemo, useRef, useState } from 'react';

interface Member { id: string; name: string }

interface Props {
    options: Member[];
    value: string[];
    onChange: (ids: string[]) => void;
    isMobile?: boolean;
    placeholder?: string;
}

/**
 * Searchable multi-select for team members (2026-08-01).
 * Replaces the flat "shared with" chip wall — shows a compact trigger ("N selected"),
 * opens a searchable checkbox list, and renders the current selection as removable chips.
 * Selection is staged; the parent commits it on its single Save.
 */
export default function MultiSelectTeam({ options, value, onChange, isMobile = false, placeholder = 'Add team members…' }: Props) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const selected = useMemo(() => options.filter(o => value.includes(o.id)), [options, value]);
    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        return s ? options.filter(o => o.name.toLowerCase().includes(s)) : options;
    }, [options, q]);

    const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);

    const triggerLabel = selected.length === 0
        ? placeholder
        : selected.length <= 2 ? selected.map(s => s.name).join(', ') : `${selected.length} selected`;

    const trigger: React.CSSProperties = {
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: '8px 10px', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
        border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-secondary)',
        color: selected.length ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 13,
    };
    const popover: React.CSSProperties = {
        position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
        backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-secondary)',
        borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', overflow: 'hidden',
    };
    const searchInput: React.CSSProperties = {
        width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13,
        border: 'none', borderBottom: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none',
    };
    const row = (on: boolean): React.CSSProperties => ({
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer',
        fontSize: 13, color: 'var(--text-primary)',
        backgroundColor: on ? 'rgba(34,197,94,0.10)' : 'transparent',
    });
    const box = (on: boolean): React.CSSProperties => ({
        width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 11, color: '#fff',
        border: on ? '1.5px solid #22c55e' : '1.5px solid var(--border-secondary)',
        backgroundColor: on ? '#22c55e' : 'transparent',
    });

    return (
        <div ref={ref} style={{ position: 'relative', marginTop: 4 }}>
            <button type="button" onClick={() => setOpen(o => !o)} style={trigger}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{triggerLabel}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{open ? '▲' : '▼'}</span>
            </button>

            {selected.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {selected.map(s => (
                        <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, backgroundColor: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.4)' }}>
                            {s.name}
                            <span onClick={() => toggle(s.id)} style={{ cursor: 'pointer', fontWeight: 700, opacity: 0.8 }} title="Remove">×</span>
                        </span>
                    ))}
                </div>
            )}

            {open && (
                <div style={popover}>
                    <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search team…" style={searchInput} />
                    <div style={{ maxHeight: isMobile ? 260 : 240, overflowY: 'auto' }}>
                        {filtered.length === 0 ? (
                            <div style={{ padding: '12px 10px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No team members match “{q}”.</div>
                        ) : filtered.map(o => {
                            const on = value.includes(o.id);
                            return (
                                <div key={o.id} onClick={() => toggle(o.id)} style={row(on)}>
                                    <span style={box(on)}>{on ? '✓' : ''}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderTop: '1px solid var(--border-secondary)' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selected.length} selected</span>
                        <button type="button" onClick={() => setOpen(false)} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', backgroundColor: 'var(--accent-primary)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Done</button>
                    </div>
                </div>
            )}
        </div>
    );
}
