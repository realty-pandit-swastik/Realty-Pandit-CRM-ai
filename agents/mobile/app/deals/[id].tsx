import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { object } from '../../src/api/client';
import { dealFrom } from '../../src/api/contracts';
import { useRecord } from '../../src/features/crm/useRecord';
import { useApi, useSession } from '../../src/features/auth/SessionProvider';
import { Button, Failure, FormScreen, Notice } from '../../src/components/Controls';
import { RecordLoading } from '../../src/features/crm/RecordLoading';
import { styles } from '../../src/theme/tokens';

export default function DealDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi(), { scope, offline } = useSession(), cache = useQueryClient();
  const query = useRecord('deal', id, `/api/deals/${encodeURIComponent(id)}`, value => dealFrom(object(value).data));
  const transition = useMutation({ mutationFn: (status: string) => api.request(`/api/deals/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: async () => { await Promise.all([cache.invalidateQueries({ queryKey: [scope, 'deal', id] }), cache.invalidateQueries({ queryKey: [scope, 'deals'] })]); } });
  if (query.isPending) return <RecordLoading />;
  if (query.isError) return <Failure error={query.error} retry={() => { void query.refetch(); }} />;
  const deal = query.data;
  return <FormScreen><Text style={styles.heading}>{deal.name}</Text><Text style={styles.section}>{deal.status}</Text>{deal.note && <Text style={styles.body}>{deal.note}</Text>}
    <Notice message="Stage changes follow the current server rules. Closing and visit outcomes require their dedicated forms." />
    {transition.isError && <Notice error message={transition.error.message} />}
    <View style={{ gap: 12 }}>{deal.nextStatuses.filter(status => !['CLOSED_WON', 'CLOSED_LOST', 'VISITED', 'VISIT_SCHEDULED'].includes(status)).map(status => <Button key={status} title={`Move to ${status.replaceAll('_', ' ').toLowerCase()}`}
      disabled={offline || transition.isPending} busy={transition.isPending && transition.variables === status} onPress={() => transition.mutate(status)} />)}</View>
    <Button title="Refresh current stage" secondary onPress={() => { void query.refetch(); }} />
  </FormScreen>;
}
