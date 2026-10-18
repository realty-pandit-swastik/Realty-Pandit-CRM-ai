import { describe, expect, it } from 'vitest';
import { attachListingActivity, CONTACT_EVENT_TYPES, phoneKey } from '../utils/inventory_activity';

const ROWS = [
    { id: 'a', owner_phone: '+919958804559', uploader_phone: '+919958804558', key_holder_phone: '+919958804557' },
    { id: 'b', owner_phone: '+919958804556', uploader_phone: null, key_holder_phone: null },
    { id: 'c', owner_phone: null, uploader_phone: null, key_holder_phone: null },
];

describe('phoneKey', () => {
    it('collapses every stored format to the same trailing-10 key', () => {
        expect(phoneKey('+919958804559')).toBe('9958804559');
        expect(phoneKey('919958804559')).toBe('9958804559');
        expect(phoneKey('9958804559')).toBe('9958804559');
        expect(phoneKey('+91-995-880-4559')).toBe('9958804559');
    });
    it('rejects non-Indian / placeholder / absent values', () => {
        expect(phoneKey('PENDING-abc')).toBe('');
        expect(phoneKey('+910000000000')).toBe('');
        expect(phoneKey('PENDING-9958804559')).toBe('');
        expect(phoneKey(null)).toBe('');
        expect(phoneKey('')).toBe('');
    });
});

describe('attachListingActivity', () => {
    it('takes the latest contact across owner/uploader/key-holder phones', () => {
        const k1 = 9958804559; // owner
        const k2 = '9958804558'; // uploader
        const k3 = '9958804557'; // key holder
        const k4 = '9958804556'; // row b owner
        const out = attachListingActivity(ROWS, {
            [k1]: '2026-09-01T00:00:00.000Z',
            [k2]: '2026-10-05T00:00:00.000Z', // latest wins
            [k3]: '2026-08-01T00:00:00.000Z',
            [k4]: '2026-07-01T00:00:00.000Z',
        }, {});
        expect(out[0].last_contacted_at).toBe('2026-10-05T00:00:00.000Z');
        expect(out[1].last_contacted_at).toBe('2026-07-01T00:00:00.000Z');
        expect(out[2].last_contacted_at).toBeNull();
    });

    it('matches a contact even when inventory and interaction formats differ', () => {
        const rows = [{ id: 'x', owner_phone: '9958804559' }]; // bare 10-digit on the listing
        const contacted = { 9958804559: '2026-10-05T00:00:00.000Z' }; // E.164-derived key
        expect(attachListingActivity(rows, contacted, {})[0].last_contacted_at)
            .toBe('2026-10-05T00:00:00.000Z');
    });

    it('attaches the next action per inventory and nulls when none', () => {
        const out = attachListingActivity(ROWS, {}, { b: '2026-10-20T10:00:00.000Z' });
        expect(out[0].next_action_at).toBeNull();
        expect(out[1].next_action_at).toBe('2026-10-20T10:00:00.000Z');
        expect(out[2].next_action_at).toBeNull();
    });

    it('never mutates the input rows', () => {
        const rows = [{ id: 'a', owner_phone: '+911' }];
        attachListingActivity(rows, {}, {});
        expect(rows[0]).toEqual({ id: 'a', owner_phone: '+911' });
    });
});

describe('CONTACT_EVENT_TYPES', () => {
    it('counts real outreach and excludes internal/system events', () => {
        expect(CONTACT_EVENT_TYPES).toContain('message');
        expect(CONTACT_EVENT_TYPES).toContain('call');
        expect(CONTACT_EVENT_TYPES).not.toContain('session_keepalive');
        expect(CONTACT_EVENT_TYPES).not.toContain('auth_success');
        expect(CONTACT_EVENT_TYPES).not.toContain('lead_recycled');
        expect(CONTACT_EVENT_TYPES).not.toContain('property_view');
    });
});
