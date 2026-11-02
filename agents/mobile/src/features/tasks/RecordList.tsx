import { ReactNode } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useApi, useSession } from '../auth/SessionProvider';
import { Button, Failure, Loading, Notice, Row } from '../../components/Controls';
import { styles } from '../../theme/tokens';

export function RecordList<T>({ resource, filters, path, parse, identify, title, subtitle, detail, onSelect, extra, header }: {
  resource: 'tasks' | 'projects'; filters: string; path: (page: number) => string; parse: (value: unknown) => { rows: T[]; total: number };
  identify: (row: T) => string; title: (row: T) => string; subtitle: (row: T) => string; detail?: (row: T) => string;
  onSelect: (row: T) => void; extra?: ReactNode; header?: ReactNode;
}) {
  const api = useApi(), { scope, offline } = useSession();
  const query = useInfiniteQuery({ queryKey: [scope, resource, filters], initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => parse(await api.request(path(pageParam), { signal })),
    getNextPageParam: (last, pages) => pages.reduce((count, page) => count + page.rows.length, 0) < last.total && last.rows.length ? pages.length + 1 : undefined,
  });
  return <View style={styles.screen}><View style={styles.toolbar}>{extra}
    {offline && <Notice message="Offline. Showing records already loaded. Reconnect to refresh or make changes." />}</View>
    {query.isPending ? offline ? <ScrollView>{header}<Text style={[styles.muted, styles.content]}>Reconnect to load these records.</Text></ScrollView> : <ScrollView>{header}<Loading /></ScrollView> : query.isError && !query.data ? <ScrollView>{header}<Failure error={query.error} retry={() => { void query.refetch(); }} /></ScrollView> :
      <FlatList data={query.data?.pages.flatMap(page => page.rows) || []} keyExtractor={identify} contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
        refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }}
        renderItem={({ item }) => <Row title={title(item)} subtitle={subtitle(item)} detail={detail?.(item)} onPress={() => onSelect(item)} />}
        ListHeaderComponent={<>{header}{query.isError && <Failure error={query.error} retry={() => { void query.refetch(); }} />}</>}
        ListEmptyComponent={<View style={styles.content}><Text style={styles.section}>No {resource} found</Text><Text style={styles.muted}>Change the filters or pull down to refresh.</Text></View>}
        ListFooterComponent={query.hasNextPage ? <View style={styles.content}><Button title="Load more" secondary busy={query.isFetchingNextPage} disabled={offline} onPress={() => { void query.fetchNextPage(); }} /></View> : undefined} />}
  </View>;
}
