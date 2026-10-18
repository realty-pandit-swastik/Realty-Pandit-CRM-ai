import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Text } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../src/api/client';
import { useRecord } from '../../src/features/crm/useRecord';
import { useApi, useSession } from '../../src/features/auth/SessionProvider';
import { Button, Failure, FormScreen, Notice } from '../../src/components/Controls';
import { RecordLoading } from '../../src/features/crm/RecordLoading';
import { styles } from '../../src/theme/tokens';
import { label, taskRecordFrom } from '../../src/features/tasks/contracts';
import { invalidateWork } from '../../src/features/tasks/invalidateWork';
export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi(), { scope, offline } = useSession(), cache = useQueryClient();
  const path = `/api/tasks/${encodeURIComponent(id)}`;
  const query = useRecord('task', id, path, taskRecordFrom);
  const complete = useMutation({ retry: false, mutationFn: async () => { const saved = await api.request(path, { method: 'PATCH', body: JSON.stringify({ status: query.data?.status === 'DONE' ? 'TODO' : 'DONE' }) });
      try { return taskRecordFrom(saved); } catch { throw new ApiError('The saved task response could not be verified. Refresh the task before trying again.', 0, true); }
    }, onSuccess: saved => { cache.setQueryData([scope, 'task', id], saved); return invalidateWork(cache, scope); } });
  const remove = useMutation({ retry: false, mutationFn: () => api.request(path, { method: 'DELETE' }), onSuccess: async () => {
    cache.removeQueries({ queryKey: [scope, 'task', id] }); await invalidateWork(cache, scope); router.dismissTo('/(crm)/tasks');
  } });
  const ambiguous = [complete.error, remove.error].some(error => error instanceof ApiError && error.ambiguous);
  const busy = complete.isPending || remove.isPending || query.isFetching;
  if (query.isPending) return <RecordLoading />;
  if (!query.data) return <Failure error={query.error || new Error('Task unavailable.')} retry={() => { void query.refetch(); }} />;
  const task = query.data;
  return <FormScreen><Text style={styles.heading}>{task.title}</Text><Text style={styles.body}>{label(task.status)} · {label(task.priority)}</Text><Text style={styles.muted}>Due {new Date(task.due_date).toLocaleString()}</Text>
    {offline && <Notice message="Offline. Reconnect before changing this task." />}
    {query.isError && <Notice error message={query.error.message} />}
    {task.description && <Text style={styles.body}>{task.description}</Text>}
    {task.tags.length > 0 && <Text style={styles.muted}>Tags: {task.tags.join(', ')}</Text>}
    {task.project_id && <Button title={`Project: ${task.project || 'Open project'}`} secondary onPress={() => router.push({ pathname: '/projects/[id]', params: { id: task.project_id! } })} />}
    {task.contact_phone && <Button title="Open linked lead" secondary onPress={() => router.push({ pathname: '/lead/[phone]', params: { phone: task.contact_phone! } })} />}
    {task.property_id && <Button title="Open linked property" secondary onPress={() => router.push({ pathname: '/inventory/[id]', params: { id: task.property_id! } })} />}
    {complete.isError && <Notice error message={complete.error.message} />}{remove.isError && <Notice error message={remove.error.message} />}
    {ambiguous && <Notice message="The result is uncertain. Refresh the task before another change. If it was deleted, return to Tasks to check the list." />}
    <Button title={task.status === 'DONE' ? 'Reopen task' : 'Mark complete'} busy={complete.isPending} disabled={offline || busy || ambiguous} onPress={() => complete.mutate()} />
    <Button title="Edit task" secondary disabled={offline || busy || ambiguous} onPress={() => router.push({ pathname: '/task/edit', params: { id } })} />
    <Button title="Delete task" secondary disabled={offline || busy || ambiguous} busy={remove.isPending} onPress={() => Alert.alert('Delete task?', `“${task.title}” will be permanently deleted. Linked leads, properties and projects will remain.`, [
      { text: 'Keep task', style: 'cancel' }, { text: 'Delete task', style: 'destructive', onPress: () => remove.mutate() },
    ])} />
    <Button title="Refresh current status" secondary disabled={offline || busy} onPress={async () => { const result = await query.refetch(); if (!result.isError) { complete.reset(); remove.reset(); } }} />
    <Button title="Back to tasks" secondary onPress={() => router.dismissTo('/(crm)/tasks')} />
  </FormScreen>;
}
