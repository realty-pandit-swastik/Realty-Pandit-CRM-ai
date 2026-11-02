import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { Readable } from 'stream';
import request from 'supertest';
const state = vi.hoisted(() => ({ values: new Map<string, string>(), quotas: new Map<string, Set<string>>(), down: false }));
vi.mock('ioredis', () => ({ default: class {
    status = 'ready'; on() {} async connect() {};
    check() { if (state.down) throw new Error('Redis unavailable'); }
    async get(k: string) { this.check(); return state.values.get(k) ?? null; }
    async set(k: string, value: string) { this.check(); state.values.set(k, value); return 'OK'; }
    async zrem(k: string, v: string) { this.check(); state.quotas.get(k)?.delete(v); return 1; }
    async eval(script: string, n: number, ...args: any[]) {
        this.check(); const keys = args.slice(0, n); const values = args.slice(n);
        if (script.includes('ZCARD')) { const quota = state.quotas.get(keys[0]) || new Set(); state.quotas.set(keys[0], quota); if (quota.size >= 2) return 0; quota.add(values[2]); return 1; }
        const raw = state.values.get(keys[0]); if (!raw) return '';
        const job = JSON.parse(raw);
        if (script.includes('job.agent_id')) {
            if (job.agent_id !== values[0] || job.tenant_id !== values[1]) return 'denied';
            state.values.delete(job.session_key); state.values.delete(keys[0]); state.quotas.get(keys[1])?.delete(keys[0]); return raw;
        }
        if (job.expires_at <= values[0] || job.session_key) return '';
        job.session_key = keys[1]; state.values.set(keys[0], JSON.stringify(job)); state.values.set(keys[1], keys[0]); return JSON.stringify(job.manifest);
    }
} }));
vi.mock('../services/pdf_generator', () => ({ generateInventoryPdfStream: vi.fn(async () => Readable.from(Buffer.from('%PDF-test'))) }));
vi.mock('../middleware/auth', () => ({
    authMiddleware: (req: any, res: any, next: any) => { if (!req.headers['x-test-agent']) return res.status(401).json({ error: 'Auth required' }); req.agent = { id: 'agent1', tenant_id: 'tenant1', role: req.headers['x-test-role'] || 'employee' }; next(); },
    authenticateAgent: (_req: any, _res: any, next: any) => next(),
    checkPermission: () => (_req: any, _res: any, next: any) => next(),
    requireRole: (...roles: string[]) => (req: any, res: any, next: any) => roles.includes(req.agent.role) ? next() : res.status(403).json({ error: 'Role denied' }),
}));
import prisma from '../db';
import app from '../app';
import { createHandoff, claimHandoff, handoffFile, cancelHandoff, sniffMedia, localMediaReference, customerShareDetails, cleanupExpiredHandoffs } from '../services/personal_whatsapp_handoff';
import { generateInventoryPdfStream } from '../services/pdf_generator';
const agent = { id: 'agent1', tenant_id: 'tenant1', role: 'employee' };
const id = 'a01a60f8-80e6-4658-b33d-06d96660ffce';
const mediaDir = path.join(process.cwd(), 'uploads/properties', id);
const url = `/uploads/properties/${id}/photo.jpg`;
const bytes = Buffer.from([255, 216, 255, 224, 1, 2, 3]);
const inv = { id, tenant_id: 'tenant1', display_id: 'TEST1', media_urls: [url], status: 'active', display_price: 8000000, customer_price: 1234567, owner_phone: '+919123456789', owner_name: 'SECRET', full_address: 'SECRET UNIT', specs: { bhk: 2 }, type: 'flat', city: 'Test' };
const input = () => ({ recipient: '+919876543210', sending_app: 'com.whatsapp', properties: [{ inventory_id: id, media_urls: [url], first_photo: url, pdf: false }] });
beforeEach(async () => {
    vi.clearAllMocks(); prisma.partnerAgent.findFirst = vi.fn().mockResolvedValue(null); state.values.clear(); state.quotas.clear(); state.down = false;
    (prisma.contact.findUnique as any).mockResolvedValue(null);
    (prisma.inventory.findMany as any).mockResolvedValue([inv]);
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.partnerAgent.findMany as any).mockResolvedValue([]);
    await fs.mkdir(mediaDir, { recursive: true }); await fs.writeFile(path.join(mediaDir, 'photo.jpg'), bytes);
});
afterAll(async () => { await fs.rm(mediaDir, { recursive: true, force: true }); });
describe('private My WhatsApp pilot', () => {
    it('requires staff authentication, CSRF and internal role before preparation', async () => {
        expect((await request(app).post('/api/personal-whatsapp/handoffs').send(input())).status).toBe(403);
        expect((await request(app).post('/api/personal-whatsapp/handoffs').set('Cookie', 'rp_csrf=x').set('X-CSRF-Token', 'x').send(input())).status).toBe(401);
        expect((await request(app).post('/api/personal-whatsapp/handoffs').set('x-test-agent', 'yes').set('x-test-role', 'partner').set('Cookie', 'rp_csrf=x').set('X-CSRF-Token', 'x').send(input())).status).toBe(403);
    });
    it('snapshots bytes privately, returns only opaque launch, claims once and revokes session on cancel', async () => {
        const result = await createHandoff(agent, input());
        expect(Object.keys(result).sort()).toEqual(['expires_at', 'launch_token']); expect(result.launch_token).toMatch(/^[a-f0-9]{64}$/);
        expect([...state.values.keys()].join('')).not.toContain(result.launch_token);
        const outcomes = await Promise.allSettled([claimHandoff(result.launch_token), claimHandoff(result.launch_token)]);
        expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        const claimed = (outcomes.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>).value;
        expect(claimed.session).toMatch(/^[a-f0-9]{64}$/); expect(claimed.manifest.recipient).toBe(input().recipient);
        const file = await handoffFile(claimed.session, claimed.manifest.steps[0].files[0].id);
        expect(file.path.startsWith(path.join(os.tmpdir(), 'realty-personal-whatsapp'))).toBe(true);
        expect((await fs.stat(file.path)).mode & 0o777).toBe(0o600);
        expect(file.sha256).toBe(crypto.createHash('sha256').update(bytes).digest('hex'));
        await fs.writeFile(path.join(mediaDir, 'photo.jpg'), 'changed'); expect(await fs.readFile(file.path)).toEqual(bytes);
        await expect(cancelHandoff({ ...agent, id: 'another' }, result.launch_token)).rejects.toMatchObject({ status: 403 });
        await cancelHandoff(agent, result.launch_token); await expect(handoffFile(claimed.session, file.id)).rejects.toMatchObject({ status: 410 });
        await expect(fs.stat(file.path)).rejects.toThrow();
    });
    it('redacts internal owner price and details for captions and PDF, supports PDF-only', async () => {
        const data = input(); data.properties[0] = { inventory_id: id, media_urls: [], first_photo: '', pdf: true };
        const result = await createHandoff(agent, data); const claimed = await claimHandoff(result.launch_token);
        expect(claimed.manifest.steps).toHaveLength(1); expect(claimed.manifest.steps[0].kind).toBe('pdf');
        expect(claimed.manifest.steps[0].text).toBe('');
        expect(customerShareDetails(inv)).toContain('₹80.00 L');
        expect(JSON.stringify(claimed.manifest)).not.toMatch(/1234567|SECRET|9123456789/);
        const pdfInput = (generateInventoryPdfStream as any).mock.calls[0][0][0];
        expect(pdfInput.customer_price).toBeNull(); expect(pdfInput.owner_phone).toBeNull(); expect(pdfInput.description).toBeNull();
        await cancelHandoff(agent, result.launch_token);
    });
    it('scopes every inventory and existing contact to tenant including super boss, rejects missing subset', async () => {
        (prisma.inventory.findMany as any).mockResolvedValue([]);
        await expect(createHandoff({ ...agent, role: 'super_boss' }, input())).rejects.toMatchObject({ status: 403 });
        expect((prisma.inventory.findMany as any).mock.calls[0][0].where.tenant_id).toBe('tenant1');
        (prisma.contact.findUnique as any).mockResolvedValue({ phone_number: input().recipient, tenant_id: 'tenant1' });
        await expect(createHandoff(agent, input())).rejects.toMatchObject({ status: 403 });
        expect((prisma.contact.findFirst as any).mock.calls[0][0].where.tenant_id).toBe('tenant1');
    });
    it('fails closed when Redis is down, rejects tokens and placeholder recipients', async () => {
        state.down = true; await expect(createHandoff(agent, input())).rejects.toMatchObject({ status: 503 }); expect(prisma.inventory.findMany).not.toHaveBeenCalled();
        state.down = false; await expect(claimHandoff('guess')).rejects.toMatchObject({ status: 401 });
        await expect(createHandoff(agent, { ...input(), recipient: 'PENDING-abc-1' })).rejects.toMatchObject({ status: 400 });
    });
    it('matches canonical local URLs, rejects foreign hosts and out-of-root symlinks', async () => {
        expect(localMediaReference('https://api.realtypandit.in' + url)).toBe(url);
        expect(() => localMediaReference('https://evil.test' + url)).toThrow();
        const data = input(); data.properties[0].media_urls = ['https://api.realtypandit.in' + url]; data.properties[0].first_photo = data.properties[0].media_urls[0];
        const result = await createHandoff(agent, data); await cancelHandoff(agent, result.launch_token);
        await fs.rm(path.join(mediaDir, 'photo.jpg')); await fs.symlink('/etc/hosts', path.join(mediaDir, 'photo.jpg'));
        await expect(createHandoff(agent, input())).rejects.toMatchObject({ status: 400 }); await fs.unlink(path.join(mediaDir, 'photo.jpg'));
    });
    it('rejects unselected membership, unsupported MIME, and counts PDF bytes in global limit', async () => {
        const data = input(); data.properties[0].media_urls = [url + 'other']; await expect(createHandoff(agent, data)).rejects.toMatchObject({ status: 400 });
        expect(() => sniffMedia(Buffer.from('arbitrary file'))).toThrow();
        const large = await fs.open(path.join(mediaDir, 'photo.jpg'), 'w'); await large.write(bytes); await large.truncate(40 * 1024 * 1024); await large.close();
        data.properties[0] = { inventory_id: id, media_urls: [url], first_photo: url, pdf: true };
        await expect(createHandoff(agent, data)).rejects.toMatchObject({ status: 400 });
    });
    it('expires sessions on every file read, cannot cancel another tenant', async () => {
        const result = await createHandoff(agent, input()); const claimed = await claimHandoff(result.launch_token);
        await expect(cancelHandoff({ ...agent, tenant_id: 'tenant2' }, result.launch_token)).rejects.toMatchObject({ status: 403 });
        const key = [...state.values.keys()].find(k => k.includes(':job:'))!; const job = JSON.parse(state.values.get(key)!); job.expires_at = Date.now() - 1; state.values.set(key, JSON.stringify(job));
        await expect(handoffFile(claimed.session, claimed.manifest.steps[0].files[0].id)).rejects.toMatchObject({ status: 410 }); await cancelHandoff(agent, result.launch_token);
    });
    it('allows native bearer claim and private file download without CRM cookies', async () => {
        const result = await createHandoff(agent, input());
        const response = await request(app).post('/api/personal-whatsapp/handoffs/claim').set('Authorization', `Bearer ${result.launch_token}`);
        expect(response.status).toBe(200);
        const file = response.body.manifest.steps[0].files[0];
        const download = await request(app).get(`/api/personal-whatsapp/handoffs/files/${file.id}`).set('Authorization', `Bearer ${response.body.session}`);
        expect(download.status).toBe(200); expect(download.headers['cache-control']).toBe('no-store, no-transform');
        expect(download.headers['content-type']).toBe('image/jpeg'); expect(download.body).toEqual(bytes);
        expect((await request(app).post('/api/personal-whatsapp/handoffs/claim').set('Authorization', `Bearer ${result.launch_token}`)).status).toBe(410);
        await cancelHandoff(agent, result.launch_token);
    });
    it('serves exact uncompressed PDF bytes and length through the real middleware stack', async () => {
        const pdfBytes = Buffer.from('%PDF-' + 'x'.repeat(4096));
        vi.mocked(generateInventoryPdfStream).mockResolvedValueOnce(Readable.from(pdfBytes));
        const data = input(); data.properties[0] = { inventory_id: id, media_urls: [], first_photo: '', pdf: true };
        const result = await createHandoff(agent, data); const { session, manifest } = await claimHandoff(result.launch_token);
        const file = manifest.steps[0].files[0];
        const response = await request(app).get(`/api/personal-whatsapp/handoffs/files/${file.id}`).set('Authorization', `Bearer ${session}`).set('Accept-Encoding', 'gzip');
        expect(response.status).toBe(200); expect(response.headers['content-encoding']).toBeUndefined();
        expect(response.headers['content-length']).toBe(String(pdfBytes.length)); expect(response.body).toEqual(pdfBytes);
        expect(response.headers['cache-control']).toBe('no-store, no-transform');
        expect(crypto.createHash('sha256').update(response.body).digest('hex')).toBe(file.sha256);
        await cancelHandoff(agent, result.launch_token);
    });
    it('orders chosen photo first then other photos and videos with PDF last', async () => {
        const second = url.replace('photo.jpg', 'second.png'); const video = url.replace('photo.jpg', 'video.mp4');
        await fs.writeFile(path.join(mediaDir, 'second.png'), Buffer.from([137,80,78,71,13,10,26,10]));
        await fs.writeFile(path.join(mediaDir, 'video.mp4'), Buffer.from('0000ftypisom00000000'));
        (prisma.inventory.findMany as any).mockResolvedValue([{ ...inv, media_urls: [url, second], video_urls: [video] }]);
        const data = input(); data.properties[0] = { inventory_id: id, media_urls: [video, url, second], first_photo: second, pdf: true };
        const result = await createHandoff(agent, data); const { manifest } = await claimHandoff(result.launch_token);
        expect(manifest.steps.map(s => s.kind)).toEqual(['media', 'pdf']);
        expect(manifest.steps[0].text).toContain('₹80.00 L'); expect(manifest.steps[1].text).toBe('');
        expect(manifest.steps[0].files.map(f => f.mime)).toEqual(['image/png', 'image/jpeg', 'video/mp4']);
        await cancelHandoff(agent, result.launch_token);
        data.properties[0] = { inventory_id: id, media_urls: [video], first_photo: '', pdf: false };
        const videoOnly = await createHandoff(agent, data); expect((await claimHandoff(videoOnly.launch_token)).manifest.steps[0].files[0].mime).toBe('video/mp4');
        await cancelHandoff(agent, videoOnly.launch_token);
    });
    it('bounds outstanding jobs and frees capacity on cancellation', async () => {
        const first = await createHandoff(agent, input()); const second = await createHandoff(agent, input());
        await expect(createHandoff(agent, input())).rejects.toMatchObject({ status: 429 });
        await cancelHandoff(agent, first.launch_token); const replacement = await createHandoff(agent, input());
        await cancelHandoff(agent, second.launch_token); await cancelHandoff(agent, replacement.launch_token);
        const data = input(); data.properties[0].media_urls = Array.from({ length: 100 }, (_, i) => url + i); data.properties[0].pdf = true;
        await expect(createHandoff(agent, data)).rejects.toMatchObject({ status: 400 });
    });
    it('preserves explicitly country-coded international recipients', async () => {
        const data = { ...input(), recipient: '+65 8123 4567' };
        const result = await createHandoff(agent, data); expect((await claimHandoff(result.launch_token)).manifest.recipient).toBe('+6581234567');
        expect(vi.mocked(prisma.contact.findUnique)).toHaveBeenCalledWith({ where: { phone_number: '+6581234567' }, select: { tenant_id: true } });
        await cancelHandoff(agent, result.launch_token);
    });
    it('cleans expired abandoned snapshots while retaining unexpired directories', async () => {
        const root = path.join(os.tmpdir(), 'realty-personal-whatsapp');
        const expired = path.join(root, `${Date.now() - 1}-${crypto.randomBytes(32).toString('hex')}`);
        const pending = path.join(root, `${Date.now() + 600000}-${crypto.randomBytes(32).toString('hex')}`);
        await fs.mkdir(expired, { recursive: true }); await fs.mkdir(pending);
        await fs.writeFile(path.join(expired, 'abandoned'), 'synthetic'); await cleanupExpiredHandoffs();
        await expect(fs.stat(expired)).rejects.toThrow(); expect((await fs.stat(pending)).isDirectory()).toBe(true);
        await fs.rm(pending, { recursive: true, force: true });
    });
    it('uses the buyer-facing floor override and named floor labels', () => {
        expect(customerShareDetails({ ...inv, floor_number: 0, floor_label: 'Ground', display_floor: 'Upper Ground' })).toContain('Floor: Upper Ground');
        expect(customerShareDetails({ ...inv, floor_number: 0, floor_label: 'Ground' })).toContain('Floor: Ground');
    });
    it('keeps customer caption below the limit without URLs', () => { expect(customerShareDetails({ ...inv, apartment_name: 'https://evil.test/a ' + 'x'.repeat(3000) }).length).toBeLessThanOrEqual(1024); });
});
