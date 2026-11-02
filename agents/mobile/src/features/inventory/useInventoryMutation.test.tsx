import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren } from 'react';
import { ApiError } from '../../api/client';
import { useSession } from '../auth/SessionProvider';
import { useInventoryMutation } from './useInventoryMutation';
jest.mock('../auth/SessionProvider', () => ({ useSession: jest.fn() }));
let cache: QueryClient;
beforeEach(() => { cache = new QueryClient(); jest.mocked(useSession).mockReturnValue({ scope: 'test', offline: false, session: null, controller: null, configurationError: null }); });
afterEach(() => cache.clear());
function wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={cache}>{children}</QueryClientProvider>; }
it('does not replay ambiguous actions and prevents repeated taps', async () => {
  const hook = await renderHook(useInventoryMutation, { wrapper }), action = jest.fn(async () => { throw new ApiError('Uncertain send', 0, true); });
  await act(async () => { await hook.result.current.run(action); });
  await act(async () => { await hook.result.current.run(action); });
  expect(action).toHaveBeenCalledTimes(1); expect(hook.result.current.uncertain).toBe(true); expect(hook.result.current.error).toBe('Uncertain send');
});
it('requires connectivity before invoking any mutation', async () => {
  jest.mocked(useSession).mockReturnValue({ scope: 'test', offline: true, session: null, controller: null, configurationError: null });
  const hook = await renderHook(useInventoryMutation, { wrapper }), action = jest.fn(); await act(async () => { await hook.result.current.run(action); }); expect(action).not.toHaveBeenCalled();
});
it('aborts in-flight work when the screen unmounts', async () => {
  const hook = await renderHook(useInventoryMutation, { wrapper }); let captured: AbortSignal | undefined;
  let complete: (() => void) | undefined;
  const action = (signal: AbortSignal) => new Promise<void>(resolve => { captured = signal; complete = resolve; });
  let pending: Promise<void> | undefined;
  await act(async () => { pending = hook.result.current.run(action); });
  await hook.unmount(); expect(captured?.aborted).toBe(true); complete?.(); await pending;
});
