import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import Appointment from '../../../app/visits/[id]';
import { useApi, useSession } from '../auth/SessionProvider';
import { ApiClient, ApiError } from '../../api/client';
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: 'synthetic-visit' }) }));
jest.mock('../auth/SessionProvider', () => ({ useApi: jest.fn(), useSession: jest.fn() }));
let cache: QueryClient;
afterEach(() => cache?.clear());

it.each(['interrupted', 'malformed success'])('retains outcome notes and requires reconciliation after an %s appointment save', async failure => {
  const message = failure === 'interrupted' ? 'Save outcome unknown. Refresh the record before trying again.' : 'The save response could not be verified. Refresh the appointment before trying again.';
  const api = new ApiClient('https://example.invalid');
  const request = jest.spyOn(api, 'request').mockImplementation(async (_path, options) => {
    if (options?.method === 'PATCH') {
      if (failure === 'malformed success') return { success: true, appointment: { id: 'synthetic-visit' } };
      throw new ApiError(message, 0, true);
    }
    return { appointment: { id: 'synthetic-visit', title: 'Synthetic visit', scheduled_at: '2026-10-20T10:00:00Z', status: 'scheduled' } };
  });
  jest.mocked(useApi).mockReturnValue(api);
  jest.mocked(useSession).mockReturnValue({ session: null, controller: null, configurationError: null, offline: false, scope: 'synthetic' });
  const alert = jest.spyOn(Alert, 'alert');
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } });
  await render(<QueryClientProvider client={cache}><Appointment /></QueryClientProvider>);
  await screen.findByText('Synthetic visit');
  await fireEvent.changeText(screen.getByLabelText('Outcome notes'), 'Synthetic notes to retain');
  await fireEvent.press(screen.getByRole('button', { name: 'Mark complete' }));
  expect(request.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0);
  const confirm = alert.mock.calls[0][2]?.find(button => button.text === 'Mark complete');
  expect(confirm).toBeTruthy();
  await act(async () => { confirm?.onPress?.(); });
  await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
  expect(screen.getByLabelText('Outcome notes').props.value).toBe('Synthetic notes to retain');
  expect(screen.getByRole('button', { name: 'Mark complete' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save notes' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Save notes' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Mark complete' }));
  expect(request.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh appointment' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Mark complete' })).toBeEnabled());
  expect(request.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
  expect(request).toHaveBeenCalledWith('/api/calendar/appointments/synthetic-visit', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'completed', notes: 'Synthetic notes to retain' }) }));
  alert.mockRestore();
});
