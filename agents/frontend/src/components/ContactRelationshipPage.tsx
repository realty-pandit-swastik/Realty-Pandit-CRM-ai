import { useCallback, useEffect, useRef, useState } from 'react';
import { getContactRelationship } from '../api/client';
import { toDialablePhone } from '../lib/phone';
import { clientRoleLabel } from '../lib/leadDisplay';
import { CONTACT_OPEN_EVENT } from '../lib/contactNavigation';
import './crmRelationships.css';

interface Relationship {
    contact: { phone_number: string; name: string | null; email: string | null; contact_type: string; client_role: string | null };
    leads: Array<{ id: string; source: string; source_ref: string | null; status: string; created_at: string;
        demand_budget_min: number | string | null; demand_budget_max: number | string | null; demand_location: string | null }>;
    inventory: Array<{ id: string; display_id: string | null; type: string; location: string | null; city: string | null; relationship: string; status: string }>;
    timeline: Array<{ id: string; event_type: string; content: string | null; created_at: string; metadata?: Record<string, unknown> }>;
    has_more: boolean;
}

const date = (value: string) => new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const money = (value: string | number | null) => value == null ? '—' : `₹${Number(value).toLocaleString('en-IN')}`;

export function ContactRelationshipPage({ phone, onBack }: { phone: string; onBack: () => void }) {
    const [tab, setTab] = useState<'leads' | 'inventory' | 'timeline'>('leads');
    const [data, setData] = useState<Relationship | null>(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const sequence = useRef(0);
    const invalidate = useCallback(() => { sequence.current++; }, []);
    const load = useCallback(async (nextPage: number) => {
        const request = ++sequence.current;
        setLoading(true); setError('');
        try {
            const result: Relationship = await getContactRelationship(phone, nextPage);
            if (request !== sequence.current) return;
            setData(previous => ({ ...result, timeline: nextPage > 1 && previous ? [...previous.timeline, ...result.timeline] : result.timeline }));
            setPage(nextPage);
        } catch (e: any) {
            if (request === sequence.current) setError(e.response?.data?.error || 'Could not load contact. Please retry.');
        } finally { if (request === sequence.current) setLoading(false); }
    }, [phone]);
    useEffect(() => { setData(null); setTab('leads'); setPage(1); void load(1); return invalidate; }, [load, invalidate]);
    const tel = toDialablePhone(data?.contact.phone_number);
    return <section className="crm-page relationship-page" aria-label="Contact relationship">
        <header className="crm-header">
            <button type="button" className="crm-button" onClick={onBack}>← Back</button>
            <h1>Contact relationship</h1>
        </header>
        {error && <div className="crm-error" role="alert">{error} <button className="crm-button" onClick={() => void load(data ? page + 1 : 1)}>Retry</button></div>}
        {!data && loading && <p role="status">Loading contact…</p>}
        {data && <>
            <div className="crm-card">
                <h2>{data.contact.name || 'Unnamed contact'}</h2>
                <p>{tel || 'No dialable phone recorded'}</p>
                <p>{data.contact.email || 'No email recorded'}</p>
                <div className="crm-actions">
                    {Array.from(new Set([clientRoleLabel(data.contact.client_role), data.contact.contact_type.replaceAll('_', ' '), data.inventory.some(i => i.relationship === 'Owner') ? 'Owner' : null])).filter(Boolean).map(tag => <span className="crm-tag" key={tag}>{tag}</span>)}
                </div>
                {tel && <div className="crm-actions"><a className="crm-button" href={`tel:${tel}`}>Call</a><a className="crm-button" href={`https://wa.me/${tel.slice(1)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></div>}
            </div>
            <nav className="crm-tabs" aria-label="Contact sections">
                {(['leads', 'inventory', 'timeline'] as const).map(key => <button type="button" key={key} className="crm-button" aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{key[0].toUpperCase() + key.slice(1)}{key === 'leads' ? ` (${data.leads.length})` : key === 'inventory' ? ` (${data.inventory.length})` : ''}</button>)}
            </nav>
            {tab === 'leads' && <section aria-label="Contact leads">
                {!data.leads.length && <p>No accessible enquiries for this contact.</p>}
                {data.leads.map(lead => <article className="crm-card" key={lead.id}>
                    <h3>{lead.source}{lead.source_ref ? ` · ${lead.source_ref}` : ''}</h3>
                    <p><span className="crm-tag">{lead.status.replaceAll('_', ' ')}</span> · {date(lead.created_at)}</p>
                    <p>{money(lead.demand_budget_min)} – {money(lead.demand_budget_max)}</p>
                    <p>{lead.demand_location || 'Location not recorded'}</p>
                </article>)}
            </section>}
            {tab === 'inventory' && <section aria-label="Contact inventory">
                {!data.inventory.length && <p>No internal inventory is linked to this contact.</p>}
                {data.inventory.map(item => <article className="crm-card" key={item.id}><h3>{item.display_id || item.type}</h3><p>{item.type} · {item.location || item.city || 'Location not recorded'}</p><p>{item.relationship} · {item.status}</p></article>)}
                {data.leads.filter(l => l.source_ref).length > 0 && <div className="crm-card"><h3>Enquired portal properties</h3>{data.leads.filter(l => l.source_ref).map(l => <p key={l.id}>{l.source} · {l.source_ref} · {date(l.created_at)}</p>)}</div>}
            </section>}
            {tab === 'timeline' && <section aria-label="Contact timeline">
                {!data.timeline.length && <p>No recorded activity yet.</p>}
                <ol className="crm-timeline">{data.timeline.map(event => <li className="crm-card" key={event.id}>
                    <h3>{event.content || event.event_type.replaceAll('_', ' ')}</h3><time dateTime={event.created_at}>{date(event.created_at)}</time>
                    {Array.isArray(event.metadata?.sent_inventory_ids) && <p>Inventory: {event.metadata.sent_inventory_ids.join(', ')}</p>}
                </li>)}</ol>
                {data.has_more && <button className="crm-button" disabled={loading} onClick={() => void load(page + 1)}>{loading ? 'Loading…' : 'Load earlier activity'}</button>}
            </section>}
        </>}
    </section>;
}

/** A native modal page keeps every originating list node mounted and inert beneath it.
 * Browser Back removes one relationship history entry, with no list reload or scroll jump. */
export function ContactRelationshipHost() {
    const [phone, setPhone] = useState<string | null>(() => history.state?.relationship || null);
    const dialog = useRef<HTMLDialogElement>(null);
    const previousFocus = useRef<HTMLElement | null>(null);
    const close = useCallback(() => {
        if (history.state?.relationship) history.back(); else setPhone(null);
    }, []);
    useEffect(() => {
        const open = (event: Event) => {
            const detail = (event as CustomEvent<{ phone: string; trigger?: HTMLElement }>).detail;
            const value = detail?.phone;
            if (!value) return;
            previousFocus.current = detail.trigger || document.activeElement as HTMLElement;
            if (history.state?.relationship) history.replaceState({ ...history.state, relationship: value }, '');
            else history.pushState({ ...history.state, relationship: value }, '');
            setPhone(value);
        };
        const pop = () => setPhone(history.state?.relationship || null);
        window.addEventListener(CONTACT_OPEN_EVENT, open);
        window.addEventListener('popstate', pop);
        return () => { window.removeEventListener(CONTACT_OPEN_EVENT, open); window.removeEventListener('popstate', pop); };
    }, []);
    useEffect(() => {
        if (phone && dialog.current && !dialog.current.open) dialog.current.showModal();
        if (!phone && dialog.current?.open) { dialog.current.close(); previousFocus.current?.focus({ preventScroll: true }); }
    }, [phone]);
    return <dialog className="relationship-dialog" ref={dialog} aria-label="Contact relationship" onCancel={event => { event.preventDefault(); close(); }}>
        {phone && <ContactRelationshipPage phone={phone} onBack={close} />}
    </dialog>;
}
