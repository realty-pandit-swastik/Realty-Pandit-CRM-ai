import { useEffect, useRef, useState } from 'react';
import { useSession } from '../features/auth/SessionProvider';
import { readDraft, removeDraft, SavedDraft, writeDraft } from './drafts';

export function useEncryptedDraft<T extends Record<string, string>>(kind: string, parse: (value: unknown) => T) {
  const { scope, controller, session } = useSession();
  const partition = `${controller?.api.origin}:${scope}`;
  const [state, setState] = useState<{ partition: string; kind: string; ready: boolean; draft: SavedDraft<T> | null; status: string; error: string }>({ partition, kind, ready: false, draft: null, status: '', error: '' });
  const revision = useRef(0), mounted = useRef(true);
  const isCurrent = () => !!session && controller?.current?.sessionId === session.sessionId && controller.current.agent.id === session.agent.id && controller.current.agent.tenant_id === session.agent.tenant_id && controller.current.agent.role === session.agent.role;
  useEffect(() => {
    mounted.current = true;
    const operation = ++revision.current;
    void readDraft(partition, kind, parse).then(draft => {
      if (mounted.current && operation === revision.current) setState({ partition, kind, ready: true, draft, status: draft ? draft.recovered ? 'Previous saved draft recovered on this device.' : 'Draft restored from this device.' : '', error: '' });
    }).catch(() => {
      if (mounted.current && operation === revision.current) setState({ partition, kind, ready: true, draft: null, status: '', error: 'The saved draft could not be recovered. Your server record is unchanged.' });
    });
    return () => { mounted.current = false; };
  }, [partition, kind, parse]);
  const update = (value: T) => {
    const operation = ++revision.current;
    setState({ partition, kind, ready: true, draft: { value, savedAt: Date.now(), recovered: false }, status: 'Saving encrypted draft…', error: '' });
    void writeDraft(partition, kind, value, isCurrent).then(() => {
      if (mounted.current && operation === revision.current) setState(previous => ({ ...previous, status: 'Draft saved on this device.' }));
    }).catch(() => {
      if (mounted.current && operation === revision.current) setState(previous => ({ ...previous, status: '', error: 'Could not save this draft on the device. Keep this screen open and save online before leaving.' }));
    });
  };
  const clear = async () => {
    revision.current++;
    try { await removeDraft(partition, kind); setState({ partition, kind, ready: true, draft: null, status: '', error: '' }); return true; }
    catch { setState(previous => ({ ...previous, error: 'The local draft could not be removed. Try discarding it again.' })); return false; }
  };
  const current = state.partition === partition && state.kind === kind;
  return { ready: current && state.ready, draft: current ? state.draft : null, status: current ? state.status : '', error: current ? state.error : '', update, clear };
}
