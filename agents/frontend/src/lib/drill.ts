/**
 * Drill-through — the foundation for "every dashboard number is clickable".
 *
 * This app has no URL router; navigation is a `setView(...)` state machine in
 * App.tsx. So a dashboard tile can't just link to `/inventory`. Instead it calls
 * `drillTo({ entity: 'inventory', filter: {...} })`, which dispatches a global
 * `rp:drill` CustomEvent — matching the app's existing decoupled-signal idiom
 * (see the `session-expired` event in lib/api.ts ↔ AuthContext).
 *
 * Phase 0 defines this contract only. Phase 1 (Property Analytics rebuild) wires
 * the App.tsx listener that maps an entity → setView + applies the filter, and
 * adds the onClick handlers to individual tiles — verified live in the browser.
 */

export type DrillEntity = 'leads' | 'inventory' | 'deals' | 'tasks';

export interface DrillTarget {
  /** which list to open */
  entity: DrillEntity;
  /** filters to pre-apply on that list (e.g. { status: 'active' }) */
  filter?: Record<string, string>;
}

export const DRILL_EVENT = 'rp:drill';

/** Open the filtered list for a dashboard metric. */
export function drillTo(target: DrillTarget): void {
  window.dispatchEvent(new CustomEvent<DrillTarget>(DRILL_EVENT, { detail: target }));
}

/** Subscribe to drill requests (App.tsx wires this in Phase 1). Returns an unsubscribe fn. */
export function onDrill(handler: (target: DrillTarget) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<DrillTarget>).detail);
  window.addEventListener(DRILL_EVENT, listener);
  return () => window.removeEventListener(DRILL_EVENT, listener);
}
