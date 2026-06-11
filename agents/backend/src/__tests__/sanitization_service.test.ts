import { describe, it, expect } from 'vitest';
import { SanitizationService, Viewer } from '../services/sanitization_service';

const svc = new SanitizationService();

const rawInventory = {
    id: 'inv1',
    title: '3BHK in Dwarka',
    city: 'Delhi',
    locality: 'Dwarka',
    full_address: '123 Main St, Apt 4B, Sector 12',
    flat_no: 'A-1201',
    price: 8000000,
    customer_price: 7500000,
    display_price: 8000000,
    latitude: 28.5921,
    longitude: 77.0460,
    owning_manager_id: 'agent-X',
    owner_id: 'owner-uuid-9',
    referral_partner_id: 'partner-1',
    assigned_agent_id: 'agent-assigned-1',
    uploaded_by_agent_id: 'agent-uploaded-1',
    reference_agent_id: 'agent-ref-1',
    owner: { id: 'owner-9', name: 'Ravi Kumar', phone_number: '+919876543210' },
    key_holder: { name: 'Amit', phone_number: '+919811122233' },
    key_holder_phone: '+919811122233',
    uploader_name: 'Raj',
    uploader_phone: '+919900001111',
};

describe('SanitizationService.sanitizeInventory', () => {
    it('returns full data to the owning manager', () => {
        const v: Viewer = { role: 'agent', agentId: 'agent-X', isSuperBoss: false };
        const out = svc.sanitizeInventory(rawInventory, v);
        expect(out.owner.phone_number).toBe('+919876543210');
        expect(out.referral_partner_id).toBe('partner-1');
        expect(out.owning_manager_id).toBe('agent-X');
        expect(out.full_address).toBe('123 Main St, Apt 4B, Sector 12');
    });

    it('returns full data to super_boss', () => {
        const v: Viewer = { role: 'agent', agentId: 'agent-Y', isSuperBoss: true };
        const out = svc.sanitizeInventory(rawInventory, v);
        expect(out.owner.phone_number).toBe('+919876543210');
        expect(out.referral_partner_id).toBe('partner-1');
    });

    it('strips owner + source from foreign manager (non-owning internal agent)', () => {
        const v: Viewer = { role: 'agent', agentId: 'agent-Y', isSuperBoss: false };
        const out: any = svc.sanitizeInventory(rawInventory, v);
        expect(out.owner).toBeUndefined();
        expect(out.key_holder).toBeUndefined();
        expect(out.key_holder_phone).toBeUndefined();
        expect(out.uploader_name).toBeUndefined();
        expect(out.uploader_phone).toBeUndefined();
        expect(out.referral_partner_id).toBeUndefined();
        expect(out.owning_manager_id).toBeUndefined();
        expect(out.owner_id).toBeUndefined();
        expect(out.customer_price).toBeUndefined();
        expect(out.assigned_agent_id).toBeUndefined();
        expect(out.uploaded_by_agent_id).toBeUndefined();
        expect(out.reference_agent_id).toBeUndefined();
        // Property details stay visible for matching
        expect(out.title).toBe('3BHK in Dwarka');
        expect(out.locality).toBe('Dwarka');
        expect(out.price).toBe(8000000);
        expect(out.display_price).toBe(8000000);
        // Exact address stays for foreign manager (they can still coordinate via owning manager)
        expect(out.full_address).toBe('123 Main St, Apt 4B, Sector 12');
    });

    it('strips owner + source + exact address for partner viewer', () => {
        const v: Viewer = { role: 'partner', partnerAgentId: 'partner-2' };
        const out: any = svc.sanitizeInventory(rawInventory, v);
        expect(out.owner).toBeUndefined();
        expect(out.referral_partner_id).toBeUndefined();
        expect(out.owning_manager_id).toBeUndefined();
        expect(out.owner_id).toBeUndefined();
        expect(out.customer_price).toBeUndefined();
        expect(out.assigned_agent_id).toBeUndefined();
        expect(out.uploaded_by_agent_id).toBeUndefined();
        expect(out.reference_agent_id).toBeUndefined();
        expect(out.full_address).toBeUndefined();
        expect(out.flat_no).toBeUndefined();
        expect(out.latitude).toBeUndefined();
        expect(out.longitude).toBeUndefined();
        // Locality/city still visible so the partner can understand scope
        expect(out.locality).toBe('Dwarka');
        expect(out.city).toBe('Delhi');
        expect(out.price).toBe(8000000);
        expect(out.display_price).toBe(8000000);
    });

    it('strips for partner even when they are the referring partner (platform = middleman, always)', () => {
        const v: Viewer = { role: 'partner', partnerAgentId: 'partner-1' };
        const out: any = svc.sanitizeInventory(rawInventory, v);
        expect(out.owner).toBeUndefined();
        expect(out.referral_partner_id).toBeUndefined();
    });

    it('handles null/empty rows defensively', () => {
        const v: Viewer = { role: 'agent', agentId: 'x', isSuperBoss: false };
        expect(svc.sanitizeInventory(null as any, v)).toBeNull();
        expect(svc.sanitizeInventory(undefined as any, v)).toBeUndefined();
    });
});

describe('SanitizationService.sanitizeInventoryList', () => {
    it('applies per-row for mixed ownership', () => {
        const rows = [
            { id: 'a', owning_manager_id: 'agent-X', owner: { phone_number: '+91000000001' }, title: 'A' },
            { id: 'b', owning_manager_id: 'agent-Y', owner: { phone_number: '+91000000002' }, title: 'B' },
        ];
        const v: Viewer = { role: 'agent', agentId: 'agent-X', isSuperBoss: false };
        const out = svc.sanitizeInventoryList(rows, v);
        expect(out[0].owner).toBeDefined(); // X owns
        expect((out[1] as any).owner).toBeUndefined(); // Y's
    });

    it('returns input unchanged if not an array', () => {
        const v: Viewer = { role: 'agent', agentId: 'x', isSuperBoss: false };
        expect(svc.sanitizeInventoryList(null as any, v)).toBeNull();
    });
});

describe('SanitizationService.sanitizeContact', () => {
    it('strips name/phone/email for non-owner', () => {
        const contact = {
            id: 'c1',
            owning_manager_id: 'agent-X',
            name: 'Jane Doe',
            phone_number: '+919999988888',
            email: 'jane@x.com',
        };
        const v: Viewer = { role: 'agent', agentId: 'agent-Y', isSuperBoss: false };
        const out: any = svc.sanitizeContact(contact, v);
        expect(out.name).toBeUndefined();
        expect(out.phone_number).toBeUndefined();
        expect(out.email).toBeUndefined();
        expect(out.id).toBe('c1');
    });

    it('keeps name/phone/email for owning manager', () => {
        const contact = {
            id: 'c1',
            owning_manager_id: 'agent-X',
            name: 'Jane Doe',
            phone_number: '+919999988888',
            email: 'jane@x.com',
        };
        const v: Viewer = { role: 'agent', agentId: 'agent-X', isSuperBoss: false };
        const out = svc.sanitizeContact(contact, v);
        expect(out.phone_number).toBe('+919999988888');
    });
});
