import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Text, View } from 'react-native';
import { propertyFrom } from '../../src/api/contracts';
import { useApi, useSession } from '../../src/features/auth/SessionProvider';
import { useRecord } from '../../src/features/crm/useRecord';
import { Button, Failure, FormScreen, Notice } from '../../src/components/Controls';
import { RecordLoading } from '../../src/features/crm/RecordLoading';
import { colors, styles } from '../../src/theme/tokens';
import { Attachments } from '../../src/features/inventory/Attachments';
import { detailGroups, display, fieldLabel, humanize } from '../../src/features/inventory/contracts';
import { Gallery } from '../../src/features/inventory/Gallery';
import { AttachmentManagement } from '../../src/features/inventory/AttachmentManagement';
import { ConnectedPeople } from '../../src/features/inventory/ConnectedPeople';
export default function InventoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(), api = useApi(), { offline } = useSession();
  const query = useRecord('property', id, `/api/inventory/${encodeURIComponent(id)}`, propertyFrom);
  if (query.isPending) return <RecordLoading />;
  if (!query.data) return <Failure error={query.error || new Error('Property unavailable')} retry={() => { void query.refetch(); }} />;
  const p = query.data;
  return <FormScreen><View style={{ backgroundColor: colors.navy, padding: 20, borderRadius: 8, gap: 8 }}><Text style={[styles.heading, { color: colors.white }]}>{p.type || 'Property'}</Text><Text style={[styles.body, { color: colors.white }]}>{p.title}</Text><Text style={[styles.body, { color: colors.white }]}>{[p.intent, p.status].filter(Boolean).join(' · ')}</Text><Text style={[styles.body, { color: colors.white }]}>{p.location || 'Location not provided'}</Text>{(p.demandPrice || p.price) && <Text style={[styles.section, { color: colors.white }]}>Owner asking: {p.demandPrice || p.price}</Text>}{p.displayPrice && <Text style={[styles.body, { color: colors.white }]}>Display price: {p.displayPrice}</Text>}</View>
    {offline && <Notice message="Offline. These details may be stale. Reconnect before taking action." />}{query.isError && <Notice error message={`Property refresh failed. ${query.error.message}`} />}
    <Gallery property={p} origin={api.origin} />
    <Button title="Property actions" disabled={offline} onPress={() => router.push({ pathname: '/inventory/actions', params: { ids: id } })} />
    {p.actions.edit && <Button title="Edit property" secondary disabled={offline} onPress={() => router.push({ pathname: '/inventory/form', params: { id } })} />}
    {p.actions.share && <Button title="Share with a CRM contact" disabled={offline} onPress={() => router.push({ pathname: '/inventory/share', params: { ids: id } })} />}
    {Object.entries(detailGroups).map(([group, keys]) => <View key={group} style={{ gap: 8 }}><Text style={styles.section}>{group}</Text>{keys.map(key => <View key={key} style={styles.row}><Text style={styles.label}>{fieldLabel(key)}</Text><Text selectable style={styles.body}>{p.restricted.includes(key) ? 'Restricted' : display(p.fields[key] ?? null)}</Text></View>)}</View>)}
    <Text style={styles.section}>All property specifications</Text>{Object.entries(p.specs).length ? Object.entries(p.specs).map(([k, v]) => <View key={k} style={styles.row}><Text style={styles.label}>{humanize(k)}</Text><Text selectable style={styles.body}>{display(v)}</Text></View>) : <Text style={styles.muted}>No specifications provided.</Text>}
    {typeof p.fields.latitude === 'number' && typeof p.fields.longitude === 'number' && <Button title="Open map" secondary onPress={() => { void Linking.openURL(`geo:${p.fields.latitude},${p.fields.longitude}?q=${p.fields.latitude},${p.fields.longitude}`); }} />}
    <ConnectedPeople propertyId={id} />
    <Button title="Refresh property" secondary onPress={() => { void query.refetch(); }} />
    <AttachmentManagement property={p} refresh={() => query.refetch({ throwOnError: true })} />
    <Attachments propertyId={p.id} canEdit={p.actions.edit} documents={p.documents} refreshAttachments={async () => { const result = await query.refetch({ throwOnError: true }); if (!result.isSuccess || result.fetchStatus !== 'idle') throw new Error('Reconnect to check attachments.'); }} />
  </FormScreen>;
}
