import { createContext, PropsWithChildren, useContext, useEffect, useState, useCallback } from 'react';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Network from 'expo-network';
import { fetch as nativeFetch } from 'expo/fetch';
import { ApiClient, ApiError, apiOrigin } from '../../api/client';
import { ActiveSession } from '../../api/contracts';
import { cleanPersonalShares } from '../inventory/personalShare';
import { cleanShareFiles } from '../inventory/attachmentFiles';
import { secureCredentials, SessionController } from '../../storage/session';
import { clearDrafts } from '../../storage/drafts';
import { Button, Loading, Notice } from '../../components/Controls';
import { styles } from '../../theme/tokens';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30000, gcTime: 300000 }, mutations: { retry: false } } });
let configurationError: Error | null = null;
let controller: SessionController | null = null;
try {
  const origin = apiOrigin(process.env.EXPO_PUBLIC_API_URL, __DEV__);
  controller = new SessionController(new ApiClient(origin, nativeFetch), secureCredentials(origin), async () => {
    queryClient.clear();
    await Promise.all([clearDrafts(), Promise.resolve().then(() => { cleanShareFiles(true); cleanPersonalShares(true); })]);
  });
} catch (error) { configurationError = error instanceof Error ? error : new Error('API configuration is invalid.'); }

type AuthContext = { session: ActiveSession | null; controller: SessionController | null; configurationError: Error | null; offline: boolean; scope: string };
const Context = createContext<AuthContext | null>(null);
function recoveryError(failure: unknown): Error | null {
  if (failure instanceof ApiError && failure.status === 401) return null;
  if (failure instanceof ApiError && failure.ambiguous) return new Error('Could not restore your session. Check your connection and retry.');
  return failure instanceof Error ? failure : new Error('Could not restore your session. Try again.');
}
export function useSession() { const context = useContext(Context); if (!context) throw new Error('SessionProvider is required'); return context; }
export function useApi() { const context = useSession(); if (!context.controller) throw new Error('API is not configured'); return context.controller.api; }

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [restoring, setRestoring] = useState(!!controller);
  const [error, setError] = useState<Error | null>(null);
  const [offline, setOffline] = useState(false);
  const restore = useCallback(async () => {
    setRestoring(true); setError(null);
    try { await controller?.restore(); }
    catch (failure) { setError(recoveryError(failure)); }
    finally { setRestoring(false); }
  }, []);
  useEffect(() => {
    if (controller) controller.onChange = setSession;
    void controller?.restore().catch(failure => setError(recoveryError(failure))).finally(() => setRestoring(false));
    cleanPersonalShares();
    const state = AppState.addEventListener('change', value => { focusManager.setFocused(value === 'active'); if (value === 'active') cleanPersonalShares(); });
    const applyNetwork = (value: Network.NetworkState) => {
      const connected = value.isConnected !== false && value.isInternetReachable !== false;
      onlineManager.setOnline(connected); setOffline(!connected);
    };
    void Network.getNetworkStateAsync().then(applyNetwork).catch(() => {});
    const network = Network.addNetworkStateListener(applyNetwork);
    return () => { state.remove(); network.remove(); if (controller) controller.onChange = () => {}; };
  }, [restore]);
  const scope = session ? `${session.agent.tenant_id}:${session.agent.id}:${session.agent.role}:${session.sessionId}` : 'anonymous';
  return <QueryClientProvider client={queryClient}><Context value={{ session, controller, configurationError, offline, scope }}>
    {restoring ? <SafeAreaView style={styles.screen}><Loading label="Restoring your session…" /></SafeAreaView> : error ? <SafeAreaView style={[styles.screen, styles.content]}><Notice error message={error.message} /><Button title="Retry session recovery" onPress={() => { void restore(); }} /></SafeAreaView> : children}
  </Context></QueryClientProvider>;
}
