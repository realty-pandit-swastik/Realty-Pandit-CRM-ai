/**
 * Audio Storage Service
 * Handles audio file storage locally on the VPS (NO cloud storage)
 * Files stored at /uploads/staff_calls/{callId}/
 * Served via Express static middleware
 */

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'staff_calls');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface UploadResult {
    url: string;
    publicId: string;
    duration?: number;
    format?: string;
}

export interface SignedUrlOptions {
    expiresIn?: number;
}

/**
 * Handle multipart file upload from Express request
 * Moves file from multer temp dir to /uploads/staff_calls/{callId}/
 */
export async function handleMultipartUpload(file: Express.Multer.File, callId: string): Promise<UploadResult> {
    const tempPath = file.path;

    try {
        // Create call-specific directory
        const callDir = path.join(UPLOADS_DIR, callId);
        if (!fs.existsSync(callDir)) {
            fs.mkdirSync(callDir, { recursive: true });
        }

        // Determine file extension from original name or mimetype
        const ext = path.extname(file.originalname) || getExtFromMime(file.mimetype);
        const filename = `recording${ext}`;
        const destPath = path.join(callDir, filename);

        // Move file from temp to permanent location
        fs.copyFileSync(tempPath, destPath);
        fs.unlinkSync(tempPath);

        // Build URL path (served via Express static)
        const urlPath = `uploads/staff_calls/${callId}/${filename}`;

        logger.info(`[AudioStorage] File saved: ${destPath}`);

        return {
            url: urlPath,
            publicId: `${callId}/${filename}`,
            format: ext.replace('.', ''),
        };
    } catch (error) {
        // Cleanup temp file on error
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
        logger.error('[AudioStorage] Upload failed:', error);
        throw new Error(`Failed to store audio: ${(error as Error).message}`);
    }
}

/**
 * Upload audio file from a local path
 */
export async function uploadAudioFile(
    filePath: string,
    options?: { folder?: string; publicId?: string }
): Promise<UploadResult> {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const callId = options?.publicId || `call_${Date.now()}`;
        const callDir = path.join(UPLOADS_DIR, callId);
        if (!fs.existsSync(callDir)) {
            fs.mkdirSync(callDir, { recursive: true });
        }

        const ext = path.extname(filePath) || '.mp3';
        const filename = `recording${ext}`;
        const destPath = path.join(callDir, filename);

        fs.copyFileSync(filePath, destPath);

        const urlPath = `uploads/staff_calls/${callId}/${filename}`;

        return {
            url: urlPath,
            publicId: `${callId}/${filename}`,
            format: ext.replace('.', ''),
        };
    } catch (error) {
        logger.error('[AudioStorage] Upload failed:', error);
        throw new Error(`Failed to upload audio: ${(error as Error).message}`);
    }
}

/**
 * Generate URL for audio playback
 * Since files are served via Express static, just return the relative path
 */
export function generateSignedUrl(publicId: string, _options?: SignedUrlOptions): string {
    // Files are served publicly via Express static, return relative URL
    return `uploads/staff_calls/${publicId}`;
}

/**
 * Delete audio file from local storage
 */
export async function deleteAudioFile(publicId: string): Promise<void> {
    try {
        const filePath = path.join(UPLOADS_DIR, publicId);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            logger.info(`[AudioStorage] File deleted: ${publicId}`);

            // Try to remove empty parent directory
            const dir = path.dirname(filePath);
            const remaining = fs.readdirSync(dir);
            if (remaining.length === 0) {
                fs.rmdirSync(dir);
            }
        }
    } catch (error) {
        logger.error('[AudioStorage] Deletion failed:', error);
        throw new Error(`Failed to delete audio: ${(error as Error).message}`);
    }
}

/**
 * Delete audio files older than retention period (180 days)
 */
export async function cleanupOldRecordings(): Promise<void> {
    try {
        const retentionDays = parseInt(process.env.AUDIO_RETENTION_DAYS || '180');
        const cutoffMs = retentionDays * 24 * 60 * 60 * 1000;
        const now = Date.now();

        if (!fs.existsSync(UPLOADS_DIR)) return;

        const dirs = fs.readdirSync(UPLOADS_DIR);
        let cleaned = 0;

        for (const dir of dirs) {
            const dirPath = path.join(UPLOADS_DIR, dir);
            const stat = fs.statSync(dirPath);
            if (stat.isDirectory() && (now - stat.mtimeMs) > cutoffMs) {
                fs.rmSync(dirPath, { recursive: true, force: true });
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.info(`[AudioStorage] Cleaned up ${cleaned} old recording directories`);
        }
    } catch (error) {
        logger.error('[AudioStorage] Cleanup failed:', error);
    }
}

/**
 * Get audio file metadata
 */
export async function getAudioMetadata(publicId: string): Promise<any> {
    try {
        const filePath = path.join(UPLOADS_DIR, publicId);
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${publicId}`);
        }

        const stat = fs.statSync(filePath);
        const ext = path.extname(filePath).replace('.', '');

        return {
            format: ext,
            size: stat.size,
            created_at: stat.birthtime,
            url: `uploads/staff_calls/${publicId}`,
        };
    } catch (error) {
        logger.error('[AudioStorage] Failed to get metadata:', error);
        throw new Error(`Failed to get metadata: ${(error as Error).message}`);
    }
}

/**
 * Get file extension from MIME type
 */
function getExtFromMime(mime: string): string {
    const map: Record<string, string> = {
        'audio/mpeg': '.mp3',
        'audio/wav': '.wav',
        'audio/mp4': '.m4a',
        'audio/3gpp': '.3gp',
        'audio/ogg': '.ogg',
        'audio/flac': '.flac',
        'audio/aac': '.aac',
    };
    return map[mime] || '.mp3';
}

export default {
    uploadAudioFile,
    generateSignedUrl,
    deleteAudioFile,
    cleanupOldRecordings,
    getAudioMetadata,
    handleMultipartUpload,
};
