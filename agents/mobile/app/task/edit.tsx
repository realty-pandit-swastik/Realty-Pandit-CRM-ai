import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../src/api/client';
import { useApi, useSession } from '../../src/features/auth/SessionProvider';
import { useRecord } from '../../src/features/crm/useRecord';
import { RecordLoading } from '../../src/features/crm/RecordLoading';
import { Button, Failure, Field, FormScreen, Notice } from '../../src/components/Controls';
import { styles } from '../../src/theme/tokens';
import { Choice } from '../../src/features/tasks/Choice';
import { dateWrite, priorities, taskRecordFrom, TaskRecord, taskStatuses, validDay } from '../../src/features/tasks/contracts';
import { invalidateWork } from '../../src/features/tasks/invalidateWork';

export default function EditTask() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useRecord('task', id, `/api/tasks/${encodeURIComponent(id)}`, taskRecordFrom);
  if (query.isPending) return <RecordLoading />;
  if (!query.data) return <Failure error={query.error || new Error('Task unavailable.')} retry={() => { void query.refetch(); }} />;
  return <TaskEditor key={id} task={query.data} />;
}
function TaskEditor({ task }: { task: TaskRecord }) {
  const api = useApi(), { scope, offline } = useSession(), cache = useQueryClient();
  const [title, setTitle] = useState(task.title), [description, setDescription] = useState(task.description || ''), [date, setDate] = useState(task.due_date.slice(0, 10));
  const [status, setStatus] = useState(task.status), [priority, setPriority] = useState(task.priority);
  const save = useMutation({ retry: false, mutationFn: async () => { const saved = await api.request(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'PATCH', body: JSON.stringify({
    title: title.trim(), description, due_date: dateWrite(date, task.due_date), status, priority,
  }) });
    try { return taskRecordFrom(saved); } catch { throw new ApiError('The saved task response could not be verified. Check the current task before trying again.', 0, true); }
  }, onSuccess: async saved => { cache.setQueryData([scope, 'task', saved.id], saved); await invalidateWork(cache, scope); router.dismissTo({ pathname: '/task/[id]', params: { id: task.id } }); } });
  const ambiguous = save.error instanceof ApiError && save.error.ambiguous;
  return <FormScreen><Text style={styles.section}>Edit task</Text><Text style={styles.muted}>Assignment, tags and linked records stay as saved. Dates use the calendar date on the saved record.</Text>
    {offline && <Notice message="Offline. Your input stays on this screen. Reconnect to save." />}
    <Field label="Task title" value={title} onChangeText={setTitle} maxLength={500} editable={!save.isPending} />
    <Field label="Due date (YYYY-MM-DD)" value={date} onChangeText={setDate} autoCorrect={false} maxLength={10} editable={!save.isPending} />
    {!!date && !validDay(date) && <Notice error message="Enter a real date in YYYY-MM-DD format." />}
    <Choice title="Status" value={status} options={taskStatuses} onChange={setStatus} disabled={save.isPending} />
    <Choice title="Priority" value={priority} options={priorities} onChange={setPriority} disabled={save.isPending} />
    <Field label="Description" value={description} onChangeText={setDescription} multiline maxLength={20000} editable={!save.isPending} />
    {save.isError && <Notice error message={save.error.message} />}
    {ambiguous && <Notice message="The save result is uncertain. Open the current task to check what was saved before editing again." />}
    <Button title="Save task" busy={save.isPending} disabled={offline || ambiguous || !title.trim() || !validDay(date)} onPress={() => save.mutate()} />
    <Button title={ambiguous ? 'Check current task' : 'Cancel editing'} secondary disabled={save.isPending} onPress={() => router.dismissTo({ pathname: '/task/[id]', params: { id: task.id } })} />
  </FormScreen>;
}
