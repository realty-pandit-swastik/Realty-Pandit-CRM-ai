/**
 * ParkingListField — repeatable parking entries for the dynamic add/edit-inventory
 * schema form (taxonomy field `parking`, input_type `parking_list`).
 *
 * Each entry = { allocation?: 'Reserved' | 'Common', type?: 'Covered' | 'Open' }.
 * The number of entries IS the parking count. Both sub-fields are optional.
 * Value stored on the inventory as specs.parking = ParkingEntry[].
 *
 * Fully controlled: derives entries from `value` on every render and reports
 * changes via onChange — no internal state to drift. Defensively normalizes the
 * old shapes (a bare string, or a string[] from the previous multiselect) so the
 * EDIT form never crashes on a pre-migration listing.
 *
 * Self-contained inline styles (matches the app's chip look) so it renders the
 * same inside both SchemaFields copies (AddInventory.tsx + InventoryModal.tsx).
 */
import React from 'react';

export interface ParkingEntry {
    allocation?: string;
    type?: string;
}

const ALLOCATION = ['Reserved', 'Common'];
const COVER = ['Covered', 'Open'];

/** Coerce any historical/empty value into a clean ParkingEntry[]. */
export function normalizeParking(value: any): ParkingEntry[] {
    if (Array.isArray(value)) {
        if (value.length === 0) return [];
        if (typeof value[0] === 'object' && value[0] !== null) return value as ParkingEntry[];
        // legacy multiselect: ['Reserved','Covered'] → one entry per known token
        return (value as string[])
            .map((v) => (ALLOCATION.includes(v) ? { allocation: v } : COVER.includes(v) ? { type: v } : null))
            .filter(Boolean) as ParkingEntry[];
    }
    if (typeof value === 'string' && value) {
        if (ALLOCATION.includes(value)) return [{ allocation: value }];
        if (COVER.includes(value)) return [{ type: value }];
    }
    return [];
}

const chip = (on: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    borderRadius: '999px',
    fontSize: '12px',
    cursor: 'pointer',
    border: on ? '1px solid #059669' : '1px solid var(--border-secondary)',
    backgroundColor: on ? '#059669' : 'var(--bg-primary)',
    color: on ? '#fff' : 'var(--text-primary)',
});

export default function ParkingListField({
    value,
    onChange,
}: {
    value: any;
    onChange: (v: ParkingEntry[]) => void;
}) {
    const entries = normalizeParking(value);

    const setField = (i: number, group: 'allocation' | 'type', opt: string) => {
        const cur = entries[i]?.[group];
        onChange(entries.map((e, idx) => (idx === i ? { ...e, [group]: cur === opt ? undefined : opt } : e)));
    };
    const addEntry = () => onChange([...entries, {}]);
    const removeEntry = (i: number) => onChange(entries.filter((_, idx) => idx !== i));

    return (
        <div>
            {entries.map((e, i) => (
                <div
                    key={i}
                    style={{
                        border: '1px solid var(--border-secondary)',
                        borderRadius: '8px',
                        padding: '10px',
                        marginBottom: '8px',
                        background: 'var(--bg-secondary)',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>Parking {i + 1}</span>
                        <button
                            type="button"
                            onClick={() => removeEntry(i)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}
                            aria-label={`Remove parking ${i + 1}`}
                        >
                            ✕
                        </button>
                    </div>
                    <div style={{ marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Allocation</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {ALLOCATION.map((o) => (
                                <button key={o} type="button" onClick={() => setField(i, 'allocation', o)} style={chip(e.allocation === o)}>
                                    {o}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Type</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {COVER.map((o) => (
                                <button key={o} type="button" onClick={() => setField(i, 'type', o)} style={chip(e.type === o)}>
                                    {o}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
            <button
                type="button"
                onClick={addEntry}
                style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    border: '1px dashed var(--border-secondary)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                }}
            >
                + Add parking
            </button>
        </div>
    );
}
