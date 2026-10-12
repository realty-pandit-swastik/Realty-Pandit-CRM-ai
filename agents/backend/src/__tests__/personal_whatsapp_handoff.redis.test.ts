import { describe, it, expect, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import Redis from 'ioredis';
import { Readable } from 'stream';
import prisma from '../db';
vi.mock('../services/pdf_generator', () => ({ generateInventoryPdfStream: vi.fn(async () => Readable.from(Buffer.from('%PDF-synthetic'))) }));
import { createHandoff, claimHandoff, handoffFile, cancelHandoff } from '../services/personal_whatsapp_handoff';

// Opt in against a disposable/local Redis database; never flush shared keys.
describe.runIf(process.env.RUN_HANDOFF_REDIS_TESTS === '1')('handoff atomic Lua against real Redis', () => {
    it('enforces quota, one concurrent claimant, cancellation, expired downloads and expiry reclamation', async () => {
        const id = crypto.randomUUID(); const agent = { id: crypto.randomUUID(), tenant_id: crypto.randomUUID(), role: 'super_boss' };
        const directory = path.join(process.cwd(), 'uploads/properties', id);
        const url = `/uploads/properties/${id}/photo.jpg`; const bytes = Buffer.from([255,216,255,224,1,2,3]);
        const input = { recipient: '+919876543210', sending_app: 'com.whatsapp', properties: [{ inventory_id: id, media_urls: [url], first_photo: url, pdf: false }] };
        const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
        const jobKey = (token: string) => 'personal-whatsapp:job:' + digest(token);
        const quota = 'personal-whatsapp:quota:' + digest(agent.tenant_id + ':' + agent.id);
        const redis = new Redis({ host: process.env.REDIS_HOST || 'localhost', port: Number(process.env.REDIS_PORT || 6379), password: process.env.REDIS_PASSWORD || undefined });
        const tokens: string[] = [];
        try {
            await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, 'photo.jpg'), bytes);
            vi.mocked(prisma.contact.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.inventory.findMany).mockResolvedValue([{ id, tenant_id: agent.tenant_id, display_id: 'SYNTHETIC', media_urls: [url], status: 'active', specs: {}, price: 1 } as any]);
            const first = await createHandoff(agent, input); tokens.push(first.launch_token);
            const second = await createHandoff(agent, input); tokens.push(second.launch_token);
            expect(await redis.zcard(quota)).toBe(2);
            await expect(createHandoff(agent, input)).rejects.toMatchObject({ status: 429 });
            const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () => claimHandoff(first.launch_token)));
            expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
            const { session, manifest } = (outcomes.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof claimHandoff>>>).value;
            const file = await handoffFile(session, manifest.steps[0].files[0].id); expect(await fs.readFile(file.path)).toEqual(bytes);
            expect(await redis.get(jobKey(first.launch_token))).not.toContain(first.launch_token);
            await expect(cancelHandoff({ ...agent, tenant_id: 'other-tenant' }, first.launch_token)).rejects.toMatchObject({ status: 403 });
            await cancelHandoff(agent, first.launch_token); expect(await redis.zcard(quota)).toBe(1);
            await expect(handoffFile(session, file.id)).rejects.toMatchObject({ status: 410 }); await expect(fs.stat(file.path)).rejects.toThrow();
            const claimed = await claimHandoff(second.launch_token);
            const key = jobKey(second.launch_token); const raw = await redis.get(key); const job = JSON.parse(raw!);
            job.expires_at = Date.now() - 1; await redis.set(key, JSON.stringify(job), 'PX', 10000);
            await expect(handoffFile(claimed.session, claimed.manifest.steps[0].files[0].id)).rejects.toMatchObject({ status: 410 });
            await redis.zadd(quota, Date.now() - 1, key);
            const replacement = await createHandoff(agent, input); tokens.push(replacement.launch_token); expect(await redis.zcard(quota)).toBe(1);
            await cancelHandoff(agent, second.launch_token); await cancelHandoff(agent, replacement.launch_token); expect(await redis.zcard(quota)).toBe(0);
        } finally {
            for (const token of tokens) await cancelHandoff(agent, token);
            await redis.del(quota); await redis.quit(); await fs.rm(directory, { recursive: true, force: true });
        }
    });
});
