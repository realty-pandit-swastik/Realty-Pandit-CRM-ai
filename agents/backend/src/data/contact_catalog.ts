/** Shared, dependency-free contract imported by API validation and CRM controls. */
export const CONTACT_ROLES = [
    { code: 'CLIENT', label: 'Client', workflow: '', contactType: 'UNKNOWN', color: '#3b82f6' },
    { code: 'OWNER', label: 'Owner', workflow: 'PROPERTY_OWNER', contactType: 'LANDLORD', color: '#16a34a' },
    { code: 'AGENT', label: 'Agent / Dealer', workflow: 'AGENT_DEALER', contactType: 'PARTNER_AGENT', color: '#7c3aed' },
    { code: 'FINANCER', label: 'Financer', workflow: 'FINANCER', contactType: 'UNKNOWN', color: '#14b8a6' },
    { code: 'CHOKIDAR', label: 'Chowkidar', workflow: 'CHOKIDAR', contactType: 'UNKNOWN', color: '#64748b' },
    { code: 'CARETAKER', label: 'Caretaker', workflow: 'CARETAKER', contactType: 'UNKNOWN', color: '#0f766e' },
    { code: 'BUILDER', label: 'Builder / Developer', workflow: 'BUILDER', contactType: 'REAL_ESTATE_BUILDER', color: '#b45309' },
    { code: 'TENANT', label: 'Tenant', workflow: 'TENANT', contactType: 'TENANT', color: '#9333ea' },
    { code: 'RELATIVE', label: 'Family member / Relative', workflow: 'RELATIVE', contactType: 'UNKNOWN', color: '#be185d' },
    { code: 'EMPLOYEE', label: 'Employee', workflow: 'EMPLOYEE', contactType: 'MANAGEMENT', color: '#475569' },
    { code: 'OTHER', label: 'Other', workflow: 'OTHER', contactType: 'UNKNOWN', color: '#6b7280' },
] as const;
export const INVENTORY_CONTACT_ROLES = CONTACT_ROLES.filter(role => role.workflow);
export const LEAD_SOURCES = [
    { code: 'manual', label: 'Client (direct)' },
    { code: 'partner', label: 'Partner Agent' },
    { code: 'walk_in', label: 'Walk-in' },
    { code: 'referral', label: 'Referral' },
    { code: 'website', label: 'Website' },
    { code: '99acres', label: '99acres' },
    { code: 'magicbricks', label: 'MagicBricks' },
    { code: 'housing', label: 'Housing.com' },
    { code: 'social_media', label: 'Social media' },
    { code: 'cold_call', label: 'Cold call' },
    { code: 'whatsapp', label: 'WhatsApp' },
    { code: 'facebook', label: 'Facebook' },
    { code: 'instagram', label: 'Instagram' },
    { code: 'voice', label: 'Voice' },
    { code: 'admin_created', label: 'Admin created' },
    { code: 'inventory_workflow', label: 'Inventory workflow' },
    { code: 'website_popup', label: 'Website popup' },
    { code: 'agent_registration', label: 'Agent registration' },
    { code: 'other', label: 'Other' },
] as const;
export function shortLabel(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const label = value.trim();
    return label.length >= 2 && label.length <= 60 && !/[\x00-\x1f\x7f]/.test(label) ? label : null;
}
export function validateDesignation(role: unknown, label: unknown) {
    if (role == null || role === '') return { role: null, label: null };
    const found = CONTACT_ROLES.find(r => r.code === role);
    if (!found) throw new Error('Choose a valid contact designation');
    const other = role === 'OTHER' ? shortLabel(label) : null;
    if (role === 'OTHER' && !other) throw new Error('Other requires a label of 2–60 characters');
    return { role: found.code, label: other };
}
export function validateLeadSource(source: unknown, label: unknown) {
    if (source == null || source === '') return { source: 'manual', label: null };
    if (typeof source !== 'string' || !LEAD_SOURCES.some(s => s.code === source)) throw new Error('Choose a valid lead source');
    const other = source === 'other' ? shortLabel(label) : null;
    if (source === 'other' && !other) throw new Error('Other requires a label of 2–60 characters');
    return { source, label: other };
}
