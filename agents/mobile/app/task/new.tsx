import { router } from 'expo-router';
import { Alert, Text } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../src/api/client';
import { useApi, useSession } from '../../src/features/auth/SessionProvider';
import { taskFrom } from '../../src/api/contracts';
import { Button, Field, FormScreen, Notice } from '../../src/components/Controls';
import { styles } from '../../src/theme/tokens';
import { useEncryptedDraft } from '../../src/storage/useEncryptedDraft';
import { newTaskDraft } from '../../src/storage/draftContracts';

export default function NewTask() {
  const api = useApi(), { session, scope, offline } = useSession(), cache = useQueryClient();
  const draft = useEncryptedDraft('new-task', newTaskDraft);
  const { title, description, date } = draft.draft?.value ?? { title: '', description: '', date: '' };
  const save = useMutation({ mutationFn: async () => {
    const result = await api.request('/api/tasks', { method: 'POST', body: JSON.stringify({ title: title.trim(), description,
      due_date: date, assigned_to: session!.agent.id, priority: 'MEDIUM', tags: [] }) });
    try { return taskFrom(result); }
    catch { throw new ApiError('The server accepted this task, but its response could not be read. Check your tasks before creating it again.', 0, true); }
  },
    onSuccess: async task => { await cache.invalidateQueries({ queryKey: [scope, 'tasks'] }); if (await draft.clear()) router.replace({ pathname: '/task/[id]', params: { id: task.id } }); } });
  const ambiguous = save.error instanceof ApiError && save.error.ambiguous;
  return <FormScreen><Text style={styles.body}>Assigned to {session!.agent.name}</Text>
    {offline && <Notice message="Offline. You can keep editing this device draft. Reconnect to create the task." />}
    <Field label="Task title" value={title} onChangeText={value => draft.update({ title: value, description, date })} editable={draft.ready && !save.isPending} maxLength={500} autoCapitalize="sentences" />
    <Field label="Due date (YYYY-MM-DD)" value={date} onChangeText={value => draft.update({ title, description, date: value })} editable={draft.ready && !save.isPending} placeholder="2026-10-20" autoCorrect={false} maxLength={10} />
    <Field label="Description" value={description} onChangeText={value => draft.update({ title, description: value, date })} editable={draft.ready && !save.isPending} multiline maxLength={20000} />
    {!!draft.status && <Text accessibilityLiveRegion="polite" style={styles.muted}>{draft.status}</Text>}{!!draft.error && <Notice error message={draft.error} />}
    {save.isError && <Notice error message={save.error.message} />}
    <Button title="Create task" busy={save.isPending} disabled={offline || !draft.ready || save.isSuccess || !title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date) || ambiguous} onPress={() => save.mutate()} />
    {save.isSuccess && <><Notice message="Task created. Open it to review the saved record." /><Button title="Open created task" onPress={() => router.replace({ pathname: '/task/[id]', params: { id: save.data.id } })} /></>}
    {draft.draft && <Text style={styles.muted}>If a previous save was interrupted, check your tasks before creating this draft again.</Text>}
    {ambiguous && <Button title="Check my tasks" secondary onPress={() => router.replace('/(crm)/tasks')} />}
    {draft.draft && <Button title="Discard local draft" disabled={save.isPending} secondary onPress={() => Alert.alert('Discard task draft?', 'Your unsaved task will be removed from this device.', [
      { text: 'Keep draft', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { void draft.clear(); } },
    ])} />}
  </FormScreen>;
}
