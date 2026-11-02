import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../src/api/client';
import { Task, tasksFrom } from '../../src/api/contracts';
import { useApi, useSession } from '../../src/features/auth/SessionProvider';
import { useRecord } from '../../src/features/crm/useRecord';
import { RecordLoading } from '../../src/features/crm/RecordLoading';
import { Button, Failure, Notice } from '../../src/components/Controls';
import { styles } from '../../src/theme/tokens';
import { label, projectFrom } from '../../src/features/tasks/contracts';
import { RecordList } from '../../src/features/tasks/RecordList';
import { invalidateWork } from '../../src/features/tasks/invalidateWork';
export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi(), { scope, offline, session } = useSession(), cache = useQueryClient();
  const path = `/api/projects/${encodeURIComponent(id)}`;
  const query = useRecord('project', id, `${path}?include_tasks=false`, projectFrom);
  const remove = useMutation({ retry: false, mutationFn: () => api.request(path, { method: 'DELETE' }), onSuccess: async () => {
    cache.removeQueries({ queryKey: [scope, 'project', id] }); await invalidateWork(cache, scope); router.dismissTo('/projects');
  } });
  const ambiguous = remove.error instanceof ApiError && remove.error.ambiguous;
  if (query.isPending) return <RecordLoading />;
  if (!query.data) return <Failure error={query.error || new Error('Project unavailable.')} retry={() => { void query.refetch(); }} />;
  const project = query.data;
  return <RecordList<Task> resource="tasks" filters={`project:${id}`} path={page => `/api/tasks?project_id=${encodeURIComponent(id)}&page=${page}&limit=25&view=calendar`}
    parse={tasksFrom} identify={task => task.id} title={task => task.title} subtitle={task => `${label(task.status)} · ${label(task.priority)}`}
    detail={task => `Due ${new Date(task.due_date).toLocaleDateString()}`} onSelect={task => router.push({ pathname: '/task/[id]', params: { id: task.id } })}
    header={<View style={styles.content}><Text style={styles.heading}>{project.name}</Text><Text style={styles.body}>{label(project.status)}</Text>
      <Text style={styles.muted}>Started {new Date(project.start_date).toLocaleDateString()}{project.end_date ? ` · Ends ${new Date(project.end_date).toLocaleDateString()}` : ''}</Text>
      {project.description && <Text style={styles.body}>{project.description}</Text>}
      <Text style={styles.muted}>Owner: {project.owner_id === session?.agent.id ? 'You' : 'Assigned staff'} · {project.team_members.length} team members</Text>
      {query.isError && <Notice error message={query.error.message} />}{remove.isError && <Notice error message={remove.error.message} />}
      {ambiguous && <Notice message="The deletion result is uncertain. Refresh the project or check the project list before trying again." />}
      <Button title="Edit project" secondary disabled={offline || remove.isPending || ambiguous} onPress={() => router.push({ pathname: '/projects/edit', params: { id } })} />
      <Button title="Delete project" secondary busy={remove.isPending} disabled={offline || query.isFetching || ambiguous} onPress={() => Alert.alert('Delete project?', `“${project.name}” will be permanently deleted. Its tasks will remain, with their project link removed.`, [
        { text: 'Keep project', style: 'cancel' }, { text: 'Delete project', style: 'destructive', onPress: () => remove.mutate() },
      ])} />
      <Button title="Refresh project" secondary disabled={offline || remove.isPending || query.isFetching} onPress={async () => { const result = await query.refetch(); if (!result.isError) remove.reset(); }} />
      <Button title="Back to projects" secondary onPress={() => router.dismissTo('/projects')} /><Text style={styles.section}>Linked tasks in your scope</Text>
    </View>} />;
}
