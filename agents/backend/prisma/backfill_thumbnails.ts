/**
 * Generate missing `<file>_thumb.<ext>` thumbnails for property images under
 * /uploads/properties/. The admin list requests `<file>_thumb.<ext>` (via a filename
 * transform); workflow-uploaded `.jpg` originals never had a thumb generated (only the
 * storage.ts webp pipeline does), so they 404. This creates the missing thumbs with sharp
 * (400x300 cover), matching the original extension. Skips files that already have a thumb
 * and the thumbs themselves. Idempotent.
 *
 *   DRY RUN: npx ts-node --transpile-only prisma/backfill_thumbnails.ts --dry-run
 *   APPLY:   npx ts-node --transpile-only prisma/backfill_thumbnails.ts
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
const DRY = process.argv.includes('--dry-run');
const ROOT = path.join(process.cwd(), 'uploads', 'properties');
const IMG_RE = /\.(jpg|jpeg|png|webp)$/i;

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else out.push(p);
    }
    return out;
}

async function main() {
    if (!fs.existsSync(ROOT)) { console.log('no properties dir'); return; }
    const files = walk(ROOT).filter((f) => IMG_RE.test(f) && !/_thumb\.[^.]+$/i.test(f));
    let made = 0, skipped = 0, failed = 0;
    for (const f of files) {
        const thumb = f.replace(/(\.[^.]+)$/, '_thumb$1');
        if (fs.existsSync(thumb)) { skipped++; continue; }
        if (DRY) { made++; continue; }
        try {
            await sharp(f).resize(400, 300, { fit: 'cover' }).toFile(thumb);
            made++;
        } catch (e) { failed++; if (failed <= 5) console.log('FAIL', path.basename(f), (e as Error).message); }
    }
    console.log(DRY ? '--- DRY RUN ---' : '--- APPLIED ---');
    console.log(`images=${files.length} thumbs_${DRY ? 'to_make' : 'made'}=${made} already_had=${skipped} failed=${failed}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
