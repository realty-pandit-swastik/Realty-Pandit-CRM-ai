import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Text, View } from 'react-native';
import { array, object, string } from '../src/api/client';
import { useRecord } from '../src/features/crm/useRecord';
import { useApi, useSession } from '../src/features/auth/SessionProvider';
import { Button, Failure, FormScreen, Notice } from '../src/components/Controls';
import { RecordLoading } from '../src/features/crm/RecordLoading';
import { styles } from '../src/theme/tokens';

export default function Sessions() {
  const api = useApi(), { session, controller, scope, offline } = useSession(), cache = useQueryClient();
  const query = useRecord('sessions', 'all', '/auth/mobile/sessions', value => array(value, entry => { const row = object(entry); return { id: string(row.id), name: string(row.device_name), refreshed: string(row.refreshed_at) }; }));
  const revoke = useMutation({ mutationFn: async (id: string) => { if (id === session!.sessionId) await controller!.logout(); else await api.request(`/auth/mobile/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
    onSuccess: async () => { await cache.invalidateQueries({ queryKey: [scope, 'sessions'] }); } });
  if (query.isPending) return <RecordLoading />;
  if (query.isError) return <Failure error={query.error} retry={() => { void query.refetch(); }} />;
  return <FormScreen>{revoke.isError && <Notice error message={revoke.error.message} />}{query.data.map(device => <View key={device.id} style={{ gap: 12 }}><Text style={styles.body}>
    {device.name}{device.id === session!.sessionId ? ' · This device' : ''}{'\n'}Last refreshed {new Date(device.refreshed).toLocaleString()}
  </Text><Button title={`Revoke ${device.id === session!.sessionId ? 'this device' : device.name}`} disabled={offline || revoke.isPending} secondary
    onPress={() => Alert.alert('Revoke device session?', 'This device will need to sign in again. Saved local records will be cleared on its next session check.', [ { text: 'Cancel', style: 'cancel' }, { text: 'Revoke', style: 'destructive', onPress: () => revoke.mutate(device.id) } ])} /></View>)}</FormScreen>;
}
