import { useToast } from '../../contexts/ToastContext';
import type { ToastItem } from '../../contexts/ToastContext';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
    return (
        <div className={`toast-card toast-card--${toast.type}`}>
            <span className="toast-icon" aria-hidden="true">
                {toast.type === 'success' && <CheckCircle2 size={18} strokeWidth={1.7} />}
                {toast.type === 'error' && <CircleAlert size={18} strokeWidth={1.7} />}
                {toast.type === 'info' && <Info size={18} strokeWidth={1.7} />}
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
                aria-label="Dismiss notification"
                onClick={onDismiss}
            >
                <X size={16} strokeWidth={1.7} aria-hidden="true" />
            </button>
        </div>
    );
}

export function ToastContainer() {
    const { toasts, snackbar, dismissToast } = useToast();

    return (
        <>
            {/* aria-live="polite" announces new toasts without interrupting current speech */}
            <div
                className="toast-container"
                role="status"
                aria-live="polite"
                aria-atomic="false"
                aria-relevant="additions"
            >
                {toasts.map(t => (
                    <ToastCard key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
                ))}
            </div>

            {snackbar && (
                <div className="snackbar" role="status" aria-live="polite">
                    {snackbar.message}
                </div>
            )}
        </>
    );
}
