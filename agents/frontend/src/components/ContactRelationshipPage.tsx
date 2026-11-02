import { useCallback, useEffect, useRef, useState } from 'react';
import { getContactRelationship } from '../api/client';
import { toDialablePhone } from '../lib/phone';
import { clientRoleLabel } from '../lib/leadDisplay';
import { CONTACT_OPEN_EVENT, navigateFromContact } from '../lib/contactNavigation';
import { InventoryDetailView } from './InventoryDetailView';
import './crmRelationships.css';

export interface Relationship {
    contact: { phone_number: string; name: string | null; email: string | null; contact_type: string; client_role: string | null };
    leads: Array<{ id: string; source: string; source_label?: string | null; source_ref: string | null; status: string; created_at: string;
        demand_budget_min: number | string | null; demand_budget_max: number | string | null; demand_location: string | null }>;
    inventory: Array<{ id: string; display_id: string | null; type: string; location: string | null; city: string | null; relationship: string; relationships?: string[]; status: string }>;
    other_links?: Array<{ id: string; type: string; name: string }>;
    counts?: { leads: number; inventory: number; key_holder: number; deals: number; other: number };
    has_more_relationships?: boolean;
    timeline: Array<{ id: string; event_type: string; content: string | null; created_at: string; metadata?: Record<string, unknown> }>;
    has_more: boolean;
}

const date = (value: string) => new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const money = (value: string | number | null) => value == null ? '—' : `₹${Number(value).toLocaleString('en-IN')}`;

export function ContactRelationshipSections({ data, onDeal, onMember }: { data: Relationship; onDeal: (id: string) => void; onMember: (id: string) => void }) {
    const [inventoryId, setInventoryId] = useState<string | null>(null);
    const has = (item: Relationship['inventory'][number], role: string) => (item.relationships || [item.relationship]).includes(role);
    const owned = data.inventory.filter(i => has(i, 'Owner'));
    const held = data.inventory.filter(i => has(i, 'Key holder'));
    const other = data.inventory.filter(i => has(i, 'Partner') || has(i, 'Enquired'));
    const pipeline = data.leads.filter(l => !['CLOSED_WON', 'CLOSED_LOST'].includes(l.status));
    const renderInventory = (items: Relationship['inventory']) => items.map(item => <button type="button" className="crm-card crm-record-link" key={item.id} onClick={() => setInventoryId(item.id)}>
        <strong>{item.display_id || item.type}</strong><span>{item.type} · {item.location || item.city || 'Location not recorded'} · {item.status}</span>
    </button>);
    const renderLeads = (items: Relationship['leads']) => items.map(lead => <button type="button" className="crm-card crm-record-link" key={lead.id} onClick={() => onDeal(lead.id)}>
        <strong>{lead.source_label || lead.source}{lead.source_ref ? ` · ${lead.source_ref}` : ''}</strong>
        <span>{lead.status.replaceAll('_', ' ')} · {date(lead.created_at)}</span>
        <span>{money(lead.demand_budget_min)} – {money(lead.demand_budget_max)} · {lead.demand_location || 'Location not recorded'}</span>
    </button>);
    const any = data.leads.length || data.inventory.length || data.other_links?.length;
    return <div className="contact-relationship-sections">
        {!any && <p>No accessible relationships for this contact.</p>}
        {!!data.leads.length && <section aria-label="Leads"><h3>Leads ({data.counts?.leads ?? data.leads.length})</h3>{renderLeads(data.leads)}</section>}
        {!!owned.length && <section aria-label="Inventory provided"><h3>Inventory provided ({data.counts?.inventory ?? owned.length})</h3>{renderInventory(owned)}</section>}
        {!!held.length && <section aria-label="Key holder for"><h3>Key holder for ({data.counts?.key_holder ?? held.length})</h3>{renderInventory(held)}</section>}
        {!!pipeline.length && <section aria-label="Deals in pipeline"><h3>Deals in pipeline ({data.counts?.deals ?? pipeline.length})</h3>{renderLeads(pipeline)}</section>}
        {!!(other.length || data.other_links?.length) && <section aria-label="Other links"><h3>Other links ({data.counts?.other ?? other.length + (data.other_links?.length || 0)})</h3>{renderInventory(other)}
            {data.other_links?.map(link => <button type="button" className="crm-card crm-record-link" key={link.id} onClick={() => onMember(link.id)}>{link.type}: {link.name}</button>)}
        </section>}
        {inventoryId && <InventoryDetailView inventoryId={inventoryId} onClose={() => setInventoryId(null)} />}
    </div>;
}

export function ContactRelationshipPage({ phone, onBack, embedded = false }: { phone: string; onBack: () => void; embedded?: boolean }) {
    const [tab, setTab] = useState<'leads' | 'timeline'>('leads');
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
            setData(previous => {
                const merge = <T extends { id: string }>(old: T[], next: T[]) => [...new Map([...old, ...next].map(item => [item.id, item])).values()];
                return nextPage > 1 && previous ? { ...result, leads: merge(previous.leads, result.leads), inventory: merge(previous.inventory, result.inventory), timeline: merge(previous.timeline, result.timeline) } : result;
            });
            setPage(nextPage);
        } catch (e: any) {
            if (request === sequence.current) setError(e.response?.data?.error || 'Could not load contact. Please retry.');
        } finally { if (request === sequence.current) setLoading(false); }
    }, [phone]);
    useEffect(() => { setData(null); setTab('leads'); setPage(1); void load(1); return invalidate; }, [load, invalidate]);
    const tel = toDialablePhone(data?.contact.phone_number);
    return <section className="crm-page relationship-page" aria-label="Contact relationship">
        {!embedded && <header className="crm-header">
            <button type="button" className="crm-button" onClick={onBack}>← Back</button>
            <h1>Contact relationship</h1>
        </header>}
        {error && <div className="crm-error" role="alert">{error} <button className="crm-button" onClick={() => void load(data ? page + 1 : 1)}>Retry</button></div>}
        {!data && loading && <p role="status">Loading contact…</p>}
        {data && <>
            {!embedded && <div className="crm-card">
                <h2>{data.contact.name || 'Unnamed contact'}</h2>
                <p>{tel || 'No dialable phone recorded'}</p>
                <p>{data.contact.email || 'No email recorded'}</p>
                <div className="crm-actions">
                    {Array.from(new Set([clientRoleLabel(data.contact.client_role), data.contact.contact_type.replaceAll('_', ' '), data.inventory.some(i => i.relationship === 'Owner') ? 'Owner' : null])).filter(Boolean).map(tag => <span className="crm-tag" key={tag}>{tag}</span>)}
                </div>
                {tel && <div className="crm-actions"><a className="crm-button" href={`tel:${tel}`}>Call</a><a className="crm-button" href={`https://wa.me/${tel.slice(1)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></div>}
            </div>}
            <nav className="crm-tabs" aria-label="Contact sections">
                {(['leads', 'timeline'] as const).map(key => <button type="button" key={key} className="crm-button" aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{key === 'leads' ? 'Relationships' : 'Timeline'}</button>)}
            </nav>
            {tab === 'leads' && <><ContactRelationshipSections data={data} onDeal={id => navigateFromContact({ entity: 'deals', filter: { deal: id } }, onBack)} onMember={id => navigateFromContact({ entity: 'team', filter: { member: id } }, onBack)} />
                {data.has_more_relationships && <button type="button" className="crm-button" disabled={loading} onClick={() => void load(page + 1)}>{loading ? 'Loading…' : 'Show more relationships'}</button>}
            </>}
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
