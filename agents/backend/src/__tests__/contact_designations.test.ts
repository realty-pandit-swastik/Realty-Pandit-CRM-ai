import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../db';
import { CONTACT_ROLES, INVENTORY_CONTACT_ROLES, validateDesignation, validateLeadSource } from '../data/contact_catalog';
import { parseClientRole } from '../utils/client_role';
import { assertExternalPartnerPhone, resolveInventoryParties, validateInventoryPartyWrite } from '../services/inventory_parties';

beforeEach(() => { vi.clearAllMocks(); vi.mocked(prisma.agent.findMany).mockResolvedValue([{ phone: '+919000000002' }] as any); vi.mocked(prisma.contact.findFirst).mockResolvedValue(null); });

describe('shared contact vocabulary and validation', () => {
    it('keeps stored workflow identifiers and accepts every catalog role', () => {
        expect(INVENTORY_CONTACT_ROLES.find(r => r.code === 'CHOKIDAR')?.workflow).toBe('CHOKIDAR');
        for (const role of CONTACT_ROLES) expect(parseClientRole(role.code.toLowerCase())).toBe(role.code);
    });
    it.each(['CLIENT', 'AGENT', 'BUILDER', 'FINANCER', 'CHOKIDAR', 'OWNER', 'CARETAKER', 'TENANT', 'RELATIVE', 'EMPLOYEE'])('keeps role %s valid', role => {
        expect(validateDesignation(role, null).role).toBe(role);
    });
    it('requires a bounded label for Other and rejects invalid codes', () => {
        expect(() => validateDesignation('OTHER', '')).toThrow(/label/);
        expect(() => validateDesignation('OTHER', 'a'.repeat(61))).toThrow(/label/);
        expect(() => validateDesignation('ADMIN', null)).toThrow(/designation/);
        expect(validateDesignation('OTHER', '  Power of attorney  ')).toEqual({ role: 'OTHER', label: 'Power of attorney' });
        expect(() => validateLeadSource('other', '')).toThrow(/label/);
        expect(validateLeadSource('other', 'Local event').label).toBe('Local event');
        for (const source of ['manual', '99acres', 'magicbricks', 'housing', 'whatsapp', 'admin_created', 'walk_in', 'social_media']) expect(validateLeadSource(source, null).source).toBe(source);
    });
});

describe('property party write protection', () => {
    it('rejects staff even when an existing PartnerAgent profile would otherwise short circuit creation', async () => {
        await expect(assertExternalPartnerPhone('9000000002', 'tenant-1')).rejects.toThrow(/internal employee/);
        expect(prisma.agent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenant_id: 'tenant-1' } }));
    });
    it('requires an explicit employee role for a staff-valued property contact', async () => {
        await expect(validateInventoryPartyWrite({ tenant_id: 'tenant-1', owner_phone: '9000000002' })).rejects.toThrow(/Internal staff/);
        await expect(validateInventoryPartyWrite({ tenant_id: 'tenant-1', owner_phone: '9000000002', property_contact_role: 'EMPLOYEE' })).resolves.toBeUndefined();
        await expect(validateInventoryPartyWrite({ tenant_id: 'tenant-1', owner_phone: '9000000001', property_contact_role: 'EMPLOYEE' })).rejects.toThrow(/requires/);
    });
    it('does not trust a staff-valued partner even on an explicitly external-agent legacy row', () => {
        const result = resolveInventoryParties({ ownership_type: 'EXTERNAL_AGENT', owner_phone: '+919000000001', contact: { name: 'Actual contact' },
            referral_partner: { name: 'Employee', phone_number: '+919000000002' }, uploader_name: 'Employee' }, new Set(['+919000000002']));
        expect(result.source).toMatchObject({ name: 'Actual contact', designation: 'OWNER' });
    });
    it('keeps an unknown unrelated key-holder role unset and accepts an explicit designation', () => {
        const row = { ownership_type: 'OWNER', owner_phone: '+919000000001', contact: { name: 'Owner' }, key_holder_type: 'EXTERNAL', key_holder_phone: '+919000000003', key_holder_name: 'Holder' };
        expect(resolveInventoryParties(row, new Set()).key_holder_designation).toBeNull();
        expect(resolveInventoryParties({ ...row, key_holder_role: 'CARETAKER' }, new Set()).key_holder_designation).toBe('CARETAKER');
    });
    it('rejects a foreign-tenant contact before any party write', async () => {
        vi.mocked(prisma.contact.findFirst).mockResolvedValue({ phone_number: '+919000000001' } as any);
        await expect(validateInventoryPartyWrite({ tenant_id: 'tenant-1', owner_phone: '+919000000001' })).rejects.toThrow(/accessible/);
    });
    it('does not borrow a designation from a mismatched key-holder link', () => {
        const result = resolveInventoryParties({ owner_phone: '+919000000001', contact: { name: 'Owner' },
            key_holder_type: 'EXTERNAL', key_holder_phone: '+919000000003',
            key_holder_contact: { phone_number: '+919000000004', client_role: 'FINANCER' } }, new Set());
        expect(result.key_holder_designation).toBeNull();
    });
});
