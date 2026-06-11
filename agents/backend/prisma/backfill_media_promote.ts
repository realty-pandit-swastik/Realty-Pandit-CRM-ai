/**
 * One-time backfill — promote existing inventory media from /uploads/pending/ to
 * the permanent /uploads/properties/<id>/ dir, rewriting media_urls/video_urls.
 * Surviving pending files are moved; already-deleted ones are reported as unrecoverable
 * (URL left unchanged). Idempotent. Same logic as workflow_engine.commit() (forward fix).
 *
 *   DRY RUN (no moves/writes): npx ts-node --transpile-only prisma/backfill_media_promote.ts --dry-run
 *   APPLY:                     npx ts-node --transpile-only prisma/backfill_media_promote.ts
 */
import { PrismaClient } from '@prisma/client';
import { promotePendingMedia } from '../src/utils/media_promote';
const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');

async function main() {
    const invs = await prisma.inventory.findMany({
        select: { id: true, display_id: true, media_urls: true, video_urls: true },
    });
    let listingsTouched = 0, totMoved = 0, totMissing = 0;
    for (const inv of invs) {
        const photosHavePending = (inv.media_urls as string[]).some((u) => typeof u === 'string' && u.includes('/uploads/pending/'));
        const videosHavePending = (inv.video_urls as string[]).some((u) => typeof u === 'string' && u.includes('/uploads/pending/'));
        if (!photosHavePending && !videosHavePending) continue;

        if (DRY) {
            // count without moving: file existence not checked in dry-run, just report candidates
            const p = (inv.media_urls as string[]).filter((u) => typeof u === 'string' && u.includes('/uploads/pending/')).length;
            const v = (inv.video_urls as string[]).filter((u) => typeof u === 'string' && u.includes('/uploads/pending/')).length;
            console.log(`[DRY] ${inv.display_id} pending photos=${p} videos=${v}`);
            listingsTouched++;
            continue;
        }

        const photos = promotePendingMedia(inv.media_urls, inv.id);
        const videos = promotePendingMedia(inv.video_urls, inv.id);
        if (photos.moved > 0 || videos.moved > 0) {
            await prisma.inventory.update({
                where: { id: inv.id },
                data: { media_urls: photos.urls, video_urls: videos.urls },
            });
        }
        totMoved += photos.moved + videos.moved;
        totMissing += photos.missing + videos.missing;
        listingsTouched++;
        console.log(`${inv.display_id} moved=${photos.moved + videos.moved} missing=${photos.missing + videos.missing}`);
    }
    console.log(DRY ? '--- DRY RUN ---' : '--- APPLIED ---');
    console.log(`listings_with_pending=${listingsTouched} files_moved=${totMoved} files_missing(unrecoverable)=${totMissing}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
