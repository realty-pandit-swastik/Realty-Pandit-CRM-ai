import { useId } from 'react';
import { INVENTORY_CONTACT_ROLES } from '../../../backend/src/data/contact_catalog';

/** Native select preserves keyboard/touch interaction without a custom combobox. */
export function ContactDesignationField({ value, label, onChange, title = 'Designation', workflow = false }: {
    value: string; label?: string; onChange: (role: string, label: string) => void; title?: string; workflow?: boolean;
}) {
    const id = useId();
    const other = value === 'OTHER';
    return <div style={{ display: 'grid', gap: 6, marginBlock: 10 }}>
        <label htmlFor={id}>{title}</label>
        <select id={id} value={value} onChange={e => onChange(e.target.value, '')} style={{ padding: 10, borderRadius: 8, color: 'var(--text-primary)', background: 'var(--bg-primary)', border: '1px solid var(--border-secondary)' }}>
            <option value="">Role not set</option>
            {INVENTORY_CONTACT_ROLES.map(role => <option key={role.code} value={workflow ? role.workflow : role.code}>{role.label}</option>)}
        </select>
        {other && <><label htmlFor={`${id}-other`}>Other role (2–60 characters)</label>
            <input id={`${id}-other`} value={label || ''} required minLength={2} maxLength={60} onChange={e => onChange(value, e.target.value)} /></>}
    </div>;
}
