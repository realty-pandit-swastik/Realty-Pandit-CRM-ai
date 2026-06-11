import { useEffect, useRef, useState } from 'react';
import { getInventory } from '../api/client';
import type { AddressValue } from './AddressFields';

/**
 * Add-Property dedup helper: as the user enters an address, search existing inventory (now tokenized
 * so a multi-part address matches in any order) and warn if a similar property already exists —
 * so duplicates are caught before saving. Shows a green "looks new" confirmation when nothing matches.
 * Render only in the ADD flow (in edit it would match the item itself).
 */
interface Match {
    id: string;
    apartment_name?: string | null;
    type?: string | null;
    locality?: string | null;
    city?: string | null;
    display_id?: string | null;
    status?: string | null;
}

export default function DuplicateAddressWarning({ value }: { value: AddressValue }) {
    const [matches, setMatches] = useState<Match[] | null>(null);
    const [loading, setLoading] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const apt = (value.apartment_name || '').toString().trim();
    const loc = (value.locality || '').toString().trim();
    const city = (value.city || '').toString().trim();
    const query = [apt, loc, city].filter(Boolean).join(' ');
    // Only check once there's a meaningful address: a society/apartment name, or locality + city.
    const ready = apt.length >= 3 || (loc.length >= 3 && city.length >= 2);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        if (!ready) { setMatches(null); return; }
        setLoading(true);
        timer.current = setTimeout(async () => {
            try {
                const res: any = await getInventory({ search: query, limit: 5 });
                const data = res?.data && Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
                setMatches(data);
            } catch {
                setMatches(null);
            } finally {
                setLoading(false);
            }
        }, 600);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [query, ready]);

    if (!ready) return null;
    if (loading && matches === null) return <div style={hintMuted}>Checking inventory for duplicates…</div>;
    if (matches === null) return null;
    if (matches.length === 0) return <div style={hintOk}>✓ No similar property found in inventory — looks new.</div>;

    return (
        <div style={hintWarn}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
                ⚠️ {matches.length} similar propert{matches.length === 1 ? 'y' : 'ies'} already in inventory
            </div>
            {matches.map(m => (
                <div key={m.id} style={{ fontSize: 12, padding: '2px 0' }}>
                    • {m.apartment_name || m.type || 'Property'} — {[m.locality, m.city].filter(Boolean).join(', ')}
                    {m.display_id ? ` (${m.display_id})` : ''}
                    {m.status && m.status !== 'active' ? ` [${m.status}]` : ''}
                </div>
            ))}
            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85 }}>Please check these before adding, to avoid a duplicate.</div>
        </div>
    );
}

const hintMuted = { fontSize: 12, color: 'var(--text-muted)', padding: '6px 2px' } as const;
const hintOk = { fontSize: 12, color: '#16a34a', backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '8px 10px', marginTop: 8 } as const;
const hintWarn = { color: '#b45309', backgroundColor: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8, padding: '10px 12px', marginTop: 8 } as const;
