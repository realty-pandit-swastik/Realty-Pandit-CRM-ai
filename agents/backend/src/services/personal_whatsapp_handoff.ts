import crypto from 'crypto';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { promises as fsp } from 'fs';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import Redis from 'ioredis';
import { z } from 'zod';
import prisma from '../db';
import { normalizePhone, isPlaceholderPhone } from '../utils/phone';
import { buildFullContactVisibilityFilter } from '../middleware/contact_visibility';
import { getDisplayFloor } from '../utils/floor';
import { getTeamIds } from '../utils/team_scope';
import { generateInventoryPdfStream } from './pdf_generator';

const TTL = 10 * 60 * 1000;
const MAX_BYTES = 40 * 1024 * 1024;
const ROOT = path.join(os.tmpdir(), 'realty-personal-whatsapp');
const PREFIX = 'personal-whatsapp:';
const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const capability = () => crypto.randomBytes(32).toString('hex');
export class HandoffError extends Error { constructor(public status: number, message: string) { super(message); } }
function fail(status: number, message: string): never { throw new HandoffError(status, message); }
export const handoffInput = z.object({
    recipient: z.string().max(80),
    sending_app: z.enum(['com.whatsapp', 'com.whatsapp.w4b']),
    properties: z.array(z.object({
        inventory_id: z.string().uuid(), media_urls: z.array(z.string().max(2048)).max(100),
        first_photo: z.string().max(2048).default(''), pdf: z.boolean(),
    }).strict()).min(1).max(20),
}).strict();
type Agent = { id: string; role: string; tenant_id: string };
type FileInfo = { id: string; name: string; mime: string; size: number; sha256: string };
type Manifest = { version: 1; recipient: string; sending_app: string; expires_at: number; steps: Array<{ property_id: string; label: string; text: string; kind: 'media' | 'pdf'; files: FileInfo[] }> };
type Job = { agent_id: string; tenant_id: string; expires_at: number; directory: string; manifest: Manifest; session_key?: string };
let redis: Redis | undefined;
let cleanupTimer: NodeJS.Timeout | undefined;
function connection() {
    if (!redis) {
        redis = new Redis({ host: process.env.REDIS_HOST || 'localhost', port: Number(process.env.REDIS_PORT || 6379), password: process.env.REDIS_PASSWORD || undefined,
            lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0, connectTimeout: 1500, commandTimeout: 1500, retryStrategy: () => null });
        redis.on('error', () => {}); // Fail closed below; never log capabilities or request content.
    }
    return redis;
}
async function store() {
    const client = connection();
    try {
        if (client.status === 'wait' || client.status === 'end') await client.connect();
        if (client.status !== 'ready') fail(503, 'My WhatsApp preparation is temporarily unavailable. Please retry.');
        return client;
    } catch { return fail(503, 'My WhatsApp preparation is temporarily unavailable. Please retry.'); }
}
async function operation<T>(run: (client: Redis) => Promise<T>): Promise<T> {
    try { return await run(await store()); }
    catch (error) { if (error instanceof HandoffError) throw error; return fail(503, 'My WhatsApp preparation is temporarily unavailable. Please retry.'); }
}
export async function cleanupExpiredHandoffs() {
    const entries = await fsp.readdir(ROOT, { withFileTypes: true }).catch(() => []);
    await Promise.all(entries.filter(e => e.isDirectory() && /^\d+-[a-f0-9]{64}$/.test(e.name) && Number(e.name.split('-')[0]) <= Date.now()).map(e => fsp.rm(path.join(ROOT, e.name), { recursive: true, force: true })));
}
async function initializeFiles() {
    await fsp.mkdir(ROOT, { recursive: true, mode: 0o700 });
    const root = await fsp.lstat(ROOT);
    if (!root.isDirectory() || root.isSymbolicLink() || (root.uid !== process.getuid?.())) fail(503, 'Private handoff storage is unavailable.');
    await fsp.chmod(ROOT, 0o700);
    await cleanupExpiredHandoffs();
    if (!cleanupTimer) {
        cleanupTimer = setInterval(() => { void cleanupExpiredHandoffs().catch(() => {}); }, 60_000);
        cleanupTimer.unref();
    }
}
// Restarted workers also clear abandoned snapshots without waiting for a new share.
void initializeFiles().catch(() => {});
// Only the customer's displayed price and these explicit presentation fields enter the caption.
export function customerShareDetails(inv: any): string {
    const s = inv.specs || {};
    const human = (v: unknown) => String(v || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const price = Number(inv.display_price ?? inv.price);
    const formatted = !Number.isFinite(price) || price <= 0 ? 'Price on request' : price >= 1e7 ? `₹${(price / 1e7).toFixed(2)} Cr` : price >= 1e5 ? `₹${(price / 1e5).toFixed(2)} L` : `₹${price.toLocaleString('en-IN')}`;
    const room = s.bhk ?? s.rooms ?? s.bedrooms ?? s.bhk_count;
    const intent = inv.intent === 'rent' ? 'for Rent' : ['sell', 'sale'].includes(inv.intent) ? 'for Sale' : '';
    const type = inv.flat_property_type?.name || human(inv.type) || 'Property';
    const lines = [`Property ID: ${inv.display_id || inv.id}`, 'Property details:', '', `*1.* 🏡 ${room ? `${room} BHK ` : ''}${type}${intent ? ` — ${intent}` : ''}`, `📍 ${[inv.apartment_name, inv.locality, inv.city].filter(Boolean).join(', ')}`, `💰 ${formatted}`];
    const area = s['plot-area'] ?? s.area;
    if (area) lines.push(`📐 ${area} ${s['plot-area-unit'] || s.area_unit || 'sqft'}`);
    if (s.furnishing) lines.push(`🛋️ ${human(s.furnishing)}`);
    if (s.bathrooms) lines.push(`🚿 ${s.bathrooms} Bathroom${Number(s.bathrooms) > 1 ? 's' : ''}`);
    const floor = getDisplayFloor(inv) || s.floors;
    if (floor) lines.push(`🏢 Floor: ${floor}`);
    if (s.facing) lines.push(`🧭 ${human(s.facing)} Facing`);
    if (s['ownership-tenure']) lines.push(`📜 ${human(s['ownership-tenure'])}`);
    const amenities = Array.isArray(s.amenities) ? s.amenities : Object.keys(s.amenities || {}).filter(k => s.amenities[k]);
    if (amenities.length) lines.push(`✨ ${amenities.slice(0, 5).map(human).join(' · ')}`);
    return lines.join('\n').replace(/https?:\/\/\S+/gi, '').trim().slice(0, 1024);
}
export function localMediaReference(url: string): string {
    if (url.startsWith('https://') || url.startsWith('http://')) {
        let parsed: URL;
        try { parsed = new URL(url); } catch { return fail(400, 'Invalid attachment URL.'); }
        const allowed = new Set(['https://api.realtypandit.in', process.env.API_URL || '', process.env.BACKEND_URL || '']);
        if (!allowed.has(parsed.origin) || parsed.username || parsed.password || parsed.search || parsed.hash) fail(400, 'Remote media is not supported by this pilot.');
        return parsed.pathname;
    }
    return url;
}
export async function selectedMediaPath(url: string): Promise<string> {
    url = localMediaReference(url);
    // Remote origins are unsupported in this pilot; no network fetch or public resolver.
    if (!url.startsWith('/uploads/properties/') || url.includes('?') || url.includes('#') || url.includes('%') || url.includes('\\')) fail(400, 'Only locally stored property photos and videos are supported by this pilot.');
    const base = await fsp.realpath(path.join(process.cwd(), 'uploads', 'properties')).catch(() => fail(400, 'Property media is unavailable.'));
    const file = await fsp.realpath(path.join(process.cwd(), url.slice(1))).catch(() => fail(400, 'A selected attachment is missing.'));
    if (!file.startsWith(base + path.sep)) fail(400, 'Invalid property attachment.');
    return file;
}
export function sniffMedia(bytes: Buffer): string {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
    if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
    if (bytes.toString('ascii', 4, 8) === 'ftyp') {
        const brand = bytes.toString('ascii', 8, 12);
        if (['avif', 'avis'].includes(brand)) return 'image/avif';
        if (['isom', 'iso2', 'mp41', 'mp42', 'M4V ', 'qt  '].includes(brand)) return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
    }
    return fail(400, 'An attachment has an unsupported photo/video format.');
}
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'application/pdf': 'pdf' };
async function snapshot(source: NodeJS.ReadableStream, directory: string, mime: string, remaining: number): Promise<FileInfo> {
    const id = crypto.randomUUID();
    const hash = crypto.createHash('sha256');
    let size = 0;
    const limit = new Transform({ transform(chunk, _encoding, callback) {
        size += chunk.length;
        if (size > remaining) { callback(new HandoffError(400, 'Selected attachments exceed the total 40 MiB limit.')); return; }
        hash.update(chunk); callback(null, chunk);
    } });
    await pipeline(source as any, limit, fs.createWriteStream(path.join(directory, id), { mode: 0o600, flags: 'wx' }));
    if (!size) fail(400, 'A selected attachment is empty.');
    return { id, name: `attachment-${id}.${extensions[mime]}`, mime, size, sha256: hash.digest('hex') };
}
export async function createHandoff(agent: Agent, raw: unknown) {
    if (!agent.tenant_id || !['super_boss', 'manager', 'employee'].includes(agent.role)) fail(403, 'My WhatsApp pilot is available to internal staff only.');
    const parsed = handoffInput.safeParse(raw);
    if (!parsed.success) fail(400, 'Invalid recipient, app or property selection.');
    const input = parsed.data;
    // Explicit country codes must not be reinterpreted as a bare Indian ten-digit number.
    const entered = input.recipient.replace(/[\s\-()]/g, '');
    const recipient = isPlaceholderPhone(input.recipient) ? '' : entered.startsWith('+') ? entered : normalizePhone(input.recipient);
    if (!recipient || !/^\+[1-9]\d{7,14}$/.test(recipient)) fail(400, 'Enter a valid recipient number with country code.');
    const ids = input.properties.map(p => p.inventory_id);
    if (new Set(ids).size !== ids.length || input.properties.some(p => (!p.media_urls.length && !p.pdf) || new Set(p.media_urls).size !== p.media_urls.length)) fail(400, 'Select distinct properties and at least one attachment per property.');
    if (input.properties.reduce((n, p) => n + p.media_urls.length + Number(p.pdf), 0) > 100) fail(400, 'Select at most 100 attachments in total.');
    const expires_at = Date.now() + TTL;
    const launch_token = capability();
    const key = PREFIX + 'job:' + digest(launch_token);
    const quota = PREFIX + 'quota:' + digest(agent.tenant_id + ':' + agent.id);
    const reserved = await operation(c => c.eval("redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1]); if redis.call('ZCARD',KEYS[1])>=2 then return 0 end; redis.call('ZADD',KEYS[1],ARGV[2],ARGV[3]); redis.call('PEXPIRE',KEYS[1],ARGV[4]); return 1", 1, quota, Date.now(), expires_at, key, TTL));
    if (Number(reserved) !== 1) fail(429, 'Two shares are already preparing or ready. Cancel one or wait for expiry.');
    const directory = path.join(ROOT, `${expires_at}-${digest(launch_token)}`);
    try {
        const existingContact = await prisma.contact.findUnique({ where: { phone_number: recipient }, select: { phone_number: true } });
        const stored = existingContact?.phone_number;
        if (stored) {
            const visible = await prisma.contact.findFirst({ where: { phone_number: stored, tenant_id: agent.tenant_id, AND: [await buildFullContactVisibilityFilter(agent.id, agent.role)] }, select: { phone_number: true } });
            if (!visible) fail(403, 'This recipient is not accessible to your account.');
        }
        const team = await getTeamIds(agent);
        const inventories = await prisma.inventory.findMany({ where: { tenant_id: agent.tenant_id, id: { in: ids }, ...(agent.role === 'super_boss' ? {} : { OR: [{ status: 'active' }, { uploaded_by_agent_id: { in: team } }, { assigned_agent_id: { in: team } }, { reference_agent_id: { in: team } }, { shared_with_ids: { hasSome: team } }] }) }, include: { flat_property_type: { select: { name: true } } } });
        if (inventories.length !== ids.length) fail(403, 'One or more properties are missing or inaccessible.');
        await initializeFiles();
        await fsp.mkdir(directory, { mode: 0o700 });
        const manifest: Manifest = { version: 1, recipient, sending_app: input.sending_app, expires_at, steps: [] };
        let total = 0;
        for (const selection of input.properties) {
            const inv: any = inventories.find(i => i.id === selection.inventory_id)!;
            const storedMedia = [...inv.media_urls, ...(inv.video_urls || [])].map(localMediaReference);
            if (selection.media_urls.some(u => !storedMedia.includes(localMediaReference(u)))) fail(400, 'Selected attachments do not belong to this property.');
            const prepared: Array<{ file: FileInfo; url: string }> = [];
            for (const url of selection.media_urls) {
                const filePath = await selectedMediaPath(url);
                const handle = await fsp.open(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
                try {
                    const stat = await handle.stat();
                    if (!stat.isFile() || !stat.size || stat.size > MAX_BYTES - total) fail(400, 'Selected attachments are empty, invalid or exceed 40 MiB.');
                    const bytes = Buffer.alloc(32); await handle.read(bytes, 0, 32, 0);
                    const mime = sniffMedia(bytes);
                    const file = await snapshot(handle.createReadStream({ start: 0, autoClose: false }), directory, mime, MAX_BYTES - total);
                    total += file.size; prepared.push({ file, url });
                } finally { await handle.close(); }
            }
            const photos = prepared.filter(p => p.file.mime.startsWith('image/'));
            if ((selection.first_photo && !photos.some(p => p.url === selection.first_photo)) || (photos.length && !selection.first_photo)) fail(400, 'Choose a first photo from the selected photos.');
            const ordered = [...photos.filter(p => p.url === selection.first_photo), ...photos.filter(p => p.url !== selection.first_photo), ...prepared.filter(p => p.file.mime.startsWith('video/'))];
            const label = String(inv.display_id || inv.id);
            const text = customerShareDetails(inv);
            if (ordered.length) manifest.steps.push({ property_id: inv.id, label, text, kind: 'media', files: ordered.map(p => p.file) });
            if (selection.pdf) {
                // Pass only customer-facing fields and validated private snapshots to the existing renderer.
                const pdfInv = { ...inv, price: inv.display_price ?? inv.price, display_price: inv.display_price ?? inv.price, customer_price: null,
                    owner_phone: null, owner_name: null, flat_no: null, plot_no: null, full_address: null, sub_locality: null, description: null,
                    media_urls: ordered.filter(p => p.file.mime.startsWith('image/')).map(p => path.relative(process.cwd(), path.join(directory, p.file.id))) };
                const stream = await generateInventoryPdfStream([pdfInv], { variant: 'brandless' });
                const file = await snapshot(stream, directory, 'application/pdf', MAX_BYTES - total); total += file.size;
                manifest.steps.push({ property_id: inv.id, label, text: '', kind: 'pdf', files: [file] });
            }
        }
        if (Date.now() >= expires_at) fail(410, 'Preparation expired. Please prepare again.');
        const job: Job = { agent_id: agent.id, tenant_id: agent.tenant_id, expires_at, directory, manifest };
        const saved = await operation(c => c.set(key, JSON.stringify(job), 'PX', expires_at - Date.now(), 'NX'));
        if (saved !== 'OK') fail(503, 'Could not save the prepared share. Please retry.');
        return { launch_token, expires_at };
    } catch (error) {
        await fsp.rm(directory, { recursive: true, force: true }).catch(() => {});
        await operation(c => c.zrem(quota, key)).catch(() => {});
        throw error;
    }
}
function tokenKey(token: string, kind: 'job' | 'session') {
    if (!/^[a-f0-9]{64}$/.test(token)) fail(401, 'Invalid or expired handoff.');
    return PREFIX + kind + ':' + digest(token);
}
export async function claimHandoff(token: string) {
    const key = tokenKey(token, 'job'); const session = capability(); const sessionKey = tokenKey(session, 'session');
    const result = await operation(c => c.eval("local raw=redis.call('GET',KEYS[1]); if not raw then return '' end; local job=cjson.decode(raw); if job.expires_at<=tonumber(ARGV[1]) or job.session_key then return '' end; job.session_key=KEYS[2]; local ttl=job.expires_at-tonumber(ARGV[1]); redis.call('SET',KEYS[1],cjson.encode(job),'PX',ttl); redis.call('SET',KEYS[2],KEYS[1],'PX',ttl); return cjson.encode(job.manifest)", 2, key, sessionKey, Date.now()));
    if (!result) fail(410, 'Handoff expired, cancelled or already opened. Prepare a new share.');
    return { session, manifest: JSON.parse(String(result)) as Manifest };
}
export async function handoffFile(session: string, id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) fail(404, 'Attachment unavailable.');
    const sessionKey = tokenKey(session, 'session');
    const raw = await operation(async c => { const jobKey = await c.get(sessionKey); return jobKey ? c.get(jobKey) : null; });
    if (!raw) fail(410, 'Handoff expired or cancelled.');
    const job: Job = JSON.parse(raw);
    if (job.expires_at <= Date.now() || job.session_key !== sessionKey) fail(410, 'Handoff expired or cancelled.');
    const file = job.manifest.steps.flatMap(s => s.files).find(f => f.id === id);
    if (!file) fail(404, 'Attachment unavailable.');
    return { path: path.join(job.directory, file.id), ...file };
}
export async function cancelHandoff(agent: Agent, token: string) {
    const key = tokenKey(token, 'job');
    const raw = await operation(c => c.eval("local raw=redis.call('GET',KEYS[1]); if not raw then return '' end; local job=cjson.decode(raw); if job.agent_id~=ARGV[1] or job.tenant_id~=ARGV[2] then return 'denied' end; if job.session_key then redis.call('DEL',job.session_key) end; redis.call('DEL',KEYS[1]); redis.call('ZREM',KEYS[2],KEYS[1]); return raw", 2, key, PREFIX + 'quota:' + digest(agent.tenant_id + ':' + agent.id), agent.id, agent.tenant_id));
    if (raw === 'denied') fail(403, 'This share belongs to another account.');
    if (raw) await fsp.rm((JSON.parse(String(raw)) as Job).directory, { recursive: true, force: true });
}
