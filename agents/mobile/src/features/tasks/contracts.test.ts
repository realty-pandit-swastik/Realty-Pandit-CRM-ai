import { dateWrite, projectFrom, taskRecordFrom, validDay } from './contracts';
const task = { id: 'synthetic-task', title: 'Synthetic', due_date: '2026-10-20T05:00:00.000Z', status: 'TODO', priority: 'MEDIUM', assigned_to: 'synthetic-agent', project_id: 'synthetic-project', project: { name: 'Synthetic project' }, property_id: 'synthetic-property', contact_phone: '+919000000091', tags: ['keep,comma'] };
it('retains linked context and exact tags while validating canonical task values', () => {
  expect(taskRecordFrom(task)).toMatchObject({ assigned_to: 'synthetic-agent', project_id: 'synthetic-project', property_id: 'synthetic-property', contact_phone: '+919000000091', tags: ['keep,comma'] });
  expect(() => taskRecordFrom({ ...task, priority: 'FUTURE' })).toThrow('unsupported');
  expect(() => taskRecordFrom({ ...task, assigned_to: null })).toThrow();
});
it('validates calendar dates and preserves existing timestamps on unrelated edits', () => {
  expect(validDay('2026-02-30')).toBe(false);
  expect(validDay('2028-02-29')).toBe(true);
  expect(validDay('2026-1-2')).toBe(false);
  expect(validDay('bad')).toBe(false);
  expect(dateWrite('2026-10-20', task.due_date)).toBe(task.due_date);
  expect(dateWrite('2026-10-21', task.due_date)).toBe('2026-10-21');
});
it('parses scoped project counts and keeps owner/member information', () => {
  expect(projectFrom({ id: 'synthetic-project', name: 'Synthetic', status: 'ACTIVE', start_date: task.due_date, end_date: null, owner_id: 'synthetic-agent', team_members: ['synthetic-agent'], _count: { tasks: 2 } })).toMatchObject({ taskCount: 2, owner_id: 'synthetic-agent', team_members: ['synthetic-agent'], end_date: undefined });
});
