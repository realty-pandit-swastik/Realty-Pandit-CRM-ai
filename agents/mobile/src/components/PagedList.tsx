import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useApi, useSession } from '../features/auth/SessionProvider';
import { Button, Failure, Field, Loading, Notice, Row } from './Controls';
import { styles } from '../theme/tokens';

export function PagedList<T>({ resource, path, parse, identify, title, subtitle, detail, onSelect, searchLabel, extra }: {
  resource: string; path: (page: number, search: string) => string; parse: (value: unknown) => { rows: T[]; total: number };
  identify: (row: T) => string; title: (row: T) => string; subtitle?: (row: T) => string | undefined; detail?: (row: T) => string | undefined;
  onSelect: (row: T) => void; searchLabel?: string; extra?: React.ReactNode;
}) {
  const api = useApi(), { scope, offline } = useSession();
  const [draft, setDraft] = useState(''), [search, setSearch] = useState('');
  const query = useInfiniteQuery({ queryKey: [scope, resource, search], initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => parse(await api.request(path(pageParam, search), { signal })),
    getNextPageParam: (last, pages) => pages.reduce((count, page) => count + page.rows.length, 0) < last.total && last.rows.length ? pages.length + 1 : undefined,
  });
  const rows = query.data?.pages.flatMap(page => page.rows) || [];
  return <View style={styles.screen}>
    <View style={styles.toolbar}>{searchLabel && <><Field label={searchLabel} value={draft} onChangeText={setDraft} returnKeyType="search" onSubmitEditing={() => setSearch(draft.trim())} autoCorrect={false} />
      <Button title="Search" secondary onPress={() => setSearch(draft.trim())} /></>}{extra}
      {offline && <Notice message="Offline. Showing records already loaded on this device. Changes require a connection." />}
    </View>
    {query.isPending ? offline ? <View style={styles.content}><Text style={styles.muted}>Reconnect to load these records.</Text></View> : <Loading /> : query.isError && !query.data ? <Failure error={query.error} retry={() => { void query.refetch(); }} /> :
      <FlatList data={rows} keyExtractor={identify} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}
        renderItem={({ item }) => <Row title={title(item)} subtitle={subtitle?.(item)} detail={detail?.(item)} onPress={() => onSelect(item)} />}
        ListHeaderComponent={query.isError ? <Failure error={query.error} retry={() => { void query.refetch(); }} /> : undefined}
        ListEmptyComponent={<View style={styles.content}><Text style={styles.section}>No records found</Text><Text style={styles.muted}>Try another search or pull down to refresh.</Text></View>}
        ListFooterComponent={query.hasNextPage ? <View style={{ padding: 20 }}><Button title="Load more" busy={query.isFetchingNextPage} disabled={offline} secondary onPress={() => { void query.fetchNextPage(); }} /></View> : undefined} />}
  </View>;
}
