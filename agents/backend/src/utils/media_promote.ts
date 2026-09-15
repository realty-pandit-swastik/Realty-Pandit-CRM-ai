/**
 * Promote uploaded media from the transient /uploads/pending/ dir to the
 * permanent /uploads/properties/<inventoryId>/ dir.
 *
 * The workflow media upload (routes/workflow.ts) saves files to /uploads/pending/
 * and stores those URLs on the inventory. The cleanup job deletes /uploads/pending/
 * files, so committed listings 404 on the website. This helper moves the files to
 * the permanent dir (same pattern as routes/agent.ts:685) and returns the rewritten
 * URLs. Used by workflow_engine.commit() (forward fix) and the one-time backfill.
 *
 * Idempotent + defensive:
 *  - only touches URLs under /uploads/pending/ (permanent ones pass through unchanged)
 *  - if the source file is already moved, returns the permanent URL
 *  - if the source file is gone (already cleaned up), the URL is DROPPED (not returned)
 *    so a dead /uploads/pending/ URL is never persisted on the inventory → no 404.
 *    `missing` counts how many were dropped.
 */
import fs from 'fs';
import path from 'path';

const UPLOAD_BASE = path.join(process.cwd(), 'uploads');
const PENDING_DIR = path.join(UPLOAD_BASE, 'pending');
const PROPERTY_DIR = path.join(UPLOAD_BASE, 'properties');
const PENDING_PREFIX = '/uploads/pending/';
const IMG_RE = /\.(jpg|jpeg|png|webp)$/i;

// Best-effort thumbnail generation (the admin list requests <file>_thumb.<ext>).
// Fire-and-forget; the backfill_thumbnails script covers any misses.
function genThumb(absPath: string): void {
    if (!IMG_RE.test(absPath)) return;
    const thumb = absPath.replace(/(\.[^.]+)$/, '_thumb$1');
    try {
        if (fs.existsSync(thumb)) return;
        // require lazily so this util has no hard sharp dependency for non-image flows
        const sharp = require('sharp');
        sharp(absPath).resize(400, 300, { fit: 'cover' }).toFile(thumb).catch(() => { /* best-effort */ });
    } catch { /* sharp unavailable / non-image — skip */ }
}

export interface PromoteResult {
    urls: string[];
    moved: number;
    missing: number;   // pending URL whose file is gone (unrecoverable)
    passed: number;    // already-permanent (or non-pending) URLs left as-is
}

export function promotePendingMedia(urls: unknown, inventoryId: string): PromoteResult {
    const result: PromoteResult = { urls: [], moved: 0, missing: 0, passed: 0 };
    if (!Array.isArray(urls) || urls.length === 0) {
        result.urls = Array.isArray(urls) ? (urls as string[]) : [];
        return result;
    }
    const destDir = path.join(PROPERTY_DIR, inventoryId);
    for (const raw of urls) {
        if (typeof raw !== 'string' || !raw.includes(PENDING_PREFIX)) {
            result.urls.push(raw as string);
            result.passed++;
            continue;
        }
        const filename = raw.split('/').pop() as string;
        const src = path.join(PENDING_DIR, filename);
        const destPath = path.join(destDir, filename);
        const permanentUrl = `/uploads/properties/${inventoryId}/${filename}`;
        try {
            if (fs.existsSync(destPath)) {
                // already promoted (idempotent re-run)
                genThumb(destPath);
                result.urls.push(permanentUrl);
                result.moved++;
            } else if (fs.existsSync(src)) {
                if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
                fs.renameSync(src, destPath); // same filesystem → atomic move
                genThumb(destPath);
                result.urls.push(permanentUrl);
                result.moved++;
            } else {
                // source gone (cleaned up) — DROP the dead URL so it's never persisted as a 404.
                result.missing++;
            }
        } catch {
            // unexpected FS error on a pending file — drop it rather than persist a likely-404 URL.
            result.missing++;
        }
    }
    return result;
}
