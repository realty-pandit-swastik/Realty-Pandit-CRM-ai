import { object, string } from '../api/client';

export function leadNotesDraft(value: unknown) {
  const fields = object(value);
  return { notes: string(fields.notes), baseNotes: string(fields.baseNotes) };
}
export function newTaskDraft(value: unknown) {
  const fields = object(value);
  return { title: string(fields.title), description: string(fields.description), date: string(fields.date) };
}
