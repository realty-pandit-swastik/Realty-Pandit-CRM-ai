import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Guards the 2026-09-24 share-dialog fix: every WhatsApp property share — client, partner,
 * employee, self — sends photos + videos + details by default; the PDF only when ticked.
 * Before, an ACTIVE PartnerAgent recipient got the PDF brochure instead of the listing.
 */
const wa = vi.hoisted(() => ({
    sendMediaStrict: vi.fn(),
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
    media_urls: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
    video_urls: ['https://cdn.example.com/tour.mp4'],
};
const PARTNER = { phone_number: '+919810000000', name: 'Shiv Realty' };
const sentTypes = () => wa.sendMediaStrict.mock.calls.map((c) => c[1]);

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
        it(`${who}: default sends photos + videos with the details caption and NO PDF`, async () => {
            (prisma.partnerAgent.findFirst as any).mockResolvedValue(partner);
            const r = await sharePropertyToRecipient('+919999999999', inv);
            expect(r.sent).toBe(true);
            expect(sentTypes()).toEqual(['image', 'image', 'video']);
            expect(wa.sendMediaStrict.mock.calls[0][3]).toContain('3 BHK');
            expect(wa.sendDocumentTemplate).not.toHaveBeenCalled();
            expect(r.pdfSent).toBe(false);
        });

        it(`${who}: PDF ticked sends the media AND the brandless brochure`, async () => {
            (prisma.partnerAgent.findFirst as any).mockResolvedValue(partner);
            const r = await sharePropertyToRecipient('+919999999999', inv, { photos: true, videos: true, pdf: true });
            expect(sentTypes()).toEqual(['image', 'image', 'video']);
            expect(wa.sendDocumentTemplate).toHaveBeenCalledTimes(1);
            expect(r.pdfSent).toBe(true);
            expect(r.pdfUrl).toContain('variant=brandless');
            expect(!!r.pdfUrl?.includes('pn=Shiv')).toBe(!!partner);
        });
    }

    it('unticking photos sends only videos (text rides on the first attachment)', async () => {
        await sharePropertyToRecipient('+919999999999', inv, { photos: false, videos: true, pdf: false });
        expect(sentTypes()).toEqual(['video']);
        expect(wa.sendMediaStrict.mock.calls[0][3]).toContain('3 BHK');
    });

    it('PDF only still delivers the details text', async () => {
        await sharePropertyToRecipient('+919999999999', inv, { photos: false, videos: false, pdf: true });
        expect(wa.sendMediaStrict).not.toHaveBeenCalled();
        expect(wa.sendTextStrict).toHaveBeenCalledWith('+919999999999', expect.stringContaining('3 BHK'));
        expect(wa.sendDocumentTemplate).toHaveBeenCalledTimes(1);
    });

    it('outside the 24h window falls back to the approved card template (was a ReferenceError)', async () => {
        session.active = false;
        const r = await sharePropertyToRecipient('+919999999999', inv);
        expect(wa.sendMediaStrict).not.toHaveBeenCalled();
        expect(wa.sendTemplate).toHaveBeenCalledTimes(1);
        expect(r.sent).toBe(true);
    });
});
