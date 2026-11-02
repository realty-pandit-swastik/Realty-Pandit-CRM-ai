import { useEffect, useRef, useState } from 'react';
import { Search, ArrowUpRight } from 'lucide-react';

export interface CommandItem { id: string; label: string; section: string; }

/** Searches only destinations already permitted by the calling navigation. No API calls. */
export function CommandPalette({ items, onNavigate }: {
  items: CommandItem[];
  onNavigate: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const open = () => {
    trigger.current = document.activeElement as HTMLElement;
    setQuery('');
    if (!dialog.current?.open) dialog.current?.showModal();
  };
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
  const filtered = items.filter(item => `${item.label} ${item.section}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <button type="button" className="rp-command-trigger" onClick={open} aria-label="Search navigation (Control or Command K)">
      <Search size={16} aria-hidden="true" /> <span>Go to…</span><kbd>Ctrl / ⌘ K</kbd>
    </button>
    <dialog ref={dialog} className="rp-command" aria-labelledby="rp-command-title"
      onClose={() => trigger.current?.focus()}
      onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      <div className="rp-command-header">
        <label id="rp-command-title" htmlFor="rp-command-query">Find a workspace</label>
        <button type="button" className="rp-btn rp-btn--ghost" onClick={() => dialog.current?.close()}>Close <kbd>Esc</kbd></button>
      </div>
      <input id="rp-command-query" autoFocus className="rp-input" type="search" placeholder="Search your available pages…"
        value={query} onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            dialog.current?.querySelector<HTMLButtonElement>('[data-command-result]')?.focus();
          }
        }} />
      <div className="rp-command-results" onKeyDown={e => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
        const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
        if (!buttons.length) return;
        e.preventDefault();
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
          : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
        {filtered.map(item => <button key={item.id} data-command-result type="button" onClick={() => {
          dialog.current?.close();
          onNavigate(item.id);
        }}><span><strong>{item.label}</strong><small>{item.section}</small></span><ArrowUpRight size={16} aria-hidden="true" /></button>)}
        {!filtered.length && <p role="status">No available pages match “{query}”. Try another name.</p>}
      </div>
    </dialog>
  </>;
}
