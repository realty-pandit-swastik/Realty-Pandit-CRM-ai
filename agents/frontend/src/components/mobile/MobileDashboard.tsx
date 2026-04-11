
// MobileDashboard

interface MobileDashboardProps {
    contacts: any[];
    agentName?: string;
    onSelectContact: (phone: string) => void;
}

const CARD_RADIUS = '12px';
const PADDING = '16px';
const GAP = '12px';

const TYPE_ICON: Record<string, string> = {
    BUYER: '🏠', TENANT: '🛋️', LANDLORD: '🔑', PARTNER_AGENT: '🤝', REAL_ESTATE_BUILDER: '🏗️', MANAGEMENT: '👔', UNKNOWN: '👤',
};
const TYPE_LABEL: Record<string, string> = {
    BUYER: 'Buyer', TENANT: 'Tenant', LANDLORD: 'Landlord', PARTNER_AGENT: 'Partner', REAL_ESTATE_BUILDER: 'Builder', MANAGEMENT: 'Team', UNKNOWN: '?',
};

export function MobileDashboard({ contacts, agentName, onSelectContact }: MobileDashboardProps) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const firstName = agentName?.split(' ')[0] || 'there';

    const total = contacts.length;
    const hot = contacts.filter(c => (c.lead_score?.total_score ?? 0) >= 70).length;
    const warm = contacts.filter(c => { const s = c.lead_score?.total_score ?? 0; return s >= 40 && s < 70; }).length;

    const recent = [...contacts]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 8);

    return (
        <div style={{ padding: PADDING, display: 'flex', flexDirection: 'column', gap: GAP }}>
            {/* Greeting */}
            <div>
                <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text-primary)' }}>
                    {greeting}, {firstName} 👋
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                    {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
            </div>

            {/* Stat Cards — 3 in a row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: GAP }}>
                <StatCard label="Total" value={total} color="#4F46E5" bg="#1e3a5f" />
                <StatCard label="Hot" value={hot} color="#f87171" bg="#7f1d1d" icon="🔥" />
                <StatCard label="Warm" value={warm} color="#4ade80" bg="#14532d" icon="🟢" />
            </div>

            {/* Recent Contacts */}
            {recent.length > 0 && (
                <div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
                        Recent Contacts
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {recent.map(c => (
                            <div
                                key={c.phone_number}
                                onClick={() => onSelectContact(c.phone_number)}
                                style={{
                                    backgroundColor: 'var(--bg-secondary)', borderRadius: CARD_RADIUS,
                                    padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px',
                                    border: '1px solid var(--border-secondary)', cursor: 'pointer',
                                }}
                            >
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '50%',
                                    backgroundColor: 'var(--bg-primary)', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontSize: '18px', flexShrink: 0,
                                }}>
                                    {TYPE_ICON[c.contact_type] || '👤'}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {c.name || c.phone_number}
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>
                                        {TYPE_LABEL[c.contact_type] || '?'} · {c.lead_status}
                                    </div>
                                </div>
                                {c.lead_score?.total_score != null && (
                                    <div style={{
                                        backgroundColor: c.lead_score.total_score >= 70 ? '#7f1d1d' : c.lead_score.total_score >= 40 ? '#14532d' : 'var(--bg-primary)',
                                        color: c.lead_score.total_score >= 70 ? '#f87171' : c.lead_score.total_score >= 40 ? '#4ade80' : 'var(--text-muted)',
                                        padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
                                    }}>
                                        {c.lead_score.total_score}
                                    </div>
                                )}
                                <span style={{ color: 'var(--text-muted)', fontSize: '16px' }}>›</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value, color, bg, icon }: { label: string; value: number; color: string; bg: string; icon?: string }) {
    return (
        <div style={{
            backgroundColor: bg, borderRadius: CARD_RADIUS, padding: '14px 10px',
            textAlign: 'center', border: `1px solid ${color}33`,
        }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {icon ? `${icon} ` : ''}{label}
            </div>
        </div>
    );
}
