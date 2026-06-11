import React, { useEffect, useState } from 'react';
import client from '../api/client';

type PartyType = 'INTERNAL_AGENT' | 'PARTNER_AGENT' | 'PLATFORM';

interface AgentOption {
    id: string;
    name: string;
    role?: string;
}
interface PartnerOption {
    id: string;
    name: string;
    phone_number: string;
}

interface DraftEntry {
    key: string; // local React key
    partyType: PartyType;
    agentId?: string;
    partnerAgentId?: string;
    amount: string; // keep as string in the form; coerced to number on submit
    notes?: string;
    saved?: boolean;
    error?: string;
}

interface Props {
    dealId: string;
    onClose: () => void;
    onSuccess?: () => void;
}

/**
 * DealCloseCommissionDialog — post-close manual commission capture.
 *
 * Each row represents one party's earned slice (platform / internal agent / partner agent).
 * No rigid split is enforced — we pool everything entered. Rows are saved one at a time via
 * POST /api/deals/:id/commission-entries so partial saves are fine.
 *
 * Scenarios per Stage-2 lock:
 *   - 2-party: Partner (inventory) + Platform → typically 50:50
 *   - 3-party: Partner A (inventory) + Partner B (lead) + Platform → pool-then-split
 */
export const DealCloseCommissionDialog: React.FC<Props> = ({ dealId, onClose, onSuccess }) => {
    const [agents, setAgents] = useState<AgentOption[]>([]);
    const [partners, setPartners] = useState<PartnerOption[]>([]);
    const [entries, setEntries] = useState<DraftEntry[]>([
        { key: crypto.randomUUID(), partyType: 'PLATFORM', amount: '' },
    ]);
    const [existing, setExisting] = useState<any[]>([]);
    const [totals, setTotals] = useState<{ total: string; by_party: Record<PartyType, string> } | null>(null);
    const [loadingLookups, setLoadingLookups] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [agentsRes, summaryRes] = await Promise.all([
                    client.get('/api/team/members-list'),
                    client.get(`/api/deals/${dealId}/commission-entries`),
                ]);
                if (cancelled) return;
                setAgents(agentsRes.data || []);
                if (summaryRes.data?.data) {
                    setExisting(summaryRes.data.data.entries || []);
                    setTotals({
                        total: summaryRes.data.data.total,
                        by_party: summaryRes.data.data.by_party,
                    });
                }
            } catch {
                // Non-fatal — lookups just stay empty
            } finally {
                if (!cancelled) setLoadingLookups(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [dealId]);

    const searchPartners = async (q: string) => {
        if (q.length < 2) {
            setPartners([]);
            return;
        }
        try {
            const res = await client.get('/api/partners/search', { params: { q } });
            setPartners(res.data || []);
        } catch {
            setPartners([]);
        }
    };

    const updateEntry = (key: string, patch: Partial<DraftEntry>) => {
        setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
    };

    const addEntry = () => {
        setEntries((prev) => [
            ...prev,
            { key: crypto.randomUUID(), partyType: 'INTERNAL_AGENT', amount: '' },
        ]);
    };

    const removeEntry = (key: string) => {
        setEntries((prev) => prev.filter((e) => e.key !== key));
    };

    const saveEntry = async (entry: DraftEntry) => {
        const amount = parseFloat(entry.amount);
        if (isNaN(amount) || amount <= 0) {
            updateEntry(entry.key, { error: 'Enter a positive amount' });
            return;
        }
        if (entry.partyType === 'INTERNAL_AGENT' && !entry.agentId) {
            updateEntry(entry.key, { error: 'Pick the internal agent' });
            return;
        }
        if (entry.partyType === 'PARTNER_AGENT' && !entry.partnerAgentId) {
            updateEntry(entry.key, { error: 'Pick the partner' });
            return;
        }
        updateEntry(entry.key, { error: undefined });

        try {
            await client.post(`/api/deals/${dealId}/commission-entries`, {
                partyType: entry.partyType,
                agentId: entry.agentId,
                partnerAgentId: entry.partnerAgentId,
                amount,
                notes: entry.notes,
            });
            updateEntry(entry.key, { saved: true, error: undefined });
            // Refresh totals
            const sum = await client.get(`/api/deals/${dealId}/commission-entries`);
            if (sum.data?.data) {
                setExisting(sum.data.data.entries || []);
                setTotals({ total: sum.data.data.total, by_party: sum.data.data.by_party });
            }
        } catch (err: any) {
            updateEntry(entry.key, { error: err?.response?.data?.error || 'Save failed' });
        }
    };

    const pending = entries.filter((e) => !e.saved);

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <h3 style={styles.title}>Commission entries</h3>
                <p style={styles.subtitle}>
                    Record what each party earned on this deal. Rows save independently.
                </p>

                {totals && (
                    <div style={styles.totals}>
                        <Row label="Total pool" value={`₹ ${totals.total}`} bold />
                        <Row label="Partner agents" value={`₹ ${totals.by_party.PARTNER_AGENT}`} />
                        <Row label="Internal agents" value={`₹ ${totals.by_party.INTERNAL_AGENT}`} />
                        <Row label="Platform" value={`₹ ${totals.by_party.PLATFORM}`} />
                    </div>
                )}

                {existing.length > 0 && (
                    <div style={{ margin: '12px 0', fontSize: 12, color: 'var(--text-muted)' }}>
                        {existing.length} entr{existing.length === 1 ? 'y' : 'ies'} already recorded.
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                    {entries.map((entry) => (
                        <EntryRow
                            key={entry.key}
                            entry={entry}
                            agents={agents}
                            partners={partners}
                            onChange={(p) => updateEntry(entry.key, p)}
                            onSearchPartners={searchPartners}
                            onSave={() => saveEntry(entry)}
                            onRemove={() => removeEntry(entry.key)}
                            disabled={loadingLookups}
                        />
                    ))}
                </div>

                <button type="button" onClick={addEntry} style={styles.addBtn}>
                    + Add party
                </button>

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button
                        type="button"
                        onClick={() => {
                            onSuccess?.();
                            onClose();
                        }}
                        style={styles.primaryBtn}
                        disabled={pending.some((e) => !e.saved && e.amount)}
                    >
                        Done
                    </button>
                    <button type="button" onClick={onClose} style={styles.secondaryBtn}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

interface RowProps {
    entry: DraftEntry;
    agents: AgentOption[];
    partners: PartnerOption[];
    onChange: (p: Partial<DraftEntry>) => void;
    onSearchPartners: (q: string) => void;
    onSave: () => void;
    onRemove: () => void;
    disabled: boolean;
}

const EntryRow: React.FC<RowProps> = ({ entry, agents, partners, onChange, onSearchPartners, onSave, onRemove, disabled }) => {
    const [partnerQuery, setPartnerQuery] = useState('');

    return (
        <div style={{ ...styles.entryRow, borderColor: entry.saved ? 'rgba(34,197,94,0.4)' : 'var(--border-secondary)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <select
                    value={entry.partyType}
                    disabled={entry.saved}
                    onChange={(e) => onChange({ partyType: e.target.value as PartyType, agentId: undefined, partnerAgentId: undefined })}
                    style={{ ...styles.input, flex: '1 1 150px' }}
                >
                    <option value="PLATFORM">Platform</option>
                    <option value="INTERNAL_AGENT">Internal agent</option>
                    <option value="PARTNER_AGENT">Partner agent</option>
                </select>

                {entry.partyType === 'INTERNAL_AGENT' && (
                    <select
                        value={entry.agentId || ''}
                        disabled={entry.saved || disabled}
                        onChange={(e) => onChange({ agentId: e.target.value })}
                        style={{ ...styles.input, flex: '1 1 180px' }}
                    >
                        <option value="">Pick agent…</option>
                        {agents.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                )}

                {entry.partyType === 'PARTNER_AGENT' && (
                    <div style={{ flex: '1 1 180px', position: 'relative' }}>
                        <input
                            type="text"
                            value={partnerQuery}
                            disabled={entry.saved}
                            placeholder="Search partner by name/phone"
                            onChange={(e) => {
                                setPartnerQuery(e.target.value);
                                onSearchPartners(e.target.value);
                            }}
                            style={styles.input}
                        />
                        {partners.length > 0 && !entry.saved && (
                            <ul style={styles.dropdown} role="listbox">
                                {partners.map((p) => (
                                    <li
                                        key={p.id}
                                        onClick={() => {
                                            onChange({ partnerAgentId: p.id });
                                            setPartnerQuery(`${p.name} — ${p.phone_number}`);
                                        }}
                                        style={{ padding: '6px 10px', cursor: 'pointer', color: 'var(--text-primary)' }}
                                    >
                                        {p.name} — <span style={{ color: 'var(--text-muted)' }}>{p.phone_number}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                <input
                    type="number"
                    inputMode="decimal"
                    placeholder="Amount (INR)"
                    value={entry.amount}
                    disabled={entry.saved}
                    onChange={(e) => onChange({ amount: e.target.value })}
                    style={{ ...styles.input, flex: '1 1 120px' }}
                />
            </div>

            <input
                type="text"
                placeholder="Notes (optional)"
                value={entry.notes || ''}
                disabled={entry.saved}
                onChange={(e) => onChange({ notes: e.target.value })}
                style={{ ...styles.input, marginTop: 8 }}
            />

            {entry.error && <div style={styles.error}>{entry.error}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {!entry.saved ? (
                    <button type="button" onClick={onSave} style={styles.saveBtn}>Save</button>
                ) : (
                    <span style={styles.savedBadge}>✓ Saved</span>
                )}
                <button type="button" onClick={onRemove} style={styles.removeBtn}>
                    Remove
                </button>
            </div>
        </div>
    );
};

const Row: React.FC<{ label: string; value: string; bold?: boolean }> = ({ label, value, bold }) => (
    <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '4px 0', fontSize: 13,
        fontWeight: bold ? 700 : 500,
        color: bold ? 'var(--text-primary)' : 'var(--text-secondary)',
    }}>
        <span>{label}</span>
        <span>{value}</span>
    </div>
);

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 16,
    },
    modal: {
        backgroundColor: 'var(--bg-primary)', borderRadius: 12, padding: 24,
        width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto',
        border: '1px solid var(--border-secondary)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
    },
    title: {
        margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
    },
    subtitle: {
        margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)',
    },
    totals: {
        padding: '10px 14px', borderRadius: 8,
        backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)',
    },
    entryRow: {
        padding: 12, borderRadius: 8, border: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-secondary)',
    },
    input: {
        padding: '8px 10px', borderRadius: 6, fontSize: 13,
        backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
        border: '1px solid var(--border-secondary)', outline: 'none',
        width: '100%', boxSizing: 'border-box',
    },
    dropdown: {
        position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0,
        listStyle: 'none', margin: 0, padding: '4px 0', zIndex: 20,
        backgroundColor: 'var(--bg-secondary)', borderRadius: 6,
        border: '1px solid var(--border-secondary)', maxHeight: 180, overflowY: 'auto',
    },
    addBtn: {
        marginTop: 12, padding: '8px 14px', borderRadius: 8,
        backgroundColor: 'transparent', color: '#60a5fa',
        border: '1px dashed #3b82f6', fontSize: 13, fontWeight: 600,
        cursor: 'pointer',
    },
    saveBtn: {
        padding: '6px 12px', borderRadius: 6,
        backgroundColor: '#3b82f6', color: '#fff', border: 'none',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
    },
    removeBtn: {
        padding: '6px 12px', borderRadius: 6,
        backgroundColor: 'transparent', color: '#fca5a5',
        border: '1px solid rgba(239,68,68,0.4)',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
    },
    savedBadge: {
        padding: '6px 12px', borderRadius: 6,
        backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e',
        border: '1px solid rgba(34,197,94,0.3)',
        fontSize: 12, fontWeight: 600,
    },
    error: {
        marginTop: 6, padding: '6px 10px', borderRadius: 6, fontSize: 12,
        backgroundColor: 'rgba(239,68,68,0.1)', color: '#fca5a5',
        border: '1px solid rgba(239,68,68,0.3)',
    },
    primaryBtn: {
        padding: '10px 16px', borderRadius: 8,
        backgroundColor: '#22c55e', color: '#fff', border: 'none',
        fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
    secondaryBtn: {
        padding: '10px 16px', borderRadius: 8,
        backgroundColor: 'transparent', color: 'var(--text-secondary)',
        border: '1px solid var(--border-secondary)',
        fontSize: 14, fontWeight: 600, cursor: 'pointer',
    },
};
