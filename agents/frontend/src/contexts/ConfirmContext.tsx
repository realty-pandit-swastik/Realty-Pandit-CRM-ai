import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import ConfirmDialog from '../components/ui/ConfirmDialog';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** 'danger' uses a red confirm button (default). 'warning' uses yellow. 'info' uses blue. */
  variant?: 'danger' | 'warning' | 'info';
}

interface DialogState {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

interface ConfirmContextType {
  /** Opens a confirm dialog and returns a Promise<boolean>. Awaitable from any async handler. */
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  /** @internal — used by ConfirmDialogRoot to render the active dialog */
  _dialogState: DialogState | null;
  /** @internal */
  _respond: (value: boolean) => void;
}

export const ConfirmContext = createContext<ConfirmContextType>({
  confirm: () => Promise.resolve(false),
  _dialogState: null,
  _respond: () => {},
});

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    const normalised: ConfirmOptions =
      typeof options === 'string' ? { message: options } : options;

    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setDialogState({ options: normalised, resolve });
    });
  }, []);

  const respond = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setDialogState(null);
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm, _dialogState: dialogState, _respond: respond }}>
      {children}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext).confirm;
}

/**
 * Renders the accessible confirm dialog modal at the app root.
 * Place this once inside <ConfirmProvider>.
 */
export function ConfirmDialogRoot() {
  const { _dialogState: state, _respond: respond } = useContext(ConfirmContext);
  if (!state) return null;
  return (
    <ConfirmDialog
      open
      title={state.options.title ?? ''}
      message={state.options.message}
      confirmLabel={state.options.confirmText ?? 'Confirm'}
      cancelLabel={state.options.cancelText ?? 'Cancel'}
      variant={state.options.variant ?? 'danger'}
      onConfirm={() => respond(true)}
      onCancel={() => respond(false)}
    />
  );
}
