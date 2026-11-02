import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import EditTask from '../../../app/task/edit';
import TaskDetail from '../../../app/task/[id]';
import { ProjectForm } from './ProjectForm';
import { useApi, useSession } from '../auth/SessionProvider';
import { ApiClient, ApiError } from '../../api/client';
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'synthetic-task' }), router: { replace: jest.fn(), dismissTo: jest.fn(), push: jest.fn() } }));
jest.mock('../auth/SessionProvider', () => ({ useApi: jest.fn(), useSession: jest.fn() }));
const task = { id: 'synthetic-task', title: 'Synthetic task', due_date: '2026-10-20T05:00:00.000Z', status: 'TODO', priority: 'MEDIUM', assigned_to: 'synthetic-agent', project_id: 'synthetic-project', project: { name: 'Synthetic project' }, tags: ['keep,comma'] };
let cache: QueryClient;
afterEach(() => { cache?.clear(); jest.restoreAllMocks(); });
function setup() {
  const api = new ApiClient('https://example.invalid');
  jest.mocked(useApi).mockReturnValue(api);
  jest.mocked(useSession).mockReturnValue({ session: null, controller: null, configurationError: null, offline: false, scope: 'synthetic' });
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  return api;
}
it('retains task edit input after an ambiguous save and leaves links, assignment, tags and original time untouched', async () => {
  const api = setup();
  const request = jest.spyOn(api, 'request').mockImplementation(async (_path, options) => {
    if (options?.method === 'PATCH') throw new ApiError('Save outcome unknown.', 0, true);
    return task;
  });
  await render(<QueryClientProvider client={cache}><EditTask /></QueryClientProvider>);
  await screen.findByLabelText('Task title');
  await fireEvent.changeText(screen.getByLabelText('Task title'), 'Synthetic changed task');
  await fireEvent.press(screen.getByRole('button', { name: 'Save task' }));
  await screen.findByText('Save outcome unknown.');
  expect(screen.getByLabelText('Task title').props.value).toBe('Synthetic changed task');
  expect(screen.getByRole('button', { name: 'Save task' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Check current task' })).toBeEnabled();
  const call = request.mock.calls.find(([, options]) => options?.method === 'PATCH');
  expect(JSON.parse(typeof call?.[1]?.body === 'string' ? call[1].body : '{}')).toEqual({ title: 'Synthetic changed task', description: '', due_date: task.due_date, status: 'TODO', priority: 'MEDIUM' });
});
it('confirms task deletion and blocks another mutation until a successful refresh', async () => {
  const api = setup();
  const request = jest.spyOn(api, 'request').mockImplementation(async (_path, options) => {
    if (options?.method === 'DELETE') throw new ApiError('Delete outcome unknown.', 0, true);
    return task;
  });
  const alert = jest.spyOn(Alert, 'alert');
  await render(<QueryClientProvider client={cache}><TaskDetail /></QueryClientProvider>);
  await screen.findByText('Synthetic task');
  await fireEvent.press(screen.getByRole('button', { name: 'Delete task' }));
  expect(request.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(0);
  await act(async () => { alert.mock.calls[0][2]?.find(button => button.text === 'Delete task')?.onPress?.(); });
  await screen.findByText('Delete outcome unknown.');
  expect(screen.getByRole('button', { name: 'Delete task' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Mark complete' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh current status' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete task' })).toBeEnabled());
  expect(request.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(1);
});
it('retains project changes after failure and never rewrites ownership or team membership', async () => {
  const api = setup();
  const request = jest.spyOn(api, 'request').mockRejectedValue(new ApiError('Save outcome unknown.', 0, true));
  await render(<QueryClientProvider client={cache}><ProjectForm project={{ id: 'synthetic-project', name: 'Synthetic project', status: 'ACTIVE', start_date: task.due_date, end_date: '2026-10-30T07:00:00.000Z', owner_id: 'synthetic-owner', team_members: ['synthetic-member'] }} /></QueryClientProvider>);
  await fireEvent.changeText(screen.getByLabelText('Description'), 'Keep my project changes');
  await fireEvent.press(screen.getByRole('button', { name: 'Save project' }));
  await screen.findByText('Save outcome unknown.');
  expect(screen.getByLabelText('Description').props.value).toBe('Keep my project changes');
  expect(screen.getByRole('button', { name: 'Save project' })).toBeDisabled();
  expect(JSON.parse(typeof request.mock.calls[0][1]?.body === 'string' ? request.mock.calls[0][1].body : '{}')).toEqual({ name: 'Synthetic project', description: 'Keep my project changes', status: 'ACTIVE', start_date: task.due_date, end_date: '2026-10-30T07:00:00.000Z' });
});
it('requires reconciliation when a successful project write returns an unreadable record', async () => {
  const api = setup();
  const request = jest.spyOn(api, 'request').mockResolvedValue({ id: 'synthetic-project' });
  await render(<QueryClientProvider client={cache}><ProjectForm project={{ id: 'synthetic-project', name: 'Synthetic project', status: 'ACTIVE', start_date: task.due_date, team_members: [] }} /></QueryClientProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Save project' }));
  await screen.findByText('The saved project response could not be verified. Check saved projects before trying again.');
  expect(screen.getByRole('button', { name: 'Save project' })).toBeDisabled();
  expect(request).toHaveBeenCalledTimes(1);
});
