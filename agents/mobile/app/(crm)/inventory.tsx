import { useState } from 'react';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Button, Failure, Field, Loading, Notice } from '../../src/components/Controls';
import { useApi, useSession } from '../../src/features/auth/SessionProvider';
import { display, Filter, humanize, inventoryPath, mediaUri, propertiesFrom } from '../../src/features/inventory/contracts';
import { colors, styles } from '../../src/theme/tokens';
import { Taxonomy } from '../../src/features/inventory/FormFields';
import { Members } from '../../src/features/inventory/Members';
import { Choice } from '../../src/features/tasks/Choice';
export default function Inventory() {
  const api = useApi(), { scope, offline, session } = useSession();
  const [draft, setDraft] = useState(''), [search, setSearch] = useState(''), [filters, setFilters] = useState<Filter>({}), [showFilters, setShowFilters] = useState(false), [selected, setSelected] = useState<string[]>([]);
  const query = useInfiniteQuery({ queryKey: [scope, 'inventory', search, filters], initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => propertiesFrom(await api.request(inventoryPath(pageParam, search, filters), { signal })),
    getNextPageParam: (last, pages) => pages.reduce((n, p) => n + p.rows.length, 0) < last.total && last.rows.length ? pages.length + 1 : undefined });
  const rows = query.data?.pages.flatMap(p => p.rows) || [], total = query.data?.pages[0].total;
  function filter(key: string, value: string) { setFilters(f => ({ ...f, [key]: value })); setSelected([]); }
  const header = <View style={[styles.content, { gap: 12 }]}>
    <View style={{ backgroundColor: colors.navy, padding: 20, borderRadius: 8 }}><Text style={[styles.body, { color: colors.white }]}>{total === undefined ? 'Find a property for your client' : `${total} ${total === 1 ? 'property' : 'properties'} · ${filters.all === 'false' ? 'My / team' : 'All tenant inventory'}`}</Text></View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}><View style={{ flex: 1 }}><Field label="Search properties" value={draft} onChangeText={setDraft} returnKeyType="search" onSubmitEditing={() => { setSearch(draft.trim()); setSelected([]); }} />
    </View><Button title="Search" secondary onPress={() => { setSearch(draft.trim()); setSelected([]); }} /></View>
    <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Choice title="Browse" value={filters.all === 'false' ? 'my_team' : 'all_tenant_inventory'} options={['all_tenant_inventory', 'my_team']} onChange={v => filter('all', v === 'my_team' ? 'false' : 'true')} />
    </View><View style={{ flex: 1 }}><Button title={showFilters ? 'Hide filters' : 'Filters'} secondary onPress={() => setShowFilters(v => !v)} /></View></View>
    {showFilters && <><Choice title="Intent" value={filters.intent || 'all'} options={['all', 'sell', 'rent', 'rent_lease', 'lease']} onChange={v => filter('intent', v === 'all' ? '' : v)} />
      <Choice title="Status" value={filters.status || 'all'} options={['all', 'active', 'sold', 'rented', 'on_hold', 'pending_approval', 'rejected', 'withdrawn']} onChange={v => filter('status', v === 'all' ? '' : v)} />
      {['location', 'state', 'type', 'category', 'bhk', 'floors', 'listing_source', 'data_source', 'days_in_system', 'days_no_visit', 'price_min', 'price_max', 'area_min', 'area_max', 'area_unit', 'commercial_use_type', 'lat', 'lng', 'radius_km'].map(k => <Field key={k} label={k === 'price_min' ? 'Minimum asking price (₹)' : k === 'price_max' ? 'Maximum asking price (₹)' : k === 'area_unit' ? 'Area unit (sqft, sqyd, sqm, acre)' : humanize(k)} value={filters[k] || ''} onChangeText={v => filter(k, v)} />)}
      <Choice title="Roof rights" value={filters.roof_rights === 'true' ? 'required' : 'any'} options={['any', 'required']} onChange={v => filter('roof_rights', v === 'required' ? 'true' : '')} /><Choice title="Commercial use" value={filters.commercial_use === 'true' ? 'required' : 'any'} options={['any', 'required']} onChange={v => filter('commercial_use', v === 'required' ? 'true' : '')} />
      <Text style={styles.label}>Property taxonomy</Text><Taxonomy onSelect={id => filter('taxonomy_node_ids', id)} /><Members selected={filters.agent_id ? [filters.agent_id] : []} onChange={ids => filter('agent_id', ids[0] || '')} />
      <Button title="Clear filters" secondary onPress={() => { setFilters({}); setSelected([]); }} /></>}
    {session?.agent.permissions.includes('edit_inventory') && <Button title="Add property" disabled={offline} onPress={() => router.push('/inventory/form')} />}
    {session?.agent.permissions.includes('bulk_upload') && <Button title="Template and bulk upload" secondary disabled={offline} onPress={() => router.push('/inventory/bulk-upload')} />}
    {!!selected.length && <><Text style={styles.body}>{selected.length} selected across loaded pages</Text><Button title="Selected property actions" disabled={offline} onPress={() => router.push({ pathname: '/inventory/actions', params: { ids: selected.join(',') } })} /><Button title="Clear selection" secondary onPress={() => setSelected([])} /></>}
    {offline && <Notice message="Offline. Loaded properties may be stale. Reconnect for changes and sharing." />}
    {query.isError && <Failure error={query.error} retry={() => { void query.refetch(); }} />}
  </View>;
  return <View style={styles.screen}><FlatList data={rows} keyExtractor={p => p.id} ListHeaderComponent={header} keyboardShouldPersistTaps="handled" refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}
    renderItem={({ item: p }) => { const photo = p.images[0] && mediaUri(api.origin, p.images[0]); return <View style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: colors.white, borderRadius: 12, overflow: 'hidden' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${p.title}`} onPress={() => router.push({ pathname: '/inventory/[id]', params: { id: p.id } })} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        {photo ? <Image source={{ uri: photo }} accessibilityLabel={`${p.title} photo`} style={{ width: '100%', height: 180 }} /> : <View style={{ padding: 24, backgroundColor: colors.border }}><Text style={styles.muted}>No property photo</Text></View>}
        <View style={{ padding: 16, gap: 6 }}><Text style={styles.section}>{p.type || 'Property'}</Text><Text style={styles.muted}>{p.title} · {[p.intent, p.status].filter(Boolean).join(' · ')}</Text><Text style={styles.body}>{p.location || 'Location not provided'}</Text>
          {(p.demandPrice || p.price) && <Text style={styles.section}>Owner asking: {p.demandPrice || p.price}</Text>}{p.displayPrice && <Text style={styles.body}>Display price: {p.displayPrice}</Text>}
          <Text style={styles.muted}>{Object.entries(p.specs).slice(0, 5).map(([k, v]) => `${humanize(k)}: ${display(v)}`).join(' · ')}</Text>
          {['source', 'assigned_agent', 'completion_pct', 'stats'].filter(k => p.fields[k] !== undefined).map(k => <Text key={k} style={styles.muted}>{humanize(k)}: {display(p.fields[k])}</Text>)}
        </View>
      </Pressable><View style={{ padding: 12 }}><Button title={selected.includes(p.id) ? `Deselect ${p.title}` : `Select ${p.title}`} secondary onPress={() => setSelected(ids => ids.includes(p.id) ? ids.filter(id => id !== p.id) : [...ids, p.id])} /></View>
    </View>; }}
    ListEmptyComponent={query.isPending ? <Loading /> : !query.isError ? <View style={styles.content}><Text style={styles.body}>No properties found. Try changing your filters.</Text></View> : undefined}
    ListFooterComponent={query.hasNextPage ? <View style={styles.content}><Button title="Load next 25" busy={query.isFetchingNextPage} disabled={offline} secondary onPress={() => { void query.fetchNextPage(); }} /></View> : undefined} /></View>;
}
