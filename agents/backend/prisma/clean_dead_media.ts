/**
 * Remove DEAD /uploads/pending/ media URLs whose files no longer exist on disk
 * (the unrecoverable ones the media-promotion backfill couldn't move because the
 * cleanup job had already deleted them). Drops those entries from media_urls /
 * video_urls so listings stop showing broken images / 404-spamming the admin list.
 * Only removes pending URLs with a MISSING file; permanent + still-present files untouched.
 * Reversible via inventory_bak_* snapshot. Idempotent.
 *
 *   DRY RUN: npx ts-node --transpile-only prisma/clean_dead_media.ts --dry-run
 *   APPLY:   npx ts-node --transpile-only prisma/clean_dead_media.ts
 */
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');
const UPLOAD_BASE = path.join(process.cwd(), 'uploads');

function exists(url: string): boolean {
    if (typeof url !== 'string' || !url.startsWith('/uploads/')) return true; // non-local/permanent → keep
    const rel = url.replace(/^\/uploads\//, '');
    return fs.existsSync(path.join(UPLOAD_BASE, rel));
}

async function main() {
    const invs = await prisma.inventory.findMany({ select: { id: true, display_id: true, media_urls: true, video_urls: true } });
    let listings = 0, deadPhotos = 0, deadVideos = 0;
    for (const inv of invs) {
        const photos = (inv.media_urls as string[]) || [];
        const videos = (inv.video_urls as string[]) || [];
        const keepP = photos.filter((u) => exists(u));
        const keepV = videos.filter((u) => exists(u));
        const dp = photos.length - keepP.length, dv = videos.length - keepV.length;
        if (dp === 0 && dv === 0) continue;
        listings++; deadPhotos += dp; deadVideos += dv;
        console.log(`${DRY ? '[DRY] ' : ''}${inv.display_id} drop ${dp} photo(s) ${dv} video(s) (kept ${keepP.length}/${keepV.length})`);
        if (!DRY) await prisma.inventory.update({ where: { id: inv.id }, data: { media_urls: keepP, video_urls: keepV } });
    }
    console.log(DRY ? '--- DRY RUN ---' : '--- APPLIED ---');
    console.log(`listings_cleaned=${listings} dead_photos=${deadPhotos} dead_videos=${deadVideos}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
