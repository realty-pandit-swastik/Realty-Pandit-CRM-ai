import { useToast } from '../../contexts/ToastContext';
import type { ToastItem } from '../../contexts/ToastContext';

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
    return (
        <div className={`toast-card toast-card--${toast.type}`}>
            <span className="toast-icon">
                {toast.type === 'success' && '✅'}
                {toast.type === 'error' && '❌'}
                {toast.type === 'info' && 'ℹ️'}
            </span>
            <span className="toast-message">{toast.message}</span>
            {toast.undoFn && (
                <button
                    type="button"
                    className={`toast-undo-btn toast-undo-btn--${toast.type}`}
                    onClick={() => { toast.undoFn!(); onDismiss(); }}
                >
                    Undo
                </button>
            )}
            <button
                type="button"
                className="toast-dismiss-btn"
                onClick={onDismiss}
            >
                ×
            </button>
        </div>
    );
}

export function ToastContainer() {
    const { toasts, snackbar, dismissToast } = useToast();

    return (
        <>
            {toasts.length > 0 && (
                <div className="toast-container">
                    {toasts.map(t => (
                        <ToastCard key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
                    ))}
                </div>
            )}

            {snackbar && (
                <div className="snackbar">
                    {snackbar.message}
                </div>
            )}
        </>
    );
}
