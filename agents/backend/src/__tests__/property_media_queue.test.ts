import { beforeEach, describe, expect, it, vi } from 'vitest';
const store = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() }));
const active = vi.hoisted(() => ({ value: true }));
vi.mock('../db', () => ({ default: { pendingMessage: store } }));
vi.mock('../services/session_tracker', () => ({ SessionTracker: { isSessionActive: vi.fn(async () => active.value) } }));
import { deliverPendingPropertyMedia } from '../services/property_media_queue';

describe('deferred property media', () => {
    const rows = [{ id: 'p1', status: 'pending', message: JSON.stringify([
        { type: 'image', url: 'https://example.test/a.jpg' }, { type: 'video', url: 'https://example.test/b.mp4' },
    ]) }];
    const wa = { sendMediaStrict: vi.fn() };
    beforeEach(() => {
        vi.clearAllMocks(); active.value = true;
        store.findMany.mockResolvedValue(rows); store.updateMany.mockResolvedValue({ count: 1 });
        store.update.mockResolvedValue({}); wa.sendMediaStrict.mockResolvedValue({});
    });
    it('sends no free-form media outside the session window', async () => {
        active.value = false;
        expect(await deliverPendingPropertyMedia(wa as any, '+919999999999')).toBe(0);
        expect(store.findMany).not.toHaveBeenCalled();
    });
    it('a competing worker that loses the claim sends nothing', async () => {
        store.updateMany.mockResolvedValue({ count: 0 });
        expect(await deliverPendingPropertyMedia(wa as any, '+919999999999')).toBe(0);
        expect(wa.sendMediaStrict).not.toHaveBeenCalled();
    });
    it('persists remaining items after each accepted send and marks completion', async () => {
        expect(await deliverPendingPropertyMedia(wa as any, '+919999999999')).toBe(2);
        expect(store.updateMany.mock.calls[2][0].data.message).not.toContain('a.jpg');
        expect(store.updateMany.mock.calls[2][0].data.message).toContain('b.mp4');
        expect(store.updateMany.mock.calls[4][0].data).toEqual({ message: '[]', status: 'sent' });
    });
    it('failed sends release the claim for retry', async () => {
        wa.sendMediaStrict.mockRejectedValueOnce(new Error('provider down'));
        expect(await deliverPendingPropertyMedia(wa as any, '+919999999999')).toBe(0);
        expect(store.updateMany.mock.calls[2][0].data.status).toBe('pending');
    });
    it('recovers an abandoned worker lease', async () => {
        store.findMany.mockResolvedValue([{ ...rows[0], status: 'sending:1' }]);
        expect(await deliverPendingPropertyMedia(wa as any, '+919999999999')).toBe(2);
    });

it('stale worker cannot overwrite a recovered lease checkpoint or send more media', async () => { store.findMany.mockResolvedValue(rows); active.value = true; store.updateMany.mockReset().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }); wa.sendMediaStrict.mockReset().mockResolvedValue({}); expect(await deliverPendingPropertyMedia(wa as any, '+919999999999')).toBe(1); expect(wa.sendMediaStrict).toHaveBeenCalledTimes(1); expect(store.updateMany.mock.calls[2][0].where.status).toMatch(/^sending:/); });

});
