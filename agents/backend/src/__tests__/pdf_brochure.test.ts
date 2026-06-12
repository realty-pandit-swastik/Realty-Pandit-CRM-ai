import { describe, it, expect } from 'vitest';
import { brochureFilename, redactForBrandless, generateInventoryPdfStream } from '../services/pdf_generator';
import { signPdfToken, verifyPdfToken } from '../utils/pdf_token';

const inv: any = {
    id: 'x', display_id: 'RP-GZB-RES-20471', type: 'flat', specs: { bhk: 3 },
    apartment_name: 'Prestige Tower', flat_no: '302', plot_no: null,
    full_address: 'Flat 302, Prestige Tower, Whitefield', sub_locality: 'Block C',
    locality: 'Whitefield', city: 'Bengaluru', owner_phone: '+9199', owner_name: 'Owner',
    media_urls: [],
};

describe('brandless redaction (building+locality+city visible, unit hidden)', () => {
    const r = redactForBrandless(inv);
    it('hides flat/plot + owner + literal full address', () => {
        expect(r.flat_no).toBeNull();
        expect(r.plot_no).toBeNull();
        expect(r.owner_phone).toBeNull();
        expect(r.owner_name).toBeNull();
        expect(r.full_address).toBeNull(); // may embed the unit number → strip
    });
    it('KEEPS building name + locality + city', () => {
        expect(r.apartment_name).toBe('Prestige Tower');
        expect(r.locality).toBe('Whitefield');
        expect(r.city).toBe('Bengaluru');
    });
});

describe('brochureFilename', () => {
    it('is human-readable, inventory-related, and carries NO brand', () => {
        const f = brochureFilename(inv);
        expect(f).toMatch(/RP-GZB-RES-20471\.pdf$/);
        expect(f.toLowerCase()).not.toContain('realtypandit');
        expect(f).toMatch(/^[\w.-]+$/); // safe charset only
        expect(f).toContain('3BHK');
    });
});

describe('generateInventoryPdfStream smoke (renders without crashing)', () => {
    it('produces a valid non-empty PDF for a brandless single property', async () => {
        const buf: Buffer = await new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            const s = generateInventoryPdfStream([inv], { variant: 'brandless', partnerName: 'Shiv', partnerPhone: '+9199' });
            s.on('data', (c: Buffer) => chunks.push(c));
            s.on('end', () => resolve(Buffer.concat(chunks)));
            s.on('error', reject);
        });
        expect(buf.slice(0, 4).toString()).toBe('%PDF');
        expect(buf.length).toBeGreaterThan(800);
    });
});

describe('pdf_token', () => {
    it('round-trips and rejects tampering', () => {
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const tok = signPdfToken('inv1', 'brandless', exp);
        expect(verifyPdfToken('inv1', 'brandless', tok)).toBe(true);
        expect(verifyPdfToken('inv1', 'branded', tok)).toBe(false); // variant-bound
        expect(verifyPdfToken('inv2', 'brandless', tok)).toBe(false); // id-bound
    });
    it('rejects an expired token', () => {
        const tok = signPdfToken('inv1', 'brandless', Math.floor(Date.now() / 1000) - 10);
        expect(verifyPdfToken('inv1', 'brandless', tok)).toBe(false);
    });
});
