import { Linking, Text, View } from 'react-native';
import { object, optionalString } from '../../api/client';
import { useRecord } from '../crm/useRecord';
import { Button, Failure, Loading } from '../../components/Controls';
import { styles } from '../../theme/tokens';
export function ConnectedPeople({ propertyId }: { propertyId: string }) {
  const query = useRecord('property-contacts', propertyId, `/api/inventory/${encodeURIComponent(propertyId)}/contacts`, value => {
    const data = object(object(value).data); return ['owner', 'key_holder', 'assigned_agent'].map(role => { const person = data[role] ? object(data[role]) : null; return { role, name: person ? optionalString(person.name) : undefined, phone: person ? optionalString(person.phone) : undefined, restricted: !person }; });
  });
  return <View style={{ gap: 12 }}><Text style={styles.section}>Connected people</Text>{query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => { void query.refetch(); }} /> : query.data?.map(p => <View key={p.role} style={styles.row}><Text style={styles.label}>{p.role.replace(/_/g, ' ')}</Text><Text style={styles.body}>{p.restricted ? 'Restricted or not assigned' : p.name || 'Name not provided'}</Text>{p.phone && <><Text selectable style={styles.body}>{p.phone}</Text><Button title={`Call ${p.name || p.role}`} secondary onPress={() => { void Linking.openURL(`tel:${encodeURIComponent(p.phone!)}`); }} /></>}</View>)}</View>;
}
