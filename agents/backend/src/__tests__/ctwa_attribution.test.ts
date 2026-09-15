import { describe, it, expect } from 'vitest';
import { extractCtwaReferral } from '../services/ctwa_attribution';

// A real Meta CTWA referral payload shape, as it arrives on the first inbound
// message after someone taps a Click-to-WhatsApp ad.
const REAL_REFERRAL = {
    source_url: 'https://fb.me/2AbCdEf',
    source_id: '120249378156770547',
    source_type: 'ad',
    headline: '3BHK in Vaishali',
    body: 'Ready to move. Talk to us on WhatsApp.',
    media_type: 'video',
    ctwa_clid: 'ARBc1dEfGh2IjKl3MnOp',
};

describe('extractCtwaReferral', () => {
    it('extracts the ad id and creative fields from a real referral', () => {
        const ref = extractCtwaReferral({ referral: REAL_REFERRAL });
        expect(ref).not.toBeNull();
        expect(ref!.adId).toBe('120249378156770547');
        expect(ref!.ctwaClid).toBe('ARBc1dEfGh2IjKl3MnOp');
        expect(ref!.sourceType).toBe('ad');
        expect(ref!.headline).toBe('3BHK in Vaishali');
        expect(ref!.sourceUrl).toBe('https://fb.me/2AbCdEf');
    });

    it('returns null for ordinary organic messages', () => {
        expect(extractCtwaReferral({ text: { body: 'hi' } })).toBeNull();
        expect(extractCtwaReferral({})).toBeNull();
        expect(extractCtwaReferral(null)).toBeNull();
        expect(extractCtwaReferral(undefined)).toBeNull();
    });

    it('returns null when a referral carries neither an ad id nor a click id', () => {
        // Organic post referrals can arrive with only descriptive fields; there is
        // nothing to attribute, so they must not create a bogus attribution record.
        expect(extractCtwaReferral({ referral: { headline: 'Just a post' } })).toBeNull();
    });

    it('still attributes when only one of ad id / click id is present', () => {
        const adOnly = extractCtwaReferral({ referral: { source_id: '123' } });
        expect(adOnly!.adId).toBe('123');
        expect(adOnly!.ctwaClid).toBeNull();

        const clidOnly = extractCtwaReferral({ referral: { ctwa_clid: 'xyz' } });
        expect(clidOnly!.ctwaClid).toBe('xyz');
        expect(clidOnly!.adId).toBeNull();
    });

    it('keeps a string ad id byte-exact', () => {
        // Meta sends source_id as a STRING, which matters: real ad ids like
        // 120249378156770547 are larger than Number.MAX_SAFE_INTEGER, so anything
        // that routes them through a JS number corrupts the last digits
        // (…547 → …540). Passing the string straight through is the only safe path.
        const ref = extractCtwaReferral({ referral: { source_id: '120249378156770547' } });
        expect(ref!.adId).toBe('120249378156770547');
        expect(typeof ref!.adId).toBe('string');
    });

    it('coerces a numeric id to a string', () => {
        const ref = extractCtwaReferral({ referral: { source_id: 12345 } });
        expect(ref!.adId).toBe('12345');
        expect(typeof ref!.adId).toBe('string');
    });
});
