import prisma from '../db';
import { inventorySourceKind } from '../utils/inventory_source';
import { normalizePhone, phoneVariants, isUnresolvedPropertyContactPhone } from '../utils/phone';
import { validateDesignation } from '../data/contact_catalog';

type Person = { name?: string | null; phone_number?: string; contact_type?: string; client_role?: string | null; client_role_label?: string | null };
const canonical = (phone?: string | null) => normalizePhone(phone || '');
const missingOwner = isUnresolvedPropertyContactPhone;
const standingRole = (person?: Person) => person?.client_role || ({ LANDLORD: 'OWNER', PARTNER_AGENT: 'AGENT', MANAGEMENT: 'EMPLOYEE', REAL_ESTATE_BUILDER: 'BUILDER', TENANT: 'TENANT' } as Record<string, string>)[person?.contact_type || ''] || null;

/** Pure property-party resolver. Assignment and upload attribution are never contact fallbacks. */
export function resolveInventoryParties(row: any, staffPhones: Set<string>, people = new Map<string, Person>()) {
    const isStaff = (phone?: string | null) => !!canonical(phone) && staffPhones.has(canonical(phone));
    let kind = inventorySourceKind(row);
    const dealer = kind === 'DEALER' && row.referral_partner && !isStaff(row.referral_partner.phone_number);
    if (kind === 'DEALER' && !dealer) kind = 'OWNER';
    const ownerAllowed = !isStaff(row.owner_phone) || row.property_contact_role === 'EMPLOYEE';
    const person = dealer ? row.referral_partner : ownerAllowed && !missingOwner(row.owner_phone) ? row.contact : null;
    const phone = person ? (dealer ? canonical(row.referral_partner.phone_number) : canonical(row.owner_phone)) : null;
    const role = person ? row.property_contact_role || (isStaff(phone) ? 'EMPLOYEE' : dealer || kind === 'AGENT_OWNER' ? 'AGENT' : row.contact?.client_role || 'OWNER') : null;
    const source = { type: kind, linked: !!person, name: person?.name || null, phone, designation: role,
        designation_label: role === 'OTHER' ? row.property_contact_role_label || row.contact?.client_role_label || null : null };
    const keyPhone = row.key_holder_type === 'OWNER' ? row.owner_phone
        : row.key_holder_type === 'UPLOADER' ? row.uploader_phone
            : row.key_holder_phone || row.key_holder_contact?.phone_number;
    const linked = canonical(row.key_holder_contact?.phone_number) === canonical(keyPhone)
        ? row.key_holder_contact || people.get(canonical(keyPhone)) : people.get(canonical(keyPhone));
    const samePerson = !!phone && canonical(keyPhone) === phone;
    const keyRole = (samePerson ? role : row.key_holder_role || (isStaff(keyPhone) ? 'EMPLOYEE' : standingRole(linked))) || null;
    return { source, owner_name: ownerAllowed && !missingOwner(row.owner_phone) ? row.contact?.name || null : null,
        key_holder_phone: canonical(keyPhone) || null,
        key_holder_name: row.key_holder_type === 'OWNER' ? row.contact?.name || null
            : row.key_holder_type === 'UPLOADER' ? linked?.name || row.uploader_name || null
                : row.key_holder_name || linked?.name || null,
        key_holder_designation: keyRole,
        key_holder_designation_label: keyRole === 'OTHER' ? (samePerson ? source.designation_label : row.key_holder_role_label || linked?.client_role_label) || null : null,
    };
}

/** Two bounded batch reads for the page, never a lookup for each tile. */
export async function inventoryPartyContext(rows: any[], tenantId: string) {
    if (!rows.length) return { staffPhones: new Set<string>(), people: new Map<string, Person>() };
    const phones = [...new Set(rows.flatMap(i => [i.key_holder_phone, i.uploader_phone]).filter(Boolean).flatMap(phoneVariants))];
    const [staff, contacts] = await Promise.all([
        prisma.agent.findMany({ where: { tenant_id: tenantId }, select: { phone: true } }),
        prisma.contact.findMany({ where: { tenant_id: tenantId, phone_number: { in: phones } }, select: { phone_number: true, name: true, contact_type: true, client_role: true, client_role_label: true } }),
    ]);
    return { staffPhones: new Set((staff || []).map(a => canonical(a.phone)).filter(Boolean)),
        people: new Map((contacts || []).map(c => [canonical(c.phone_number), c])) };
}

