import { describe, expect, it } from 'vitest';
import { inventorySourceKind } from '../utils/inventory_source';

describe('inventorySourceKind', () => {
    it('marks an explicitly external-agent listing as a dealer', () => {
        expect(inventorySourceKind({ ownership_type: 'EXTERNAL_AGENT' })).toBe('DEALER');
    });

    it('keeps an explicitly agent-owned listing as agent-owner', () => {
        expect(inventorySourceKind({ ownership_type: 'AGENT_OWNER' })).toBe('AGENT_OWNER');
    });

    it('marks a partner-attributed listing as a dealer even when ownership_type is unset', () => {
        // ownership_type is NULL on most rows (only ever set explicitly), so without this a
        // dealer's listing reads as "Owner" on the tile.
        expect(inventorySourceKind({ ownership_type: null, referral_partner_id: 'partner-1' })).toBe('DEALER');
        expect(
            inventorySourceKind({
                ownership_type: 'OWNER',
                referral_partner: { phone_number: '+919000000001', name: 'Dealer Dan' },
            }),
        ).toBe('DEALER');
    });

    it('lets an explicit classification win over the partner link', () => {
        expect(inventorySourceKind({ ownership_type: 'AGENT_OWNER', referral_partner_id: 'partner-1' })).toBe('AGENT_OWNER');
    });

    it('defaults a direct-owner listing to owner', () => {
        expect(inventorySourceKind({ ownership_type: 'OWNER' })).toBe('OWNER');
        expect(inventorySourceKind({})).toBe('OWNER');
        expect(inventorySourceKind(null)).toBe('OWNER');
    });
});