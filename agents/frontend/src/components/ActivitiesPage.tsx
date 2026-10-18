import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CalendarDays, ListChecks, MessageCircle, Phone, Send } from 'lucide-react';
import { getActivities, updateActivity } from '../api/client';
import { toDialablePhone } from '../lib/phone';
import { openContactRelationship } from '../lib/contactNavigation';
import { useToast } from '../contexts/ToastContext';
import { ContactSearchField, type SelectedContact } from './ContactSearchField';
import TaskBoard from './TaskBoard';
import LeadWorkflowPage from './LeadWorkflowPage';
import './crmRelationships.css';

type Group = 'overdue' | 'today' | 'upcoming' | 'done';
interface Activity {
    id: string; kind: string; title: string; type: string; due_at: string; done: boolean;
    contact: { phone_number: string; name: string | null } | null;
    deal_id: string | null; inventory_id: string | null; workflow: boolean;
}
interface GroupData { items: Activity[]; has_more: boolean; total: number; page: number }
const groups: Group[] = ['overdue', 'today', 'upcoming', 'done'];
const groupLabels: Record<Group, string> = { overdue: 'Overdue', today: 'Today', upcoming: 'Upcoming', done: 'Done' };
const icons: Record<string, typeof Phone> = { call: Phone, visit: CalendarDays, followup: Bell, matching: Send, whatsapp: MessageCircle, other: ListChecks };
const emptyGroup = (): GroupData => ({ items: [], has_more: false, total: 0, page: 1 });
const emptyGroups = (): Record<Group, GroupData> => ({ overdue: emptyGroup(), today: emptyGroup(), upcoming: emptyGroup(), done: emptyGroup() });

