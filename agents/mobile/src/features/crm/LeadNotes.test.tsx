import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LeadDetail from '../../../app/lead/[phone]';
import { useApi, useSession } from '../auth/SessionProvider';
import { useEncryptedDraft } from '../../storage/useEncryptedDraft';
import { ApiClient } from '../../api/client';
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ phone: '+919000000082' }), router: {} }));
jest.mock('../auth/SessionProvider', () => ({ useApi: jest.fn(), useSession: jest.fn() }));
jest.mock('../../storage/useEncryptedDraft', () => ({ useEncryptedDraft: jest.fn() }));
let cache: QueryClient;
afterEach(() => cache?.clear());

it('retains a restored draft and refuses to overwrite changed server notes without review', async () => {
  const api = new ApiClient('https://example.invalid');
  let reads = 0;
  const request = jest.spyOn(api, 'request').mockImplementation(async (_path, options) => {
    if (options?.method === 'PATCH') throw new Error('Unexpected overwrite');
    return { phone_number: '+919000000082', name: 'Synthetic lead', notes: ++reads === 1 ? 'Original notes' : 'A teammate’s newer notes' };
  });
  jest.mocked(useApi).mockReturnValue(api);
  jest.mocked(useSession).mockReturnValue({ session: null, controller: null, configurationError: null, offline: false, scope: 'synthetic' });
  jest.mocked(useEncryptedDraft).mockReturnValue({ ready: true, draft: { value: { notes: 'My preserved local draft', baseNotes: 'Original notes' }, savedAt: Date.now(), recovered: false }, status: 'Draft restored from this device.', error: '', update: jest.fn(), clear: jest.fn(async () => true) });
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  await render(<QueryClientProvider client={cache}><LeadDetail /></QueryClientProvider>);
  await screen.findByText('Synthetic lead');
  await fireEvent.press(screen.getByRole('button', { name: 'Save notes' }));
  await waitFor(() => expect(screen.getByText('The saved notes changed since this draft. Review them before replacing.')).toBeTruthy());
  expect(screen.getByLabelText('Notes').props.value).toBe('My preserved local draft');
  expect(screen.getByText('Current saved notes: A teammate’s newer notes')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save notes' })).toBeDisabled();
  expect(request.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0);
});
