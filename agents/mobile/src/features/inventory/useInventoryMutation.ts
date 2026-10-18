import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import { useSession } from '../auth/SessionProvider';
export function useInventoryMutation() {
  const cache = useQueryClient(), { scope, offline } = useSession();
  const active = useRef<AbortController | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  useEffect(() => () => { active.current?.abort(); }, [scope]);
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (offline || active.current || uncertain) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('');
    try { await action(controller.signal); if (!controller.signal.aborted) void cache.invalidateQueries({ queryKey: [scope] }); }
    catch (e) { if (e instanceof ApiError && e.ambiguous) setUncertain(true); setError(e instanceof Error ? e.message : 'The action could not be completed.'); }
    finally { active.current = null; setBusy(false); }
  }
  return { run, busy, error, uncertain, disabled: offline || busy || uncertain, acknowledgeUncertain: () => setUncertain(false), cancel: () => active.current?.abort() };
}
