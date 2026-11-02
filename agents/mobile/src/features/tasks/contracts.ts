import { array, number, object, optionalString, string, ApiError } from '../../api/client';
import { taskFrom, Task } from '../../api/contracts';

// Canonical values: backend task_scope.ts and Prisma Task/WorkProject fields.
export const taskStatuses = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const;
export const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const projectStatuses = ['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED'] as const;
function choice<T extends string>(value: unknown, options: readonly T[]): T {
  const selected = options.find(option => option === value);
  if (!selected) throw new ApiError('This record has an unsupported status or priority. Refresh or contact your administrator.');
  return selected;
}
export type TaskRecord = Task & { status: typeof taskStatuses[number]; priority: typeof priorities[number]; assigned_to: string; project_id?: string; property_id?: string; tags: string[] };
export function taskRecordFrom(value: unknown): TaskRecord {
  const row = object(value);
  return { ...taskFrom(value), status: choice(row.status, taskStatuses), priority: choice(row.priority, priorities),
    assigned_to: string(row.assigned_to), project_id: optionalString(row.project_id), property_id: optionalString(row.property_id), tags: array(row.tags, string) };
}
export type Project = { id: string; name: string; description?: string; status: typeof projectStatuses[number]; start_date: string; end_date?: string; owner_id?: string; team_members: string[]; taskCount?: number };
export function projectFrom(value: unknown): Project {
  const row = object(value);
  return { id: string(row.id), name: string(row.name), description: optionalString(row.description), status: choice(row.status, projectStatuses),
    start_date: string(row.start_date), end_date: optionalString(row.end_date), owner_id: optionalString(row.owner_id),
    team_members: row.team_members == null ? [] : array(row.team_members, string), taskCount: row._count ? number(object(row._count).tasks) : undefined };
}
export function projectsFrom(value: unknown) { const data = object(value); return { rows: array(data.projects, projectFrom), total: number(data.total) }; }
export function validDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
// Preserve an existing timestamp when only other fields change.
export function dateWrite(day: string, original?: string) { return original?.slice(0, 10) === day ? original : day; }
export function label(value: string) { return value.toLowerCase().replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase()); }
