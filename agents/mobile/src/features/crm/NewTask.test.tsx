import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import NewTask from '../../../app/task/new';
import { useApi, useSession } from '../auth/SessionProvider';
import { useEncryptedDraft } from '../../storage/useEncryptedDraft';
import { ApiClient } from '../../api/client';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('../auth/SessionProvider', () => ({ useApi: jest.fn(), useSession: jest.fn() }));
jest.mock('../../storage/useEncryptedDraft', () => ({ useEncryptedDraft: jest.fn() }));
let cache: QueryClient;
afterEach(() => { cache?.clear(); jest.clearAllMocks(); });

it('prevents a duplicate task when the server save succeeds but draft removal fails', async () => {
  const api = new ApiClient('https://example.invalid');
  const request = jest.spyOn(api, 'request').mockResolvedValue({ id: 'synthetic-created-task', title: 'Synthetic task', status: 'PENDING', priority: 'MEDIUM', due_date: '2026-10-20' });
  const clear = jest.fn(async () => false);
  jest.mocked(useApi).mockReturnValue(api);
  jest.mocked(useSession).mockReturnValue({ session: { token: 'synthetic-access', sessionId: 'synthetic-session', agent: {
    id: 'synthetic-member', tenant_id: 'synthetic-tenant', name: 'Synthetic', email: 'synthetic@example.invalid', role: 'employee', permissions: [],
  } }, controller: null, configurationError: null, offline: false, scope: 'synthetic' });
  jest.mocked(useEncryptedDraft).mockReturnValue({ ready: true, draft: { value: { title: 'Synthetic task', description: 'Synthetic description', date: '2026-10-20' }, savedAt: Date.now(), recovered: false }, status: '', error: '', update: jest.fn(), clear });
  cache = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
  await render(<QueryClientProvider client={cache}><NewTask /></QueryClientProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Create task' }));
  await waitFor(() => expect(screen.getByText('Task created. Open it to review the saved record.')).toBeTruthy());
  expect(clear).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Create task' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Create task' }));
  expect(request).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Open created task' }));
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/task/[id]', params: { id: 'synthetic-created-task' } });
});

it('requires task-list reconciliation after an unreadable successful creation response', async () => {
  const api = new ApiClient('https://example.invalid');
  const request = jest.spyOn(api, 'request').mockResolvedValue({ unexpected: 'successful response' });
  jest.mocked(useApi).mockReturnValue(api);
  jest.mocked(useSession).mockReturnValue({ session: { token: 'synthetic-access', sessionId: 'synthetic-session', agent: {
    id: 'synthetic-member', tenant_id: 'synthetic-tenant', name: 'Synthetic', email: 'synthetic@example.invalid', role: 'employee', permissions: [],
  } }, controller: null, configurationError: null, offline: false, scope: 'synthetic' });
  const clear = jest.fn(async () => true);
  jest.mocked(useEncryptedDraft).mockReturnValue({ ready: true, draft: { value: { title: 'Synthetic task', description: '', date: '2026-10-20' }, savedAt: Date.now(), recovered: false }, status: '', error: '', update: jest.fn(), clear });
  cache = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
  await render(<QueryClientProvider client={cache}><NewTask /></QueryClientProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Create task' }));
  await screen.findByText('The server accepted this task, but its response could not be read. Check your tasks before creating it again.');
  expect(screen.getByRole('button', { name: 'Create task' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Create task' }));
  expect(request).toHaveBeenCalledTimes(1); expect(clear).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Check my tasks' }));
  expect(router.replace).toHaveBeenCalledWith('/(crm)/tasks');
});
