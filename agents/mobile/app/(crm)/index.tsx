import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { tasksFrom, visitsFrom } from '../../src/api/contracts';
import { useApi, useSession } from '../../src/features/auth/SessionProvider';
import { Button, Failure, Loading, Notice, Row } from '../../src/components/Controls';
import { styles } from '../../src/theme/tokens';

export default function Home() {
  const api = useApi(), { scope, session, offline } = useSession();
  const tasks = useQuery({ queryKey: [scope, 'home-tasks'], queryFn: async ({ signal }) => tasksFrom(await api.request(`/api/tasks?assigned_to=${encodeURIComponent(session!.agent.id)}&status=TODO&view=calendar&page=1&limit=3`, { signal })) });
  const visits = useQuery({ queryKey: [scope, 'home-visits'], queryFn: async ({ signal }) => visitsFrom(await api.request(`/api/calendar/appointments?mine=true&upcoming=true&page=1&limit=5&startDate=${encodeURIComponent(new Date().toISOString())}`, { signal })) });
  const refresh = () => { void tasks.refetch(); void visits.refetch(); };
  return <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={tasks.isRefetching || visits.isRefetching} onRefresh={refresh} />}>
    <View style={styles.content}><Text style={styles.heading}>Hello, {session!.agent.name.split(' ')[0]}.</Text><Text style={styles.body}>Your next follow-ups and visits.</Text>{offline && <Notice message="Offline. Loaded records may be out of date. Reconnect before making changes." />}</View>
    <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}><Text style={styles.section}>Follow-ups</Text></View>
    {tasks.isPending ? <Loading label="Loading your follow-ups…" /> : tasks.isError ? <Failure error={tasks.error} retry={() => { void tasks.refetch(); }} /> : tasks.data.rows.length ? tasks.data.rows.map(task => <Row key={task.id} title={task.title} subtitle={`Due ${new Date(task.due_date).toLocaleString()} · ${task.priority.toLowerCase()}`} onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })} />) : <View style={styles.content}><Text style={styles.muted}>No pending follow-ups assigned to you.</Text></View>}
    <View style={{ padding: 20 }}><Button title="View my tasks" secondary onPress={() => router.push('/(crm)/tasks')} /></View>
    <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}><Text style={styles.section}>Upcoming visits</Text></View>
    {visits.isPending ? <Loading label="Loading your appointments…" /> : visits.isError ? <Failure error={visits.error} retry={() => { void visits.refetch(); }} /> : visits.data.length ? visits.data.map(visit => <Row key={visit.id} title={visit.contact || visit.title} subtitle={new Date(visit.date).toLocaleString()} detail={visit.status} onPress={() => router.push({ pathname: '/visits/[id]', params: { id: visit.id } })} />) : <View style={styles.content}><Text style={styles.muted}>No upcoming appointments assigned to you.</Text></View>}
    <View style={{ padding: 20 }}><Button title="View appointments" secondary onPress={() => router.push('/visits')} /></View>
  </ScrollView>;
}
