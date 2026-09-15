/**
 * Video transcode-on-upload (2026-07-29).
 *
 * Some uploaded videos are HEVC/H.265 (iPhone .mp4) which Chrome/Firefox cannot decode — they show
 * a dead player on the website. After a video is saved, we ffprobe it and, if it is not already
 * H.264, transcode it to H.264 in place (SAME path/URL, so no DB change). Runs async + non-blocking
 * (ffmpeg is a separate process); callers should NOT await it so the upload response is instant.
 * Until the transcode finishes, the website MediaGallery falls back to photos, so there is never a
 * dead player. Safe no-op on any error.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import logger from "./logger";

const execFileP = promisify(execFile);
const FFPROBE = "/usr/bin/ffprobe";
const FFMPEG = "/usr/bin/ffmpeg";

export async function ensureH264Playable(filePath: string): Promise<void> {
    try {
        if (!filePath || !fs.existsSync(filePath)) return;
        const { stdout } = await execFileP(FFPROBE, [
            "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=codec_name", "-of", "csv=p=0", filePath,
        ], { timeout: 60_000 });
        const codec = String(stdout).trim().toLowerCase().split(/[\s,]/)[0];
        if (!codec || codec === "h264") return; // already web-playable — leave it

        const tmp = filePath.replace(/\.[^.]+$/, "") + ".h264.tmp.mp4";
        logger.info(`[VideoTranscode] ${codec} -> h264: ${filePath}`);
        await execFileP(FFMPEG, [
            "-y", "-loglevel", "error", "-i", filePath,
            "-c:v", "libx264", "-crf", "23", "-preset", "veryfast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", tmp,
        ], { timeout: 15 * 60_000, maxBuffer: 16 * 1024 * 1024 });
        fs.renameSync(tmp, filePath); // atomic replace — same path/URL
        logger.info(`[VideoTranscode] done (${codec} -> h264): ${filePath}`);
    } catch (e) {
        logger.warn(`[VideoTranscode] skipped/failed for ${filePath}: ${(e as Error).message}`);
        try { const t = filePath.replace(/\.[^.]+$/, "") + ".h264.tmp.mp4"; if (fs.existsSync(t)) fs.unlinkSync(t); } catch { /* ignore */ }
    }
}