export function ActivitiesPage() {
    const { showToast } = useToast();
    const [data, setData] = useState(emptyGroups);
    const [type, setType] = useState('');
    const [contact, setContact] = useState<SelectedContact | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [reschedule, setReschedule] = useState<string | null>(null);
    const [when, setWhen] = useState('');
    const [projects, setProjects] = useState(false);
    const [workflowTask, setWorkflowTask] = useState<string | null>(null);
    const request = useRef(0);
    const invalidate = useCallback(() => { request.current++; }, []);
    const lock = useRef(false);
    const load = useCallback(async () => {
        const sequence = ++request.current;
        setLoading(true); setError('');
        try {
            const results = await Promise.all(groups.map(async group => [group, { ...await getActivities({ group, type, contact: contact?.phone || '', page: 1 }), page: 1 }]));
            if (sequence === request.current) setData(Object.fromEntries(results));
        } catch (e: any) { if (sequence === request.current) setError(e.response?.data?.error || 'Could not load activities. Please retry.'); }
        finally { if (sequence === request.current) setLoading(false); }
    }, [type, contact?.phone]);
    useEffect(() => {
        void load(); const timer = setInterval(() => void load(), 60000);
        return () => { clearInterval(timer); invalidate(); };
    }, [load, invalidate]);

    const more = async (group: Group) => {
        if (lock.current) return;
        lock.current = true; setBusy(`more:${group}`);
        const sequence = request.current;
        try {
            const page = data[group].page + 1;
            const result = await getActivities({ group, type, contact: contact?.phone || '', page });
            if (sequence === request.current) setData(prev => ({ ...prev, [group]: { ...result, page, items: [...prev[group].items, ...result.items] } }));
        } catch { showToast('Could not load more activities. Please retry.', 'error'); }
        finally { lock.current = false; setBusy(null); }
    };
    const act = async (item: Activity, action: 'complete' | 'reschedule') => {
        if (lock.current) return;
        if (action === 'reschedule' && (!when || new Date(when).getTime() <= Date.now())) { showToast('Choose a future date and time.', 'error'); return; }
        lock.current = true; setBusy(`${item.kind}:${item.id}`);
        try {
            await updateActivity(item.kind, item.id, { action, ...(action === 'reschedule' ? { scheduled_at: new Date(when).toISOString() } : {}) });
            setReschedule(null); setWhen('');
            showToast(action === 'complete' ? 'Activity completed' : 'Activity rescheduled');
            await load();
        } catch (e: any) { showToast(e.response?.data?.error || 'Could not update activity. Please retry.', 'error'); }
        finally { lock.current = false; setBusy(null); }
    };
    if (projects) return <div className="crm-page"><button className="crm-button" onClick={() => setProjects(false)}>← All activities</button><TaskBoard /></div>;
    if (workflowTask) return <div className="crm-page"><button className="crm-button" onClick={() => { setWorkflowTask(null); void load(); }}>← All activities</button><LeadWorkflowPage initialTaskId={workflowTask} onTaskCompleted={() => { setWorkflowTask(null); void load(); }} /></div>;
    return <main className="crm-page" style={{ width: '100%', overflowY: 'auto' }}>
        <header className="crm-header"><h1>Tasks</h1><button className="crm-button" onClick={() => void load()} disabled={loading}>Refresh</button><button className="crm-button" onClick={() => setProjects(true)}>Projects / add task</button></header>
        <div className="crm-filters">
            <label>Activity type<select value={type} onChange={e => setType(e.target.value)}><option value="">All activities</option><option value="call">Calls</option><option value="followup">Reminders / follow-ups</option><option value="matching">Send matching</option><option value="visit">Visits / meetings</option><option value="whatsapp">WhatsApp</option><option value="other">Other</option></select></label>
            <div style={{ flex: 1, minWidth: 200 }}><ContactSearchField key={contact ? 'selected' : 'search'} autoFocus={false} allowCreate={false} label="Filter by contact" onContactSelected={setContact} />{contact && <button className="crm-button" onClick={() => setContact(null)}>Clear {contact.name || contact.phone}</button>}</div>
        </div>
        <p style={{ color: 'var(--text-secondary)' }}>Grouped in India time (IST). Scheduled work from Leads, Pipeline and Visits appears here.</p>
        {loading && <p role="status">Refreshing activities…</p>}
        {error && <div className="crm-error" role="alert">{error} <button className="crm-button" onClick={() => void load()}>Retry</button></div>}
        {!error && groups.map(group => <section aria-label={groupLabels[group]} key={group}>
            <h2>{groupLabels[group]} ({data[group].total})</h2>
            {!loading && !data[group].items.length && <p>No {groupLabels[group].toLowerCase()} activities.</p>}
            {data[group].items.map(item => {
                const tel = toDialablePhone(item.contact?.phone_number);
                const Icon = icons[item.type] || ListChecks;
                const key = `${item.kind}:${item.id}`;
                return <article className="crm-card" key={key}>
                    <h3><Icon aria-hidden="true" size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />{item.title}</h3>
                    {item.contact ? <button className="crm-button" onClick={event => openContactRelationship(item.contact!.phone_number, event.currentTarget)}>{item.contact.name || tel || 'Contact without phone'}</button> : <p>No contact linked</p>}
                    <p><time dateTime={item.due_at}>{new Date(item.due_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST</time></p>
                    {(item.deal_id || item.inventory_id) && <p>{item.deal_id ? `Lead ${item.deal_id}` : ''}{item.inventory_id ? ` · Inventory ${item.inventory_id}` : ''}</p>}
                    {!item.done && <div className="crm-actions">
                        {tel && <><a className="crm-button" href={`tel:${tel}`}>Call</a><a className="crm-button" href={`https://wa.me/${tel.slice(1)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}
                        {item.workflow ? <button className="crm-button" onClick={() => setWorkflowTask(item.id)}>Open workflow</button>
                            : <button className="crm-button" disabled={!!busy} onClick={() => void act(item, 'complete')}>{busy === key ? 'Saving…' : 'Mark done'}</button>}
                        <button className="crm-button" disabled={!!busy} onClick={() => { setReschedule(reschedule === key ? null : key); setWhen(''); }}>Reschedule</button>
                    </div>}
                    {reschedule === key && <form onSubmit={event => { event.preventDefault(); void act(item, 'reschedule'); }}>
                        <label>New date/time ({Intl.DateTimeFormat().resolvedOptions().timeZone})<input type="datetime-local" required value={when} onChange={e => setWhen(e.target.value)} /></label>
                        <div className="crm-actions"><button className="crm-button" type="submit" disabled={!!busy}>Save date</button><button className="crm-button" type="button" onClick={() => setReschedule(null)}>Cancel</button></div>
                    </form>}
                </article>;
            })}
            {data[group].has_more && <button className="crm-button" disabled={!!busy} onClick={() => void more(group)}>{busy === `more:${group}` ? 'Loading…' : `More ${groupLabels[group].toLowerCase()}`}</button>}
        </section>)}
    </main>;
}
