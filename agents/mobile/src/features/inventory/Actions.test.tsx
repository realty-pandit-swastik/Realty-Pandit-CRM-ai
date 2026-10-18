import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Actions from '../../../app/inventory/actions';
import { ApiClient } from '../../api/client';
import { useApi, useSession } from '../auth/SessionProvider';
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ ids: 'property' }), router: { push: jest.fn(), dismissTo: jest.fn() } }));
jest.mock('../auth/SessionProvider', () => ({ useApi: jest.fn(), useSession: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {}, Directory: class {}, Paths: { cache: {} } }));
jest.mock('expo-sharing', () => ({}));
let cache: QueryClient;
afterEach(() => { cache.clear(); jest.restoreAllMocks(); });
async function setup() {
  const api = new ApiClient('https://example.invalid');
  const request = jest.spyOn(api, 'request').mockImplementation(async (path, opts) => {
    if (opts?.method && opts.method !== 'GET') return { success: true, id: 'property' };
    if (path === '/api/team/members-list') return [{ id: 'member', name: 'Synthetic staff', role: 'employee' }];
    return { id: 'property', display_id: 'Synthetic', can_edit: true, actions: { edit: true, share: true, transfer: true, ownership: true, approve: true, delete: true }, media_urls: [] };
  });
  jest.mocked(useApi).mockReturnValue(api); jest.mocked(useSession).mockReturnValue({ session: null, controller: null, scope: 'synthetic', offline: false, configurationError: null });
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(<QueryClientProvider client={cache}><Actions /></QueryClientProvider>); await screen.findByText('Synthetic'); return request;
}
it.each([
  ['Clone', '/clone', 'POST'], ['Mark Sold', '/mark-sold', 'POST'], ['Mark On Hold', '/mark-on-hold', 'POST'],
  ['Activate', '', 'PATCH'], ['Withdraw', '', 'PATCH'], ['Approve', '/approve', 'POST'], ['Reject', '/reject', 'POST'],
  ['Transfer Ownership', '/transfer-ownership', 'POST'], ['Delete', '', 'DELETE'],
])('confirms %s and calls the canonical endpoint once', async (label, suffix, method) => {
  const request = await setup(), alert = jest.spyOn(Alert, 'alert');
  await fireEvent.press(screen.getByRole('button', { name: label }));
  await fireEvent.press(screen.getByRole('button', { name: `Confirm ${label.toLowerCase()}` }));
  const confirm = alert.mock.calls[0][2]?.find(b => b.text === 'Confirm'); expect(confirm).toBeTruthy();
  await act(async () => { confirm?.onPress?.(); });
  await waitFor(() => expect(request.mock.calls.filter(([, opts]) => opts?.method === method)).toHaveLength(1));
  expect(request).toHaveBeenCalledWith(`/api/inventory/property${suffix}`, expect.objectContaining({ method }));
});
it('uses member IDs from the authorized tenant chooser for assignment', async () => {
  const request = await setup(), alert = jest.spyOn(Alert, 'alert');
  await fireEvent.press(screen.getByRole('button', { name: 'Assignment' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Synthetic staff · employee' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm assignment' }));
  await act(async () => { alert.mock.calls[0][2]?.find(b => b.text === 'Confirm')?.onPress?.(); });
  expect(request).toHaveBeenCalledWith('/api/inventory/bulk-transfer', expect.objectContaining({ body: JSON.stringify({ ids: ['property'], to_agent_id: 'member' }), method: 'POST' }));
});
