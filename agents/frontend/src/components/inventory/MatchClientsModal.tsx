import React, { useEffect, useState } from 'react';
import { getInventoryMatchingClients, shareToClient, type MatchedClient } from '../../api/client';
import { toDialablePhone } from '../../lib/phone';

interface MatchClientsModalProps {
    inventoryId: string;
    inventoryTitle?: string;
    onClose: () => void;
}

function fmtBudget(min: number | null, max: number | null): string {
    const f = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : `₹${Math.round(n / 1000)}K`);
    if (min && max) return `${f(min)}–${f(max)}`;
    if (max) return `up to ${f(max)}`;
    if (min) return `${f(min)}+`;
    return 'budget N/A';
}

type ShareState = 'sent' | 'error';

/**
 * "Match clients" for an inventory (point 5): lists OPEN deals whose demand matches the listing,
 * lets the agent multi-select and share the property to them via the existing WhatsApp card flow.
 * Shared by the desktop (InventoryList) and PWA (MobileInventoryList) tiles.
 */
export const MatchClientsModal: React.FC<MatchClientsModalProps> = ({ inventoryId, inventoryTitle, onClose }) => {
    const [matches, setMatches] = useState<MatchedClient[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [sharing, setSharing] = useState(false);
    const [results, setResults] = useState<Record<string, { status: ShareState; message: string }>>({});
    const [manager, setManager] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const d = await getInventoryMatchingClients(inventoryId);
                setMatches(d.matches || []);
                setManager(d.inventory_manager || null);
            } catch (e: any) {
                setError(e?.response?.data?.error || 'Failed to find matching clients.');
            } finally {
                setLoading(false);
            }
        })();
    }, [inventoryId]);

    // Selection is keyed by deal_id (a redacted/other-agent lead has no phone to key on).
    const toggle = (dealId: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
        if (next.has(dealId)) next.delete(dealId); else next.add(dealId);
            return next;
        });
    };
    const allSelected = matches.length > 0 && selected.size === matches.length;
    const toggleAll = () => setSelected(allSelected ? new Set() : new Set(matches.map((m) => m.deal_id)));

    const share = async () => {
        if (selected.size === 0) return;
        setSharing(true);
        const next: Record<string, { status: ShareState; message: string }> = { ...results };
        for (const m of matches.filter((x) => selected.has(x.deal_id))) {
            try {
                // Always pass deal_id; include client_phone only when we have it (owned lead).
                // For redacted leads the backend resolves the phone and sends via company WhatsApp.
                await shareToClient(inventoryId, { deal_id: m.deal_id, client_phone: m.contact_phone, client_name: m.contact_name || undefined });
                next[m.deal_id] = { status: 'sent', message: 'Shared on WhatsApp' };
            } catch (e: any) {
                next[m.deal_id] = { status: 'error', message: e?.response?.data?.error || 'Failed' };
            }
            setResults({ ...next });
        }
        setSharing(false);
    };

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'var(--sheet-backdrop, rgba(0,0,0,0.45))', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-clay, 16px)', boxShadow: 'var(--shadow-clay)', border: '1px solid var(--border-secondary)', width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>🔍 Matching Clients</div>
                        {inventoryTitle && <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inventoryTitle}</div>}
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
                    {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>Finding matching clients…</div>}
                    {error && <div style={{ padding: 16, color: '#ef4444', fontSize: 13 }}>{error}</div>}
                    {!loading && !error && matches.length === 0 && (
                        <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: 28, opacity: 0.5 }}>🤷</div>
                            <div style={{ fontSize: 13, marginTop: 8 }}>No open deals currently match this listing's intent, budget and location.</div>
                        </div>
                    )}
                    {!loading && matches.length > 0 && (
                        <>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0 10px', fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                                Select all ({matches.length})
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {matches.map((m) => {
                                    const r = results[m.deal_id];
                                    const tel = m.contact_phone ? toDialablePhone(m.contact_phone) : null;
                                    return (
                                        <div key={m.deal_id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 12, backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)' }}>
                                            <input type="checkbox" checked={selected.has(m.deal_id)} onChange={() => toggle(m.deal_id)} disabled={!!r} style={{ marginTop: 3 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{m.contact_name || tel || 'Client'}</span>
                                                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.12)', borderRadius: 7, padding: '1px 7px' }}>{m.score}% match</span>
                                                </div>
                                                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                                                    {fmtBudget(m.demand_budget_min, m.demand_budget_max)}{m.demand_location ? ` · ${m.demand_location}` : ''} · {m.match_reason}
                                                </div>
                                                {m.lead_manager && (
                                                    <div style={{ fontSize: 11, marginTop: 3, color: 'var(--text-secondary)' }}>
                                                        🧑‍💼 Lead manager: <span style={{ fontWeight: 600 }}>{m.lead_manager}</span>
                                                    </div>
                                                )}
                                                {m.contact_redacted && <div style={{ fontSize: 11, marginTop: 2, color: 'var(--text-muted)' }}>🔒 Contact hidden — share via company WhatsApp</div>}
                                                {r && <div style={{ fontSize: 11, marginTop: 3, color: r.status === 'sent' ? '#22c55e' : '#ef4444' }}>{r.status === 'sent' ? '✅' : '❌'} {r.message}</div>}
                                            </div>
                                            {tel && <a href={`tel:${tel}`} title="Call" style={{ color: '#22c55e', textDecoration: 'none', fontSize: 16 }}>📞</a>}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* Inventory manager — who handles this listing (shown at the very bottom) */}
                {!loading && manager && (
                    <div style={{ padding: '9px 18px', borderTop: '1px solid var(--border-primary)', fontSize: 12, color: 'var(--text-muted)' }}>
                        🧑‍💼 Inventory manager: <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{manager}</span>
                    </div>
                )}

                {/* Footer */}
                {!loading && matches.length > 0 && (
                    <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border-secondary)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }}>Close</button>
                        <button
                            onClick={share}
                            disabled={sharing || selected.size === 0}
                            style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: selected.size === 0 ? 'var(--bg-hover)' : '#25d366', color: selected.size === 0 ? 'var(--text-muted)' : '#fff', fontWeight: 700, cursor: sharing || selected.size === 0 ? 'not-allowed' : 'pointer', opacity: sharing ? 0.7 : 1 }}
                        >
                            {sharing ? 'Sharing…' : `📲 Share to ${selected.size} selected`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
