import { useEffect, useState } from 'react';
import PhoneInput from './PhoneInput';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import {
    getPartnerTeam, addPartnerTeamMember, updatePartnerTeamMember,
    type PartnerTeamMember,
} from '../api/client';

/**
 * MY TEAM — a partner COMPANY owner manages their own sub-agents. (2026-07-13)
 *
 * Only rendered for `isPartnerOwner` (see DashboardLayout nav gating); the server enforces the same
 * rule (requirePartnerOwner), so hiding the screen is UX, not the control.
 *
 * A member added here can sign in IMMEDIATELY at this same URL with their phone number (WhatsApp OTP) —
 * there is no invite to send and no password to set.
 */
export function MyTeam() {
    const { isPartnerOwner } = useAuth();
    const { showToast } = useToast();
    const confirm = useConfirm();

    const [members, setMembers] = useState<PartnerTeamMember[] | null>(null);
    const [error, setError] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ name: '', phone: '', email: '' });
    const [busy, setBusy] = useState(false);

    const load = () => {
        getPartnerTeam()
            .then(r => setMembers(r.members || []))
            .catch(e => setError(e.response?.data?.error || 'Could not load your team.'));
    };
    useEffect(() => { if (isPartnerOwner) load(); }, [isPartnerOwner]);

    if (!isPartnerOwner) {
        return <div style={s.page}><p style={s.muted}>This section is only available to company partner owners.</p></div>;
    }

    const submit = async () => {
        if (!form.name.trim() || !form.phone.trim()) {
            showToast('Name and phone are required.', 'error');
            return;
        }
        setBusy(true);
        try {
            await addPartnerTeamMember({
                name: form.name.trim(),
                phone: form.phone.trim(),
                email: form.email.trim() || undefined,
            });
            showToast(`${form.name.trim()} added. They can sign in with their phone number.`, 'success');
            setForm({ name: '', phone: '', email: '' });
            setShowAdd(false);
            setMembers(null);
            load();
        } catch (e: any) {
            showToast(e.response?.data?.error || 'Could not add team member.', 'error');
        }
        setBusy(false);
    };

    const toggleStatus = async (m: PartnerTeamMember) => {
        const suspending = m.status === 'ACTIVE';
        const assigned = m.assigned_leads + m.assigned_deals + m.assigned_listings;
        const ok = await confirm(
            suspending
                ? `Suspend ${m.name}? They will not be able to sign in.` +
                  (assigned > 0 ? ` Their ${assigned} assigned item(s) stay visible to you.` : '')
                : `Reactivate ${m.name}? They will be able to sign in again.`,
        );
        if (!ok) return;
        try {
            await updatePartnerTeamMember(m.id, { status: suspending ? 'SUSPENDED' : 'ACTIVE' });
            showToast(suspending ? `${m.name} suspended.` : `${m.name} reactivated.`, 'success');
            setMembers(null);
            load();
        } catch (e: any) {
            showToast(e.response?.data?.error || 'Could not update member.', 'error');
        }
    };

    return (
        <div style={s.page}>
            <div style={s.header}>
                <div>
                    <h2 style={s.h2}>My Team</h2>
                    <p style={s.sub}>
                        Your own agents. Assign them leads, deals and listings — they only ever see what you
                        give them. They sign in at this same address with their phone number.
                    </p>
                </div>
                <button style={s.primaryBtn} onClick={() => setShowAdd(v => !v)}>
                    {showAdd ? 'Cancel' : '+ Add team member'}
                </button>
            </div>

            {error && <div style={s.error}>{error}</div>}

            {showAdd && (
                <div style={s.card}>
                    <div style={s.formRow}>
                        <div style={s.field}>
                            <label style={s.label}>Name</label>
                            <input style={s.input} value={form.name} placeholder="e.g. Ramesh Kumar"
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div style={s.field}>
                            <label style={s.label}>WhatsApp number</label>
                            <PhoneInput style={s.input} value={form.phone} placeholder="9876543210"
                                onChange={v => setForm(f => ({ ...f, phone: v }))} />
                        </div>
                        <div style={s.field}>
                            <label style={s.label}>Email (optional)</label>
                            <input style={s.input} value={form.email} placeholder="name@example.com"
                                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                        </div>
                    </div>
                    <button style={{ ...s.primaryBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>
                        {busy ? 'Adding…' : 'Add member'}
                    </button>
                    <p style={s.hint}>
                        They can sign in straight away — no invite or password needed. We'll WhatsApp them a
                        code when they enter this number.
                    </p>
                </div>
            )}

            {members === null ? (
                <p style={s.muted}>Loading your team…</p>
            ) : members.length === 0 ? (
                <div style={s.card}>
                    <p style={{ ...s.muted, margin: 0 }}>
                        You haven't added anyone yet. Add a team member and you'll be able to assign them your
                        leads, deals and listings.
                    </p>
                </div>
            ) : (
                <div style={s.list}>
                    {members.map(m => (
                        <div key={m.id} style={s.row}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={s.rowTop}>
                                    <span style={s.name}>{m.name}</span>
                                    <span style={m.status === 'ACTIVE' ? s.badgeActive : s.badgeSuspended}>
                                        {m.status === 'ACTIVE' ? 'Active' : 'Suspended'}
                                    </span>
                                </div>
                                <div style={s.meta}>
                                    {m.phone_number}{m.email ? ` · ${m.email}` : ''}
                                </div>
                                <div style={s.counts}>
                                    <span>{m.assigned_leads} leads</span>
                                    <span>{m.assigned_deals} deals</span>
                                    <span>{m.assigned_listings} listings</span>
                                </div>
                            </div>
                            <button
                                style={m.status === 'ACTIVE' ? s.dangerBtn : s.ghostBtn}
                                onClick={() => toggleStatus(m)}
                            >
                                {m.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

const s: Record<string, any> = {
    page: { flex: 1, overflowY: 'auto', padding: '28px 32px', backgroundColor: 'var(--bg-primary)' },
    header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' },
    h2: { color: 'var(--text-primary)', fontSize: '22px', fontWeight: 700, margin: 0 },
    sub: { color: 'var(--text-muted)', fontSize: '13px', margin: '6px 0 0', maxWidth: '620px', lineHeight: 1.5 },
    primaryBtn: { padding: '10px 18px', borderRadius: '10px', border: 'none', backgroundColor: '#3b82f6', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
    ghostBtn: { padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' },
    dangerBtn: { padding: '8px 14px', borderRadius: '8px', border: '1px solid #f87171', backgroundColor: 'transparent', color: '#f87171', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' },
    card: { backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: '12px', padding: '18px', marginBottom: '18px' },
    formRow: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' },
    field: { flex: '1 1 180px', minWidth: 0 },
    label: { display: 'block', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, marginBottom: '5px' },
    input: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-secondary)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box' },
    hint: { color: 'var(--text-muted)', fontSize: '12px', margin: '10px 0 0' },
    list: { display: 'flex', flexDirection: 'column', gap: '10px' },
    row: { display: 'flex', alignItems: 'center', gap: '14px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: '12px', padding: '14px 16px' },
    rowTop: { display: 'flex', alignItems: 'center', gap: '10px' },
    name: { color: 'var(--text-primary)', fontWeight: 600, fontSize: '15px' },
    meta: { color: 'var(--text-muted)', fontSize: '13px', marginTop: '3px' },
    counts: { display: 'flex', gap: '14px', marginTop: '6px', color: 'var(--text-secondary)', fontSize: '12px' },
    badgeActive: { fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80' },
    badgeSuspended: { fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', backgroundColor: 'rgba(248,113,113,0.15)', color: '#f87171' },
    muted: { color: 'var(--text-muted)', fontSize: '14px' },
    error: { color: '#f87171', fontSize: '13px', marginBottom: '14px' },
};
