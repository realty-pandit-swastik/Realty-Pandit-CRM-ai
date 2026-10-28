import { useEffect, useRef } from 'react';

/** Focus containment and return for existing conditionally-mounted overlays. */
export function useDialogFocus(onClose: () => void, enabled = true) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!enabled) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    if (!panel) return;
    panel.focus();
    const key = (e: KeyboardEvent) => {
      // A native dialog (e.g. command palette) opened from this drawer owns
      // its own focus and Escape handling while it is on the top layer.
      if ((e.target as HTMLElement)?.closest('dialog[open]')) return;
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); closeRef.current();
      }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
      )).filter(el => el.getClientRects().length > 0);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) { e.preventDefault(); panel.focus(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
        e.preventDefault(); first.focus();
      }
    };
    panel.addEventListener('keydown', key);
    return () => { panel.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
  }, [enabled]);
  return ref;
}
