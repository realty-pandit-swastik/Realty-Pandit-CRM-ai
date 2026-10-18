import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import { useApi, useSession } from '../../src/features/auth/SessionProvider';
import { Button, Failure, Field, FormScreen, Loading, Notice } from '../../src/components/Controls';
import { display, ensureSaved, humanize, propertyFrom, valueFrom } from '../../src/features/inventory/contracts';
import { styles } from '../../src/theme/tokens';
import { Members } from '../../src/features/inventory/Members';
import { useInventoryMutation } from '../../src/features/inventory/useInventoryMutation';
import { sharePropertyPdf } from '../../src/features/inventory/attachmentFiles';
import { MatchingClients } from '../../src/features/inventory/MatchingClients';
export default function Actions() {
  const { ids: raw } = useLocalSearchParams<{ ids: string }>(), ids = [...new Set((raw || '').split(',').filter(Boolean))], api = useApi(), { scope, session, controller } = useSession();
  const queries = useQueries({ queries: ids.map(id => ({ queryKey: [scope, 'property', id], queryFn: async ({ signal }: { signal: AbortSignal }) => propertyFrom(await api.request(`/api/inventory/${encodeURIComponent(id)}`, { signal })) })) });
  const m = useInventoryMutation(), [action, setAction] = useState(''), [values, setValues] = useState<Record<string, string>>({}), [members, setMembers] = useState<string[]>([]), [result, setResult] = useState('');
  if (queries.some(q => q.isPending)) return <Loading />;
  const failure = queries.find(q => q.error); if (failure) return <Failure error={failure.error!} retry={() => { queries.forEach(q => { void q.refetch(); }); }} />;
  const properties = queries.flatMap(q => q.data ? [q.data] : []), single = properties.length === 1 ? properties[0] : undefined;
  const allowed = (key: 'edit' | 'share' | 'transfer' | 'ownership' | 'delete' | 'approve') => properties.length > 0 && properties.every(p => p.actions[key]);
  const options = [allowed('edit') ? ['clone', 'enrichment', 'mark_sold', 'mark_on_hold', 'activate', 'withdraw'] : [], allowed('transfer') ? ['assignment'] : [], allowed('share') ? ['team_share_add', 'team_share_remove'] : [], single && allowed('ownership') ? ['transfer_ownership'] : [], single && allowed('approve') ? ['approve', 'reject'] : [], single && allowed('delete') ? ['delete'] : []].flat();
  const fieldKeys = action === 'mark_on_hold' ? ['follow_up_at', 'note'] : action === 'mark_sold' ? ['new_owner_phone', 'new_owner_name', 'final_price', 'reason'] : action === 'transfer_ownership' ? ['new_owner_phone', 'new_owner_name', 'reason'] : action === 'reject' ? ['reason'] : action === 'assignment' ? ['reason'] : [];
  async function commit(signal: AbortSignal) {
    if (action === 'assignment') { setResult(display(valueFrom(ensureSaved(await api.request('/api/inventory/bulk-transfer', { method: 'POST', body: JSON.stringify({ ids, to_agent_id: members[0], reason: values.reason }), signal }))))); return; }
    const outcomes: string[] = [];
    for (const id of ids) {
      let suffix = action.replace(/_/g, '-'), method = 'POST', body: Record<string, unknown> = values;
      if (action === 'clone') body = { clear: (values.clear ?? 'flat_no,plot_no').split(',').filter(Boolean), copy_media: values.copy_media === 'yes' };
      if (action.startsWith('team_share')) { suffix = 'share'; body = { agent_ids: members, action: action.endsWith('add') ? 'add' : 'remove' }; }
      if (action === 'activate' || action === 'withdraw') { suffix = ''; method = 'PATCH'; body = { status: action === 'activate' ? 'active' : 'withdrawn' }; }
      if (action === 'delete') { suffix = ''; method = 'DELETE'; }
      const response = ensureSaved(await api.request(`/api/inventory/${encodeURIComponent(id)}${suffix ? '/' + suffix : ''}`, { method, body: JSON.stringify(body), signal }));
      outcomes.push(`${properties.find(p => p.id === id)?.title}: ${display(valueFrom(response))}`);
    }
    setResult(outcomes.join('\n\n'));
  }
  return <FormScreen><Text style={styles.heading}>Property actions</Text><Text style={styles.body}>{properties.map(p => p.title).join(', ')}</Text>
    {m.error && <Notice error message={m.error} />}{m.uncertain && <Notice error message="This action may have completed. Refresh the properties and check activity before starting another action. No automatic retry was made." />}
    {result ? <><Notice message={result} /><Button title="Return to inventory" onPress={() => router.dismissTo('/(crm)/inventory')} /></> : <>
    {allowed('share') && <Button title="Share properties with a CRM contact" disabled={m.disabled} onPress={() => router.push({ pathname: '/inventory/share', params: { ids: ids.join(',') } })} />}
    <Button title="Generate and share brochure PDF" disabled={m.disabled} onPress={() => { void m.run(async signal => { if (ids.length !== 1) { const { shareInventoryPdf } = await import('../../src/features/inventory/attachmentFiles'); await shareInventoryPdf(api, ids, signal, () => controller?.current?.sessionId === session?.sessionId); } else await sharePropertyPdf(api, ids[0], signal, () => controller?.current?.sessionId === session?.sessionId); setResult('Share sheet closed. Sending is not confirmed.'); }); }} />
    {single && <><MatchingClients propertyId={single.id} /><Button title="Schedule property visit" secondary disabled={m.disabled} onPress={() => router.push({ pathname: '/inventory/visit', params: { id: single.id } })} /></>}
    {options.map(option => <Button key={option} title={humanize(option)} secondary={action !== option} disabled={m.disabled} onPress={() => { if (option === 'enrichment') { router.push({ pathname: '/inventory/form', params: { id: single?.id || ids[0], mode: 'enrichment' } }); return; } setAction(option); setValues({}); setMembers([]); }} />)}
    {!!action && <View style={{ gap: 12 }}><Text style={styles.section}>{humanize(action)}</Text>{fieldKeys.map(k => <Field key={k} label={k === 'follow_up_at' ? 'Follow up date and time (ISO, with timezone)' : humanize(k)} value={values[k] || ''} onChangeText={v => setValues(x => ({ ...x, [k]: v }))} />)}
      {action === 'clone' && <><Text style={styles.label}>Clear these values from the copy</Text>{['flat_no', 'plot_no', 'floor_number', 'floor_label', 'display_floor', 'price', 'customer_price', 'display_price', 'latitude', 'longitude', 'full_address'].map(key => { const selected = (values.clear ?? 'flat_no,plot_no').split(',').filter(Boolean); return <Button key={key} title={`${humanize(key)}${selected.includes(key) ? ' (clear)' : ' (keep)'}`} secondary onPress={() => setValues(v => ({ ...v, clear: (selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]).join(',') }))} />; })}<Button title={`Copy photos and videos: ${values.copy_media === 'yes' ? 'Yes' : 'No'}`} secondary onPress={() => setValues(v => ({ ...v, copy_media: v.copy_media === 'yes' ? 'no' : 'yes' }))} /></>}
      {(action === 'assignment' || action.startsWith('team_share')) && <Members selected={members} onChange={setMembers} multiple={action.startsWith('team_share')} />}
      <Button title={`Confirm ${humanize(action).toLowerCase()}`} busy={m.busy} disabled={m.disabled || ((action === 'assignment' || action.startsWith('team_share')) && !members.length)} onPress={() => Alert.alert(humanize(action), `Apply this change to ${properties.length} selected ${properties.length === 1 ? 'property' : 'properties'}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', style: action === 'delete' ? 'destructive' : 'default', onPress: () => { void m.run(commit); } }])} />
    </View>}</>}
  </FormScreen>;
}
