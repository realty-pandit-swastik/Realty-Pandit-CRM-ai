// Website mirror of backend utils/floor.ts — keep in sync. (2026-06-27)
// floor_number = numeric sort key; floor_label = authoritative display value for named levels
// (Ground/Upper Ground/Basement/Stilt); display_floor = optional buyer-facing override.

export const FLOOR_PRESETS: { label: string; sort: number }[] = [
    { label: 'Basement', sort: -2 },
    { label: 'Stilt', sort: -1 },
    { label: 'Ground', sort: 0 },
    { label: 'Upper Ground', sort: 1 },
];

export function formatFloor(floorNumber: number | null | undefined, floorLabel?: string | null): string {
    if (floorLabel && String(floorLabel).trim()) return String(floorLabel).trim();
    if (floorNumber === null || floorNumber === undefined) return '';
    return String(floorNumber);
}

export function getDisplayFloor(inv: { display_floor?: string | null; floor_number?: number | null; floor_label?: string | null } | null | undefined): string {
    if (!inv) return '';
    if (inv.display_floor && String(inv.display_floor).trim()) return String(inv.display_floor).trim();
    return formatFloor(inv.floor_number ?? null, inv.floor_label ?? null);
}
