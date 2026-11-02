import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, object } from '../../src/api/client';
import { visitFrom } from '../../src/api/contracts';
import { useRecord } from '../../src/features/crm/useRecord';
import { useApi, useSession } from '../../src/features/auth/SessionProvider';
import { Button, Failure, Field, FormScreen, Notice } from '../../src/components/Controls';
import { RecordLoading } from '../../src/features/crm/RecordLoading';
import { styles } from '../../src/theme/tokens';

export default function Appointment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi(), { scope, offline } = useSession(), cache = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const query = useRecord('visit', id, `/api/calendar/appointments/${encodeURIComponent(id)}`, value => visitFrom(object(value).appointment));
  const notes = draft ?? query.data?.notes ?? '';
  const save = useMutation({ mutationFn: async (status?: string) => {
    const result = await api.request(`/api/calendar/appointments/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status, notes }) });
    try { return visitFrom(object(result).appointment); }
    catch { throw new ApiError('The save response could not be verified. Refresh the appointment before trying again.', 0, true); }
  },
    onSuccess: async () => { await Promise.all(['visit', 'visits', 'home-visits'].map(resource => cache.invalidateQueries({ queryKey: [scope, resource] }))); setDraft(null); } });
  const needsCheck = save.error instanceof ApiError && save.error.ambiguous;
  const refresh = async () => { const result = await query.refetch(); if (!result.isError) save.reset(); };
  const confirm = (title: string, status: string, destructive = false) => Alert.alert(`${title}?`, 'Your notes and the appointment status will be saved.', [
    { text: 'Keep editing', style: 'cancel' }, { text: title, style: destructive ? 'destructive' : 'default', onPress: () => save.mutate(status) },
  ]);
  if (query.isPending) return <RecordLoading />;
  if (query.isError) return <Failure error={query.error} retry={() => { void query.refetch(); }} />;
  const visit = query.data;
  return <FormScreen><Text style={styles.heading}>{visit.title.replaceAll('_', ' ')}</Text>
    {visit.contact && <Text style={styles.section}>{visit.contact}</Text>}
    <Text style={styles.body}>{new Date(visit.date).toLocaleString()}</Text><Text style={styles.muted}>{visit.status.replaceAll('_', ' ')}</Text>
    {visit.location && <Text style={styles.body}>{visit.location}</Text>}
    <Field label="Outcome notes" value={notes} onChangeText={setDraft} multiline maxLength={20000} editable={!save.isPending} />
    {save.isError && <Notice error message={save.error.message} />}{save.isSuccess && <Notice message="Appointment saved." />}
    <Button title="Save notes" busy={save.isPending} disabled={offline || needsCheck || notes === (visit.notes || '')} secondary onPress={() => save.mutate(undefined)} />
    {!['completed', 'cancelled', 'no_show'].includes(visit.status) && <>
      <Button title="Mark complete" disabled={offline || save.isPending || needsCheck} onPress={() => confirm('Mark complete', 'completed')} />
      <Button title="Record no-show" secondary disabled={offline || save.isPending || needsCheck} onPress={() => confirm('Record no-show', 'no_show')} />
      <Button title="Cancel appointment" secondary disabled={offline || save.isPending || needsCheck} onPress={() => confirm('Cancel appointment', 'cancelled', true)} />
    </>}
    <Button title="Refresh appointment" disabled={save.isPending} secondary onPress={() => { void refresh(); }} />
  </FormScreen>;
}
