// utils/floor.ts — single source of truth for rendering a property's floor everywhere
// (deal pipeline, PDF, WhatsApp share, partner messages, website, public API). (2026-06-27)
//
// Model: `floor_number` (Int) is the numeric SORT key; `floor_label` (String) is the authoritative
// DISPLAY value for named levels (Ground/Upper Ground/Basement/Stilt) — falls back to the number when
// null. `display_floor` (String) is an optional buyer-facing override (falls back to the real floor).

export const FLOOR_PRESETS: { label: string; sort: number }[] = [
    { label: 'Basement', sort: -2 },
    { label: 'Stilt', sort: -1 },
    { label: 'Ground', sort: 0 },
    { label: 'Upper Ground', sort: 1 },
];

/** Authoritative display string for a unit's floor: label wins, else the number, else ''. */
export function formatFloor(floorNumber: number | null | undefined, floorLabel?: string | null): string {
    if (floorLabel && String(floorLabel).trim()) return String(floorLabel).trim();
    if (floorNumber === null || floorNumber === undefined) return '';
    return String(floorNumber);
}

/** Buyer-facing floor: the `display_floor` override wins, else the real formatted floor. */
export function getDisplayFloor(inv: { display_floor?: string | null; floor_number?: number | null; floor_label?: string | null }): string {
    if (inv.display_floor && String(inv.display_floor).trim()) return String(inv.display_floor).trim();
    return formatFloor(inv.floor_number ?? null, inv.floor_label ?? null);
}

/** Derive { floor_number (sort), floor_label } from a raw capture value (preset name or number string). */
export function parseFloorInput(raw: string | number | null | undefined): { floor_number: number | null; floor_label: string | null } {
    if (raw === null || raw === undefined || String(raw).trim() === '') return { floor_number: null, floor_label: null };
    const s = String(raw).trim();
    const preset = FLOOR_PRESETS.find(p => p.label.toLowerCase() === s.toLowerCase());
    if (preset) return { floor_number: preset.sort, floor_label: preset.label };
    const n = parseInt(s, 10);
    if (Number.isFinite(n) && /^-?\d+$/.test(s)) return { floor_number: n, floor_label: null }; // plain (incl. negative) number → display the number
    return { floor_number: null, floor_label: s }; // any other custom string → keep as the label
}
