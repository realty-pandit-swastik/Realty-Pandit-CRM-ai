import { describe, it, expect } from 'vitest';

/**
 * Cross-package contract for the lead-tile identity + client-type helpers.
 *
 * `agents/frontend` has no test runner, so these pure functions (frontend lib/leadDisplay.ts
 * and lib/phone.ts) are covered from the backend suite by importing them directly — plain TS,
 * no DOM/React.
 */
import {
    dealerFallback,
    effectiveClientRole,
    isTemporaryClientRole,
    clientRoleLabel,
    clientRoleColor,
    CLIENT_ROLE_LABEL,
} from '../../../frontend/src/lib/leadDisplay';
import { isPlaceholderPhone, toDialablePhone } from '../../../frontend/src/lib/phone';
import { VALID_CLIENT_ROLES } from '../utils/client_role';

describe('dealerFallback', () => {
    it('shows the client when their own number is dialable', () => {
        expect(dealerFallback({
            name: 'Arshan', phone_number: '+917669969176',
            referral_partner_name: 'Sunny', referral_partner_phone: '9812345678',
        }, isPlaceholderPhone, toDialablePhone)).toEqual({
            name: 'Arshan', phone: '+917669969176', isDealer: false,
        });
    });

    it('returns the CANONICAL number (safe for tel:/wa.me), never the raw stored value', () => {
        // Bare "9812345678" as tel: has no +91 (known dialer bug); "+91-9654118097".slice(1)
        // would corrupt wa.me. The identity phone must always be E.164.
        expect(dealerFallback({
            name: 'Arshan', phone_number: '9812345678',
            referral_partner_name: null, referral_partner_phone: null,
        }, isPlaceholderPhone, toDialablePhone)).toEqual({
            name: 'Arshan', phone: '+919812345678', isDealer: false,
        });
        expect(dealerFallback({
            name: 'X', phone_number: '+91-9654118097',
            referral_partner_name: null, referral_partner_phone: null,
        }, isPlaceholderPhone, toDialablePhone)).toEqual({
            name: 'X', phone: '+919654118097', isDealer: false,
        });
    });

    it('falls back to the dealer for a placeholder (unknown-client) phone', () => {
        expect(dealerFallback({
            name: null, phone_number: 'PENDING-9812345678-m1',
            referral_partner_name: 'Sunny dir royal', referral_partner_phone: '9812345678',
        }, isPlaceholderPhone, toDialablePhone)).toEqual({
            name: 'Sunny dir royal', phone: '+919812345678', isDealer: true,
        });
    });

    it('never substitutes the dealer for a malformed client number', () => {
        // Junk must still read "No phone", not silently become someone else.
        expect(dealerFallback({
            name: 'X', phone_number: '+ChiragWadhwa',
            referral_partner_name: 'Sunny', referral_partner_phone: '9812345678',
        }, isPlaceholderPhone, toDialablePhone)).toEqual({
            name: 'X', phone: null, isDealer: false,
        });
    });

    it('returns no identity when neither side is usable', () => {
        expect(dealerFallback({
            name: null, phone_number: 'PENDING-1',
            referral_partner_name: null, referral_partner_phone: null,
        }, isPlaceholderPhone, toDialablePhone)).toEqual({ name: null, phone: null, isDealer: false });
    });
});

describe('client role precedence', () => {
    it('the temporary per-enquiry override wins over the primary role', () => {
        expect(effectiveClientRole({
            client_role: 'CLIENT',
            _deal: { client_role_override: 'CHOKIDAR' },
        })).toBe('CHOKIDAR');
        expect(isTemporaryClientRole({
            client_role: 'CLIENT',
            _deal: { client_role_override: 'CHOKIDAR' },
        })).toBe(true);
    });

    it('falls back to the primary role, then to null (renders as unclassified)', () => {
        expect(effectiveClientRole({ client_role: 'BUILDER', _deal: null })).toBe('BUILDER');
        expect(isTemporaryClientRole({ client_role: 'BUILDER', _deal: null })).toBe(false);
        expect(effectiveClientRole({ client_role: null, demand_transactions: [] })).toBeNull();
        expect(effectiveClientRole(null)).toBeNull();
    });

    it('labels and colors every known role, and degrades unknown codes to readable text', () => {
        for (const [code, label] of Object.entries(CLIENT_ROLE_LABEL)) {
            expect(clientRoleLabel(code)).toBe(label);
            expect(clientRoleColor(code)).toBeTruthy();
        }
        expect(clientRoleLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
        expect(clientRoleColor('SOMETHING_NEW')).toBe('#6b7280');
        expect(clientRoleLabel(null)).toBeNull();
    });

    it('backend allow-list and CRM vocabulary are the same set (independent deploys)', () => {
        // The two sides must never drift: the CRM makes no assumption the backend can't
        // produce, and vice versa. Extend BOTH lists together (utils/client_role.ts +
        // frontend lib/leadDisplay.ts CLIENT_ROLE_LABEL).
        expect([...VALID_CLIENT_ROLES].sort()).toEqual(Object.keys(CLIENT_ROLE_LABEL).sort());
    });
});
