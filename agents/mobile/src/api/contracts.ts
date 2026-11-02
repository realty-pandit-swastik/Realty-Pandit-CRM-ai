import { array, object, string, optionalString, number, ApiError } from './client';

export type Identity = { id: string; tenant_id: string; name: string; email: string; role: 'super_boss' | 'manager' | 'employee'; permissions: string[] };
export type Session = { token: string; refreshToken: string; sessionId: string; agent: Identity };
export type ActiveSession = Omit<Session, 'refreshToken'>;
export function sessionFrom(value: unknown): Session {
  const data = object(value), agent = object(data.agent);
  const role = string(agent.role);
  if (role !== 'super_boss' && role !== 'manager' && role !== 'employee') throw new ApiError('This account type is not yet supported in the native app.');
  return { token: string(data.token), refreshToken: string(data.refreshToken), sessionId: string(data.sessionId), agent: {
    id: string(agent.id), tenant_id: string(agent.tenant_id), name: string(agent.name), email: string(agent.email), role,
    permissions: array(agent.permissions, string),
  } };
}

export type Task = { id: string; title: string; description?: string; status: string; priority: string; due_date: string; contact_phone?: string; project?: string };
export function taskFrom(value: unknown): Task {
  const row = object(value);
  return { id: string(row.id), title: string(row.title), description: optionalString(row.description), status: string(row.status),
    priority: string(row.priority), due_date: string(row.due_date), contact_phone: optionalString(row.contact_phone),
    project: row.project ? optionalString(object(row.project).name) : undefined };
}
export function tasksFrom(value: unknown) {
  const data = object(value); return { rows: array(data.tasks, taskFrom), total: number(data.total) };
}

export type Lead = { phone: string; name: string; stage?: string; location?: string; notes?: string; assignee?: string; history: { id: string; status: string }[]; interactions: { id: string; channel: string; content: string; date: string }[] };
export function leadFrom(value: unknown): Lead {
  const row = object(value);
  const phone = string(row.phone_number);
  return { phone, name: optionalString(row.name) || 'Unnamed lead', stage: optionalString(row.lifecycle_stage), location: optionalString(row.preferred_location),
    notes: optionalString(row.notes), assignee: row.assigned_agent ? optionalString(object(row.assigned_agent).name) : undefined,
    history: row.lead_history ? array(row.lead_history, entry => { const deal = object(entry); return { id: string(deal.id), status: string(deal.status) }; }) : [],
    interactions: row.recent_interactions ? array(row.recent_interactions, entry => { const item = object(entry); return { id: string(item.id), channel: string(item.channel), content: optionalString(item.content) || '', date: string(item.created_at) }; }) : [],
  };
}
export function leadsFrom(value: unknown) { const data = object(value); return { rows: array(data.leads, leadFrom), total: number(data.total) }; }

export { propertyFrom, propertiesFrom } from '../features/inventory/contracts';
export type { Property, PropertyDocument } from '../features/inventory/contracts';
export type Deal = { id: string; status: string; name: string; nextStatuses: string[]; note?: string };
export function dealFrom(value: unknown): Deal {
  const row = object(value), contact = row.demand_contact ? object(row.demand_contact) : null;
  return { id: string(row.id), status: string(row.status), name: contact ? optionalString(contact.name) || 'Unnamed lead' : 'Deal',
    nextStatuses: row.valid_next_statuses ? array(row.valid_next_statuses, string) : [], note: optionalString(row.notes) };
}
export function dealsFrom(value: unknown) { const data = object(value); return { rows: array(data.deals, dealFrom), total: number(object(data.pagination).total) }; }

export type Visit = { id: string; title: string; date: string; status: string; location?: string; contact?: string; notes?: string };
export function visitFrom(value: unknown): Visit {
  const row = object(value), contact = row.contact ? object(row.contact) : null;
  return { id: string(row.id), title: optionalString(row.title) || optionalString(row.type) || 'Appointment', date: string(row.scheduled_at), status: string(row.status),
    location: optionalString(row.location), contact: contact ? optionalString(contact.name) : undefined, notes: optionalString(row.notes) };
}
export function visitsFrom(value: unknown) { const data = object(value); return array(data.appointments, visitFrom); }
