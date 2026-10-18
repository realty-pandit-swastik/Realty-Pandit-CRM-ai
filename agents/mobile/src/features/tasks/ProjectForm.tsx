import { useState } from 'react';
import { router } from 'expo-router';
import { Text } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import { useApi, useSession } from '../auth/SessionProvider';
import { Button, Field, FormScreen, Notice } from '../../components/Controls';
import { styles } from '../../theme/tokens';
import { Choice } from './Choice';
import { dateWrite, Project, projectFrom, projectStatuses, validDay } from './contracts';
import { invalidateWork } from './invalidateWork';

export function ProjectForm({ project }: { project?: Project }) {
  const api = useApi(), { scope, session, offline } = useSession(), cache = useQueryClient();
  const [name, setName] = useState(project?.name || ''), [description, setDescription] = useState(project?.description || '');
  const [start, setStart] = useState(project?.start_date.slice(0, 10) || new Date().toISOString().slice(0, 10)), [end, setEnd] = useState(project?.end_date?.slice(0, 10) || '');
  const [status, setStatus] = useState<Project['status']>(project?.status || 'ACTIVE');
  const save = useMutation({ retry: false, mutationFn: async () => { const saved = await api.request(project ? `/api/projects/${encodeURIComponent(project.id)}` : '/api/projects', {
    method: project ? 'PATCH' : 'POST', body: JSON.stringify({ name: name.trim(), description, status,
      start_date: dateWrite(start, project?.start_date), end_date: end ? dateWrite(end, project?.end_date) : null,
      ...(!project ? { owner_id: session!.agent.id, team_members: [] } : {}),
    }),
  });
    try { return projectFrom(saved); } catch { throw new ApiError('The saved project response could not be verified. Check saved projects before trying again.', 0, true); }
  }, onSuccess: async saved => { cache.setQueryData([scope, 'project', saved.id], saved); await invalidateWork(cache, scope); router.dismissTo({ pathname: '/projects/[id]', params: { id: saved.id } }); } });
  const ambiguous = save.error instanceof ApiError && save.error.ambiguous;
  return <FormScreen><Text style={styles.section}>{project ? 'Edit project' : 'New project'}</Text>
    <Text style={styles.muted}>{project ? 'Owner and team membership stay as saved.' : `Owned by ${session!.agent.name}. This form creates a project without team members.`}</Text>
    {offline && <Notice message="Offline. Your input stays on this screen. Reconnect to save." />}
    <Field label="Project name" value={name} onChangeText={setName} maxLength={500} editable={!save.isPending} />
    <Choice title="Status" value={status} options={projectStatuses} onChange={setStatus} disabled={save.isPending} />
    <Field label="Start date (YYYY-MM-DD)" value={start} onChangeText={setStart} autoCorrect={false} maxLength={10} editable={!save.isPending} />
    <Field label="End date (YYYY-MM-DD, optional)" value={end} onChangeText={setEnd} autoCorrect={false} maxLength={10} editable={!save.isPending} />
    {(!validDay(start) || (!!end && !validDay(end))) && <Notice error message="Enter real dates in YYYY-MM-DD format, or leave the optional end date empty." />}
    <Field label="Description" value={description} onChangeText={setDescription} multiline maxLength={20000} editable={!save.isPending} />
    {save.isError && <Notice error message={save.error.message} />}
    {ambiguous && <Notice message="The save result is uncertain. Check the saved project before trying again." />}
    <Button title={project ? 'Save project' : 'Create project'} busy={save.isPending} disabled={offline || ambiguous || !name.trim() || !validDay(start) || (!!end && !validDay(end))} onPress={() => save.mutate()} />
    <Button title={ambiguous ? 'Check saved projects' : 'Cancel'} secondary disabled={save.isPending} onPress={() => project ? router.dismissTo({ pathname: '/projects/[id]', params: { id: project.id } }) : router.dismissTo('/projects')} />
  </FormScreen>;
}
