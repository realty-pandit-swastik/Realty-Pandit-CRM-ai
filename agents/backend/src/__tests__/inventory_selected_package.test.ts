import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ active: true, send: vi.fn(), template: vi.fn() }));
vi.mock('../db', () => ({ default: { partnerAgent: { findFirst: vi.fn(async () => null) } } }));
vi.mock('../services/whatsapp', () => ({ WhatsAppService: vi.fn(function () { return { sendPackageItemOnce: mocks.send, sendTemplate: mocks.template }; }) }));
vi.mock('../services/session_tracker', () => ({ SessionTracker: { isSessionActive: vi.fn(async () => mocks.active) } }));
import { buildBrochureUrl, parseShareContent, selectedPropertyMedia, sharePropertyToRecipient } from '../services/property_sharing';
import { classifyMetaError, WhatsAppSendError } from '../services/whatsapp_errors';
import { verifyPdfToken } from '../utils/pdf_token';
const inv = { id: 'synthetic', type: 'flat', intent: 'sell', locality: 'Test locality', display_price: 8000000, customer_price: 1234567, price: 1234567, owner_phone: '+919000000099', full_address: 'PRIVATE UNIT', media_urls: ['https://cdn.invalid/a.jpg', 'https://cdn.invalid/b.jpg'], video_urls: ['https://cdn.invalid/c.mp4'], specs: {} };
const content = () => parseShareContent({ photos: true, videos: true, pdf: true, media_urls: [inv.media_urls[0], inv.media_urls[1], inv.video_urls[0]], first_photo: inv.media_urls[1] });
beforeEach(() => { vi.clearAllMocks(); mocks.active = true; mocks.send.mockResolvedValue({ waMessageId: 'mock-provider-id' }); });
describe('explicit selected property package', () => {
  it('binds brochure photo selection to the signed URL', async () => {
    const selected = [inv.media_urls[1]], url = new URL(await buildBrochureUrl(inv, null, selected));
    expect(JSON.parse(url.searchParams.get('media')!)).toEqual(selected);
    expect(verifyPdfToken(inv.id, `brandless-media:${JSON.stringify(selected)}`, url.searchParams.get('token')!)).toBe(true);
    expect(verifyPdfToken(inv.id, `brandless-media:${JSON.stringify(inv.media_urls)}`, url.searchParams.get('token')!)).toBe(false);
  });
  it('validates membership and first-photo selection before sending', () => {
    expect(() => selectedPropertyMedia(inv, { ...content(), media_urls: ['https://other.invalid/secret.jpg'] })).toThrow();
    expect(() => selectedPropertyMedia(inv, { ...content(), first_photo: inv.video_urls[0] })).toThrow();
    expect(() => parseShareContent({ media_urls: [1] })).toThrow();
  });
  it('sends only selected files in order and reports provider IDs and PDF outcome', async () => {
    const r = await sharePropertyToRecipient('+919000000098', inv, content());
    expect(r.outcome?.status).toBe('accepted'); expect(r.outcome?.items).toHaveLength(4);
    expect(mocks.send.mock.calls[0][2]).toBe(inv.media_urls[1]); expect(r.outcome?.items[0].provider_id).toBe('mock-provider-id'); expect(r.pdfSent).toBe(true);
    expect(mocks.send.mock.calls[0][3]).not.toMatch(/1234567|PRIVATE UNIT|9000000099/);
    expect(mocks.template).not.toHaveBeenCalled();
  });
  it('blocks the entire selected package outside the service window without substitution', async () => {
    mocks.active = false; const r = await sharePropertyToRecipient('+919000000098', inv, content());
    expect(r.outcome?.status).toBe('blocked'); expect(r.sent).toBe(false); expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.template).not.toHaveBeenCalled();
  });
  it('stops after an ambiguous provider result and never retries or silently drops it', async () => {
    mocks.send.mockResolvedValueOnce({ waMessageId: 'first' }).mockRejectedValueOnce(new Error('timeout'));
    const r = await sharePropertyToRecipient('+919000000098', inv, content()); expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(r.outcome?.status).toBe('partial'); expect(r.outcome?.items.map(i => i.status)).toEqual(['accepted', 'uncertain', 'blocked', 'blocked']);
  });
  it('reports a provider policy block without retrying or falling back', async () => {
    mocks.send.mockRejectedValueOnce(new WhatsAppSendError(classifyMetaError({ response: { status: 400, data: { error: { code: 131047, message: 'window closed' } } } })));
    const r = await sharePropertyToRecipient('+919000000098', inv, content());
    expect(mocks.send).toHaveBeenCalledTimes(1); expect(r.outcome?.status).toBe('blocked'); expect(r.outcome?.items.every(i => i.status === 'blocked')).toBe(true);
  });
  it('uses raw dual pricing even when a legacy price unit remains on the row', async () => {
    const r = await sharePropertyToRecipient('+919000000098', { ...inv, price_unit: 'Lakh' }, { ...content(), pdf: false });
    expect(r.outcome?.status).toBe('accepted'); expect(mocks.send.mock.calls[0][3]).toContain('₹80'); expect(mocks.send.mock.calls[0][3]).not.toContain('8000000 Lakh');
  });
  it('does not expose legacy asking price when no display price is present', async () => {
    await sharePropertyToRecipient('+919000000098', { ...inv, display_price: null }, { ...content(), pdf: false });
    expect(mocks.send.mock.calls[0][3]).not.toContain('12.3');
  });
});