export async function assertExternalPartnerPhone(phone: string, tenantId: string) {
    if (!canonical(phone)) throw new Error('Valid external partner phone required');
    const foreignContact = await prisma.contact.findFirst({ where: { tenant_id: { not: tenantId }, phone_number: { in: phoneVariants(phone) } }, select: { phone_number: true } });
    if (foreignContact) throw new Error('Source contact is not accessible in this tenant');
    const staff = await prisma.agent.findMany({ where: { tenant_id: tenantId }, select: { phone: true } });
    if ((staff || []).some(a => canonical(a.phone) === canonical(phone))) {
        throw new Error('An internal employee cannot be registered or selected as an external partner');
    }
}

/** Shared write guard: explicit property role is distinct from assignment/global contact type. */
export async function validateInventoryPartyWrite(data: any, existing?: any) {
    const scalar = (value: any) => value && typeof value === 'object' && 'set' in value ? value.set : value;
    for (const prefix of ['property_contact', 'key_holder']) {
        if (data[`${prefix}_role`] !== undefined || data[`${prefix}_role_label`] !== undefined) {
            const designation = validateDesignation(scalar(data[`${prefix}_role`] !== undefined ? data[`${prefix}_role`] : existing?.[`${prefix}_role`]), scalar(data[`${prefix}_role_label`] !== undefined ? data[`${prefix}_role_label`] : existing?.[`${prefix}_role_label`]));
            data[`${prefix}_role`] = designation.role;
            data[`${prefix}_role_label`] = designation.label;
        }
    }
    const row = { ...existing, ...data };
    const tenantId = scalar(row.tenant_id) || data.tenant?.connect?.id;
    row.owner_phone = data.contact?.connect?.phone_number || scalar(row.owner_phone);
    row.referral_partner_id = data.referral_partner?.disconnect ? null : data.referral_partner?.connect?.id || scalar(row.referral_partner_id);
    if (!tenantId) throw new Error('Tenant is required for property contact validation');
    const keyContactId = data.key_holder_contact?.connect?.phone_number || scalar(data.key_holder_contact_id);
    if (keyContactId) {
        const keyContact = await prisma.contact.findFirst({ where: { tenant_id: tenantId, phone_number: keyContactId }, select: { phone_number: true } });
        if (!keyContact) throw new Error('Key-holder contact is not accessible in this tenant');
        if (row.key_holder_phone && canonical(row.key_holder_phone) !== canonical(keyContact.phone_number)) throw new Error('Key-holder phone and linked contact must identify the same person');
    }
    if (row.owner_phone && (!existing || data.owner_phone !== undefined || data.contact !== undefined || data.property_contact_role !== undefined)) {
        const foreignContact = await prisma.contact.findFirst({ where: { tenant_id: { not: tenantId }, phone_number: { in: phoneVariants(row.owner_phone) } }, select: { phone_number: true } });
        if (foreignContact) throw new Error('Property contact is not accessible in this tenant');
        const staff = await prisma.agent.findMany({ where: { tenant_id: tenantId }, select: { phone: true } });
        const internal = (staff || []).some(a => canonical(a.phone) === canonical(row.owner_phone));
        if (row.property_contact_role === 'EMPLOYEE' && !internal) throw new Error('Employee designation requires a linked internal employee phone');
        if (internal && row.property_contact_role !== 'EMPLOYEE') {
            throw Object.assign(new Error('Internal staff cannot be used as an external property contact; select the real contact'), { code: 'OWNER_IS_TEAM_MEMBER' });
        }
    }
    if (row.referral_partner_id && (!existing || data.referral_partner_id !== undefined || data.referral_partner !== undefined)) {
        const partner = await prisma.partnerAgent.findUnique({ where: { id: row.referral_partner_id }, select: { phone_number: true } });
        if (!partner) throw new Error('Source partner not found');
        await assertExternalPartnerPhone(partner.phone_number, tenantId);
    }
}
