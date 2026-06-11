import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  onConfirm, onCancel, variant = 'info',
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      // Save the element that triggered the dialog so we can return focus on close
      triggerRef.current = document.activeElement as HTMLElement;
      dialogRef.current?.showModal();
      // Defer focus so the dialog is fully rendered first
      setTimeout(() => cancelRef.current?.focus(), 50);
    } else {
      dialogRef.current?.close();
      // Return focus to the trigger element
      triggerRef.current?.focus();
    }
  }, [open]);

  // Focus trap: keep Tab / Shift+Tab within the dialog
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === dialogRef.current) onCancel();
  };

  const confirmColor = variant === 'danger' ? '#ef4444' : variant === 'warning' ? '#f59e0b' : '#3b82f6';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      aria-modal="true"
      onClick={handleBackdropClick}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      style={{
        border: 'none', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%',
        background: 'var(--bg-secondary, #1e293b)', color: 'var(--text-primary, #f1f5f9)',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
      }}
    >
      <h2 id="confirm-title" style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>{title}</h2>
      <p id="confirm-message" style={{ color: 'var(--text-secondary, #94a3b8)', marginBottom: '24px', lineHeight: 1.5 }}>{message}</p>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-primary, #334155)', background: 'transparent', color: 'var(--text-primary, #f1f5f9)', cursor: 'pointer', fontSize: '14px', minWidth: '44px', minHeight: '44px' }}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: confirmColor, color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: 600, minWidth: '44px', minHeight: '44px' }}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
