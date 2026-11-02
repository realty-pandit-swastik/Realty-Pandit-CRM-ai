import { beforeEach, expect, it, vi } from 'vitest';
import axios from 'axios';
vi.mock('axios', () => ({ default: { post: vi.fn() } }));
vi.mock('../services/wa_message_log', () => ({ recordOutbound: vi.fn(async () => {}) }));
import { WhatsAppService } from '../services/whatsapp';
beforeEach(() => vi.clearAllMocks());
it('returns the provider identifier after a single accepted request', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { messages: [{ id: 'synthetic-provider-id' }] } });
    const r = await new WhatsAppService().sendPackageItemOnce('+919000000091', 'image', 'https://example.invalid/photo.jpg');
    expect(r.waMessageId).toBe('synthetic-provider-id'); expect(axios.post).toHaveBeenCalledTimes(1);
});
it('does not replay a rejected or malformed provider response', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: {} });
    await expect(new WhatsAppService().sendPackageItemOnce('+919000000091', 'image', 'https://example.invalid/photo.jpg')).rejects.toThrow('did not confirm');
    expect(axios.post).toHaveBeenCalledTimes(1);
    vi.mocked(axios.post).mockRejectedValue({ response: { status: 400, data: { error: { code: 131047, message: 'window closed' } } } });
    await expect(new WhatsAppService().sendPackageItemOnce('+919000000091', 'image', 'https://example.invalid/photo.jpg')).rejects.toThrow();
    expect(axios.post).toHaveBeenCalledTimes(2);
});
