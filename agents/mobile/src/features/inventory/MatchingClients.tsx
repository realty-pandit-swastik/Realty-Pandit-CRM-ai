import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { array, object, optionalString, string } from '../../api/client';
import { useRecord } from '../crm/useRecord';
import { Button, Failure, Loading } from '../../components/Controls';
import { styles } from '../../theme/tokens';
export function MatchingClients({ propertyId }: { propertyId: string }) {
  const [open, setOpen] = useState(false);
  return <View style={{ gap: 12 }}><Button title={open ? 'Hide matching clients' : 'Find matching clients'} secondary onPress={() => setOpen(v => !v)} />{open && <Matches propertyId={propertyId} />}</View>;
}
function Matches({ propertyId }: { propertyId: string }) {
  const q = useRecord('inventory-matches', propertyId, `/api/inventory/${encodeURIComponent(propertyId)}/matching-clients`, v => {
    const r = object(v); return array(r.matches, e => { const x = object(e); return { id: string(x.deal_id), name: optionalString(x.contact_name) || 'Unnamed contact', reason: optionalString(x.match_reason), phone: optionalString(x.contact_phone) }; });
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <Failure error={q.error} retry={() => { void q.refetch(); }} />;
  return <>{q.data?.length === 0 && <Text style={styles.muted}>No matching clients found.</Text>}{q.data?.map(c => <View key={c.id} style={styles.row}><Text style={styles.body}>{c.name}</Text><Text style={styles.muted}>{c.reason}</Text><Button title={`Open ${c.name}'s deal`} secondary onPress={() => router.push({ pathname: '/deals/[id]', params: { id: c.id } })} /><Button title={`Share property with ${c.name}`} onPress={() => router.push({ pathname: '/inventory/share', params: { ids: propertyId, dealId: c.id, recipient: c.phone || '', name: c.name } })} /></View>)}</>;
}
