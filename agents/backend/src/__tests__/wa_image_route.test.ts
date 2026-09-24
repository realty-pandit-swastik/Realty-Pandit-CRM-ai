import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import app from '../app';
import { whatsappImageUrl } from '../services/property_sharing';

/**
 * GET /inventory/:id/wa-image.jpg — public JPEG copy of a stored (WebP) photo for WhatsApp,
 * which rejects WebP image messages. Must convert real files and refuse unsigned/forged paths.
 */
const INV = 'wa-image-test';
const SRC = `/uploads/properties/${INV}/photo.webp`;
const DIR = path.join(process.cwd(), 'uploads', 'properties', INV);

const pathOf = (url: string) => url.replace(/^https?:\/\/[^/]+/, '');

describe('wa-image.jpg route', () => {
    beforeAll(async () => {
        const sharp = require('sharp');
        fs.mkdirSync(DIR, { recursive: true });
        await sharp({ create: { width: 40, height: 30, channels: 3, background: '#3366aa' } }).webp().toFile(path.join(DIR, 'photo.webp'));
    });
    afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

    it('serves a signed WebP upload as JPEG', async () => {
        const res = await request(app).get(pathOf(whatsappImageUrl(INV, SRC)));
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('image/jpeg');
        expect(res.body.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff])); // JPEG magic
    });

    it('rejects a token signed for a different file', async () => {
        const url = pathOf(whatsappImageUrl(INV, SRC)).replace(encodeURIComponent(SRC), encodeURIComponent('/uploads/other.webp'));
        expect((await request(app).get(url)).status).toBe(403);
    });

    it('rejects paths outside /uploads even when signed', async () => {
        expect((await request(app).get(pathOf(whatsappImageUrl(INV, '/etc/passwd')))).status).toBe(403);
        expect((await request(app).get(pathOf(whatsappImageUrl(INV, '/uploads/../.env')))).status).toBe(403);
    });
});
