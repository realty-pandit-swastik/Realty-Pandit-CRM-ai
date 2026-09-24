import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Guards the WhatsApp property share (2026-09-24):
 *  - every recipient — client, partner, employee, self — gets photos + videos + details by
 *    default; the PDF only when ticked (partners used to get the PDF instead of the listing);
 *  - 2+ photos/videos go as ONE interactive carousel with the details as its body; if Meta
 *    rejects it, each attachment goes individually with the details on the first;
 *  - the PDF carries the details as its caption inside the 24h window.
 */
const wa = vi.hoisted(() => ({
    sendMediaStrict: vi.fn(),
    sendCarouselStrict: vi.fn(),
    sendTextStrict: vi.fn(),
    sendTemplate: vi.fn(),
    sendDocumentTemplate: vi.fn(),
}));
const session = vi.hoisted(() => ({ active: true }));

vi.mock('../db', () => ({ default: { partnerAgent: { findFirst: vi.fn() } } }));
vi.mock('../services/whatsapp', () => ({ WhatsAppService: vi.fn(function () { return wa; }) }));
vi.mock('../services/session_tracker', () => ({
    SessionTracker: { isSessionActive: vi.fn(async () => session.active) },
}));

import prisma from '../db';
import { sharePropertyToRecipient, parseShareContent, DEFAULT_SHARE_CONTENT } from '../services/property_sharing';

const inv = {
    id: 'inv-1', type: 'flat', category: 'residential', intent: 'sale', city: 'Gurugram', locality: 'Sector 56',
    price: 6500000, specs: { bhk: 3, area: 1450 },
    media_urls: ['/uploads/properties/inv-1/a.webp', 'https://cdn.example.com/b.jpg'],
    video_urls: ['https://cdn.example.com/tour.mp4'],
};
const PARTNER = { phone_number: '+919810000000', name: 'Shiv Realty' };
const carouselCards = () => wa.sendCarouselStrict.mock.calls[0]?.[2] as { type: string; url: string }[];

describe('sharePropertyToRecipient — share dialog content', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        session.active = true;
        (prisma.partnerAgent.findFirst as any).mockResolvedValue(null);
    });

    it('defaults to photos + videos, no PDF', () => {
        expect(DEFAULT_SHARE_CONTENT).toEqual({ photos: true, videos: true, pdf: false });
        expect(parseShareContent(undefined)).toEqual(DEFAULT_SHARE_CONTENT);
        expect(parseShareContent({ pdf: true, photos: 'yes' })).toEqual({ photos: true, videos: true, pdf: true });
    });

    for (const [who, partner] of [['client', null], ['partner agent', PARTNER]] as const) {
        it(`${who}: default sends ONE carousel of every photo + video with the details, no PDF`, async () => {
            (prisma.partnerAgent.findFirst as any).mockResolvedValue(partner);
            const r = await sharePropertyToRecipient('+919999999999', inv);
            expect(r.sent).toBe(true);
            expect(wa.sendCarouselStrict).toHaveBeenCalledTimes(1);
            expect(wa.sendCarouselStrict.mock.calls[0][1]).toContain('3 BHK');
            expect(carouselCards().map((c) => c.type)).toEqual(['image', 'image', 'video']);
            // Stored WebP goes through the JPEG route; WhatsApp rejects WebP image messages.
            expect(carouselCards()[0].url).toMatch(/\/inventory\/inv-1\/wa-image\.jpg\?src=%2Fuploads%2Fproperties%2Finv-1%2Fa\.webp&token=/);
            expect(wa.sendMediaStrict).not.toHaveBeenCalled();
            expect(wa.sendDocumentTemplate).not.toHaveBeenCalled();
            expect(r.pdfSent).toBe(false);
        });

        it(`${who}: PDF ticked also sends the brandless PDF captioned with the details`, async () => {
            (prisma.partnerAgent.findFirst as any).mockResolvedValue(partner);
            const r = await sharePropertyToRecipient('+919999999999', inv, { photos: true, videos: true, pdf: true });
            expect(wa.sendCarouselStrict).toHaveBeenCalledTimes(1);
            const [, type, url, caption, filename] = wa.sendMediaStrict.mock.calls[0];
            expect(type).toBe('document');
            expect(url).toContain('variant=brandless');
            expect(caption).toContain('3 BHK');
            expect(filename).toMatch(/\.pdf$/);
            expect(r.pdfSent).toBe(true);
            expect(!!r.pdfUrl?.includes('pn=Shiv')).toBe(!!partner);
        });
    }

    it('carousel rejected → every attachment individually, details on the first photo only', async () => {
        wa.sendCarouselStrict.mockRejectedValueOnce(new Error('(#131009) Parameter value is not valid'));
        const r = await sharePropertyToRecipient('+919999999999', inv);
        expect(r.sent).toBe(true);
        expect(wa.sendMediaStrict.mock.calls.map((c) => c[1])).toEqual(['image', 'image', 'video']);
        expect(wa.sendMediaStrict.mock.calls[0][3]).toContain('3 BHK');
        expect(wa.sendMediaStrict.mock.calls[1][3]).toBeUndefined();
        expect(wa.sendTemplate).not.toHaveBeenCalled();
    });

    it('a later attachment failing does not fall back to (and duplicate via) the card template', async () => {
        wa.sendCarouselStrict.mockRejectedValueOnce(new Error('rejected'));
        wa.sendMediaStrict.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('bad image'));
        const r = await sharePropertyToRecipient('+919999999999', inv);
        expect(r.sent).toBe(true);
        expect(wa.sendMediaStrict).toHaveBeenCalledTimes(3);
        expect(wa.sendTemplate).not.toHaveBeenCalled();
    });

    it('a single attachment is sent directly with the details caption (carousels need 2+ cards)', async () => {
        await sharePropertyToRecipient('+919999999999', inv, { photos: false, videos: true, pdf: false });
        expect(wa.sendCarouselStrict).not.toHaveBeenCalled();
        expect(wa.sendMediaStrict.mock.calls[0][1]).toBe('video');
        expect(wa.sendMediaStrict.mock.calls[0][3]).toContain('3 BHK');
    });

    it('PDF only still delivers the details (as the PDF caption plus text)', async () => {
        await sharePropertyToRecipient('+919999999999', inv, { photos: false, videos: false, pdf: true });
        expect(wa.sendCarouselStrict).not.toHaveBeenCalled();
        expect(wa.sendTextStrict).toHaveBeenCalledWith('+919999999999', expect.stringContaining('3 BHK'));
        expect(wa.sendMediaStrict.mock.calls[0][1]).toBe('document');
    });

    it('outside the 24h window: approved card template (JPEG header) + brochure template', async () => {
        session.active = false;
        const r = await sharePropertyToRecipient('+919999999999', inv, { photos: true, videos: true, pdf: true });
        expect(wa.sendCarouselStrict).not.toHaveBeenCalled();
        expect(wa.sendMediaStrict).not.toHaveBeenCalled();
        expect(wa.sendTemplate).toHaveBeenCalledTimes(1);
        expect(wa.sendTemplate.mock.calls[0][3]).not.toMatch(/\.webp$/);
        expect(wa.sendDocumentTemplate).toHaveBeenCalledTimes(1);
        expect(r.sent).toBe(true);
        expect(r.pdfSent).toBe(true);
    });
});
