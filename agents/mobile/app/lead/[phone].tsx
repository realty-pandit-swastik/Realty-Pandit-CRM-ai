import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Text, View } from 'react-native';
import { useState } from 'react';
import { leadFrom } from '../../src/api/contracts';
import { useApi, useSession } from '../../src/features/auth/SessionProvider';
import { useRecord } from '../../src/features/crm/useRecord';
import { Button, Failure, Field, FormScreen, Notice, Row } from '../../src/components/Controls';
import { RecordLoading } from '../../src/features/crm/RecordLoading';
import { styles } from '../../src/theme/tokens';
import { useEncryptedDraft } from '../../src/storage/useEncryptedDraft';
import { leadNotesDraft } from '../../src/storage/draftContracts';
import { ApiError } from '../../src/api/client';

export default function LeadDetail() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const api = useApi(), { scope, offline } = useSession(), cache = useQueryClient();
  const query = useRecord('lead', phone, `/api/leads/${encodeURIComponent(phone)}`, leadFrom);
  const draft = useEncryptedDraft(`lead-notes:${phone}`, leadNotesDraft);
  const [conflict, setConflict] = useState<string | null>(null);
  const notes = draft.draft?.value.notes ?? query.data?.notes ?? '';
  const save = useMutation({ mutationFn: async () => {
    const current = leadFrom(await api.request(`/api/leads/${encodeURIComponent(phone)}`));
    if ((current.notes || '') === notes) return;
    if ((current.notes || '') !== (draft.draft?.value.baseNotes ?? query.data?.notes ?? '')) {
      setConflict(current.notes || '');
      throw new ApiError('The saved notes changed since this draft. Review them before replacing.', 409);
    }
    try { await api.request(`/api/leads/${encodeURIComponent(phone)}/status`, { method: 'PATCH', body: JSON.stringify({ notes, expected_notes: current.notes || '' }) }); }
    catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const latest = leadFrom(await api.request(`/api/leads/${encodeURIComponent(phone)}`)); setConflict(latest.notes || '');
      }
      throw error;
    }
  }, onSuccess: async () => { await cache.invalidateQueries({ queryKey: [scope, 'lead', phone] }); await draft.clear(); setConflict(null); } });
  if (query.isPending) return <RecordLoading />;
  if (query.isError) return <Failure error={query.error} retry={() => { void query.refetch(); }} />;
  const lead = query.data;
  return <FormScreen><Text style={styles.heading}>{lead.name}</Text><Text selectable style={styles.muted}>{lead.phone}</Text>
    <Text style={styles.body}>{[lead.stage, lead.location].filter(Boolean).join(' · ') || 'Requirements have not been captured yet.'}</Text>
    {offline && <Notice message="Offline. You can keep editing this device draft. Reconnect to save notes to the server." />}
    <Field label="Notes" value={notes} onChangeText={value => draft.update({ notes: value, baseNotes: draft.draft?.value.baseNotes ?? lead.notes ?? '' })} editable={draft.ready && !save.isPending} maxLength={20000} multiline />
    {!!draft.status && <Text accessibilityLiveRegion="polite" style={styles.muted}>{draft.status}</Text>}{!!draft.error && <Notice error message={draft.error} />}
    {save.isError && <Notice error message={save.error.message} />}{save.isSuccess && <Notice message="Notes saved." />}
    {conflict !== null && <><Notice message={`Current saved notes: ${conflict || 'No notes'}`} /><Button title="Use my draft to replace saved notes" secondary onPress={() => Alert.alert('Replace saved notes with your draft?', 'Review the current saved notes first. Another update will be checked again before saving.', [
      { text: 'Keep reviewing', style: 'cancel' }, { text: 'Use my draft', onPress: () => { draft.update({ notes, baseNotes: conflict }); setConflict(null); save.reset(); } },
    ])} /></>}
    <Button title="Save notes" busy={save.isPending} disabled={offline || !draft.ready || notes === (lead.notes || '') || conflict !== null} onPress={() => save.mutate()} />
    {draft.draft && <Button title="Discard local draft" disabled={save.isPending} secondary onPress={() => Alert.alert('Discard local draft?', 'Your unsaved notes will be removed from this device. The server record is unchanged.', [
      { text: 'Keep draft', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => { void draft.clear(); setConflict(null); } },
    ])} />}
    <Button title="Refresh lead" secondary disabled={offline || save.isPending} onPress={() => { void query.refetch(); }} />
    <View style={{ gap: 12 }}><Text style={styles.section}>Lead history</Text>{lead.history.length ? lead.history.map(deal => <Row key={deal.id} title={deal.status} subtitle="Open deal" onPress={() => router.push({ pathname: '/deals/[id]', params: { id: deal.id } })} />) : <Text style={styles.muted}>No enquiries recorded.</Text>}</View>
    <View style={{ gap: 12 }}><Text style={styles.section}>Recent conversation</Text>{lead.interactions.length ? lead.interactions.map(item => <Row key={item.id} title={item.channel} subtitle={item.content} detail={new Date(item.date).toLocaleString()} />) : <Text style={styles.muted}>No recent interactions.</Text>}</View>
  </FormScreen>;
}
