import { Alert, Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, testRouter, waitFor } from 'expo-router/testing-library';
import Projects from '../../../app/projects';
import ProjectDetail from '../../../app/projects/[id]';
import NewProject from '../../../app/projects/new';
import EditProject from '../../../app/projects/edit';
import Tasks from '../../../app/(crm)/tasks';
import TaskDetail from '../../../app/task/[id]';
import EditTask from '../../../app/task/edit';
import { ApiClient } from '../../api/client';
import { useApi, useSession } from '../auth/SessionProvider';

jest.mock('../auth/SessionProvider', () => ({ useApi: jest.fn(), useSession: jest.fn() }));
let cache: QueryClient;
afterEach(() => { cache?.clear(); jest.restoreAllMocks(); jest.useRealTimers(); });

function setup() {
  const api = new ApiClient('https://example.invalid');
  jest.mocked(useApi).mockReturnValue(api);
  jest.mocked(useSession).mockReturnValue({ session: { token: 'synthetic-access', sessionId: 'synthetic-session', agent: {
    id: 'synthetic-member', tenant_id: 'synthetic-tenant', name: 'Synthetic', email: 'synthetic@example.invalid', role: 'employee', permissions: [],
  } }, controller: null, configurationError: null, offline: false, scope: 'synthetic' });
  cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return api;
}
function Layout() { return <QueryClientProvider client={cache}><Stack screenOptions={{ animation: 'none' }} /></QueryClientProvider>; }

it('returns from project edits and deletion without leaving the deleted detail in Back history', async () => {
  const api = setup();
  let project = { id: 'synthetic-project', name: 'Synthetic project', status: 'ACTIVE', start_date: '2026-10-20', team_members: [] };
  let deleted = false;
  jest.spyOn(api, 'request').mockImplementation(async (path, options) => {
    if (options?.method === 'DELETE') { deleted = true; return {}; }
    if (options?.method === 'POST' || options?.method === 'PATCH') {
      project = { ...project, ...JSON.parse(String(options.body)) }; return project;
    }
    if (path.startsWith('/api/tasks')) return { tasks: [], total: 0 };
    if (path.startsWith('/api/projects?')) return { projects: deleted ? [] : [project], total: deleted ? 0 : 1 };
    return project;
  });
  const alert = jest.spyOn(Alert, 'alert');
  await renderRouter({ _layout: Layout, index: () => <Text>Home</Text>, projects: Projects, 'projects/[id]': ProjectDetail, 'projects/new': NewProject, 'projects/edit': EditProject });
  await testRouter.push('/projects');
  await fireEvent.press(await screen.findByRole('button', { name: 'New project' }));
  await fireEvent.changeText(await screen.findByLabelText('Project name'), 'Synthetic project');
  await fireEvent.press(screen.getByRole('button', { name: 'Create project' }));
  await screen.findByRole('button', { name: 'Edit project' });
  await fireEvent.press(screen.getByRole('button', { name: 'Edit project' }));
  await fireEvent.changeText(await screen.findByLabelText('Project name'), 'Changed project');
  await fireEvent.press(screen.getByRole('button', { name: 'Save project' }));
  await screen.findByText('Changed project');
  await fireEvent.press(screen.getByRole('button', { name: 'Delete project' }));
  expect(deleted).toBe(false);
  await act(async () => { alert.mock.calls.at(-1)?.[2]?.find(button => button.text === 'Delete project')?.onPress?.(); });
  await screen.findByText('No projects found');
  expect(deleted).toBe(true);
  await testRouter.back('/');
  expect(screen.queryByRole('button', { name: 'Edit project' })).toBeNull();
  expect(cache.getQueryData(['synthetic', 'project', project.id])).toBeUndefined();
});

it('returns from task edits and deletion to the tab without a deleted detail in Back history', async () => {
  const api = setup();
  let task = { id: 'synthetic-task', title: 'Synthetic task', status: 'TODO', priority: 'MEDIUM', due_date: '2026-10-20T05:00:00.000Z', assigned_to: 'synthetic-member', tags: [] };
  let deleted = false;
  jest.spyOn(api, 'request').mockImplementation(async (path, options) => {
    if (options?.method === 'DELETE') { deleted = true; return {}; }
    if (options?.method === 'PATCH') { task = { ...task, ...JSON.parse(String(options.body)) }; return task; }
    return path.startsWith('/api/tasks?') ? { tasks: deleted ? [] : [task], total: deleted ? 0 : 1 } : task;
  });
  const alert = jest.spyOn(Alert, 'alert');
  await renderRouter({ _layout: Layout, '(crm)/tasks': Tasks, 'task/[id]': TaskDetail, 'task/edit': EditTask }, { initialUrl: '/tasks' });
  await testRouter.push('/task/synthetic-task');
  await fireEvent.press(await screen.findByRole('button', { name: 'Edit task' }));
  await fireEvent.changeText(await screen.findByLabelText('Task title'), 'Changed task');
  await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));
  await screen.findByText('Changed task');
  await fireEvent.press(screen.getByRole('button', { name: 'Delete task' }));
  await act(async () => { alert.mock.calls.at(-1)?.[2]?.find(button => button.text === 'Delete task')?.onPress?.(); });
  await waitFor(() => expect(router.canGoBack()).toBe(false));
  expect(deleted).toBe(true);
  expect(screen.queryByRole('button', { name: 'Edit task' })).toBeNull();
});
