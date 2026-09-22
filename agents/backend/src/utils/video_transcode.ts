/**
 * Video normalise-on-upload (2026-07-29, extended 2026-08-11).
 *
 * Two jobs, both about "will a browser actually play this?":
 *
 *  1. CODEC — iPhone video is often HEVC/H.265, which Chrome/Firefox cannot decode. We ffprobe and
 *     transcode to H.264.
 *  2. CONTAINER — added 2026-08-11 when .3gp/.avi/.mkv became accepted uploads. ffmpeg writes MP4
 *     bytes, and the old code renamed them back over the ORIGINAL extension, so an .avi held MP4
 *     data while express.static served `Content-Type: video/x-msvideo`. The API also sends
 *     `X-Content-Type-Options: nosniff`, which explicitly forbids the browser from correcting the
 *     mislabel — so the video simply would not play. The file is now renamed to .mp4 and the
 *     inventory row's video_urls is rewritten to match.
 *
 * Runs async + non-blocking (ffmpeg is a separate process); callers should NOT await it so the
 * upload response is instant. Until it finishes the website MediaGallery falls back to photos, so
 * there is never a dead player. Safe no-op on any error.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import prisma from "../db";
import logger from "./logger";

const execFileP = promisify(execFile);
const FFPROBE = "/usr/bin/ffprobe";
const FFMPEG = "/usr/bin/ffmpeg";

/**
 * Swap a video URL inside the owning inventory row after the file is renamed.
 * The inventory id is the directory name: uploads/properties/<id>/<file>.
 */
async function swapVideoUrl(oldPath: string, newPath: string): Promise<void> {
    const inventoryId = path.basename(path.dirname(oldPath));
    const oldUrl = `/uploads/properties/${inventoryId}/${path.basename(oldPath)}`;
    const newUrl = `/uploads/properties/${inventoryId}/${path.basename(newPath)}`;
    const inv = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        select: { video_urls: true },
    });
    if (!inv) return;
    const urls = (inv.video_urls || []).map((u) => (u === oldUrl ? newUrl : u));
    await prisma.inventory.update({ where: { id: inventoryId }, data: { video_urls: urls } });
    logger.info(`[VideoTranscode] video_urls updated: ${oldUrl} -> ${newUrl}`);
}

export async function ensureH264Playable(filePath: string): Promise<void> {
    try {
        if (!filePath || !fs.existsSync(filePath)) return;

        const { stdout } = await execFileP(FFPROBE, [
            "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=codec_name", "-of", "csv=p=0", filePath,
        ], { timeout: 60_000 });
        const codec = String(stdout).trim().toLowerCase().split(/[\s,]/)[0];

        const ext = path.extname(filePath).toLowerCase();
        const needsCodec = !!codec && codec !== "h264";
        const needsContainer = ext !== ".mp4";

        // Already H.264 in an .mp4 — nothing to do, the common case.
        if (!needsCodec && !needsContainer) return;
        if (!codec) return; // ffprobe found no video stream; leave it alone

        const finalPath = needsContainer ? filePath.replace(/\.[^.]+$/, "") + ".mp4" : filePath;
        const tmp = filePath.replace(/\.[^.]+$/, "") + ".h264.tmp.mp4";

        // H.264 already but in the wrong container → remux (stream copy), which is near-instant.
        const videoArgs = needsCodec
            ? ["-c:v", "libx264", "-crf", "23", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k"]
            : ["-c", "copy"];

        logger.info(`[VideoTranscode] ${codec}/${ext} -> h264/.mp4 (${needsCodec ? "transcode" : "remux"}): ${filePath}`);
        await execFileP(FFMPEG, [
            "-y", "-loglevel", "error", "-i", filePath,
            ...videoArgs, "-movflags", "+faststart", tmp,
        ], { timeout: 15 * 60_000, maxBuffer: 16 * 1024 * 1024 });

        fs.renameSync(tmp, finalPath);
        if (finalPath !== filePath) {
            // The extension changed, so the old file and its URL are now stale.
            try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* ignore */ }
            await swapVideoUrl(filePath, finalPath);
        }
        logger.info(`[VideoTranscode] done: ${finalPath}`);
    } catch (e) {
        logger.warn(`[VideoTranscode] skipped/failed for ${filePath}: ${(e as Error).message}`);
        try {
            const t = filePath.replace(/\.[^.]+$/, "") + ".h264.tmp.mp4";
            if (fs.existsSync(t)) fs.unlinkSync(t);
        } catch { /* ignore */ }
    }
}
