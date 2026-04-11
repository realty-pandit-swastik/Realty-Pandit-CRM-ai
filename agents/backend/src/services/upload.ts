/**
 * File Upload Service - Local File System Storage
 * PHASE 15: SSOT-based media storage (no external dependencies)
 *
 * Stores all media files locally in /uploads directory
 * Provides multer configuration and utility functions
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

// Upload directories
const UPLOAD_BASE_DIR = path.join(process.cwd(), 'uploads');
const PROJECT_MEDIA_DIR = path.join(UPLOAD_BASE_DIR, 'projects');
const PROPERTY_MEDIA_DIR = path.join(UPLOAD_BASE_DIR, 'properties');
const PROFILE_DIR = path.join(UPLOAD_BASE_DIR, 'profiles');

// Ensure upload directories exist
[UPLOAD_BASE_DIR, PROJECT_MEDIA_DIR, PROPERTY_MEDIA_DIR, PROFILE_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created upload directory: ${dir}`);
    }
});

// File type validation
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif', 'image/gif', 'image/bmp', 'image/tiff'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/3gpp', 'video/x-ms-wmv', 'video/mpeg'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];

// File size limits (in bytes)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * Storage configuration for multer
 */
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadType = req.body.uploadType || 'projects'; // projects, properties, profiles

        let destinationDir = PROJECT_MEDIA_DIR;
        if (uploadType === 'properties') destinationDir = PROPERTY_MEDIA_DIR;
        else if (uploadType === 'profiles') destinationDir = PROFILE_DIR;

        cb(null, destinationDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename: uuid-timestamp.ext
        const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

/**
 * File filter function
 */
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const mediaType = req.body.mediaType || 'IMAGE'; // IMAGE, VIDEO, DOCUMENT, FLOOR_PLAN, BROCHURE

    let allowedTypes: string[] = [];
    let maxSize: number = MAX_IMAGE_SIZE;

    switch (mediaType) {
        case 'IMAGE':
        case 'FLOOR_PLAN':
        case 'MASTER_PLAN':
            allowedTypes = ALLOWED_IMAGE_TYPES;
            maxSize = MAX_IMAGE_SIZE;
            break;
        case 'VIDEO':
            allowedTypes = ALLOWED_VIDEO_TYPES;
            maxSize = MAX_VIDEO_SIZE;
            break;
        case 'BROCHURE':
        case 'DOCUMENT':
            allowedTypes = ALLOWED_DOCUMENT_TYPES;
            maxSize = MAX_DOCUMENT_SIZE;
            break;
        default:
            allowedTypes = ALLOWED_IMAGE_TYPES; // Default to images
    }

    // Check file type
    if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`));
    }

    // Check file size (multer doesn't provide this in fileFilter, but we set limits in multer config)
    cb(null, true);
};

/**
 * Multer upload configurations
 */

// Project media upload (images, videos, floor plans, brochures)
export const uploadProjectMedia = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_VIDEO_SIZE, // Max of all types
        files: 10 // Max 10 files at once
    }
});

// Property media upload
export const uploadPropertyMedia = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_IMAGE_SIZE,
        files: 20
    }
});

// Profile picture upload
export const uploadProfilePicture = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_IMAGE_SIZE,
        files: 1
    }
});

/**
 * Get public URL for uploaded file
 */
export function getFileUrl(filename: string, uploadType: 'projects' | 'properties' | 'profiles' = 'projects'): string {
    // Return relative URL that will be served by express static middleware
    return `/uploads/${uploadType}/${filename}`;
}

/**
 * Delete file from file system
 */
export async function deleteFile(filepath: string): Promise<boolean> {
    try {
        const fullPath = path.join(UPLOAD_BASE_DIR, filepath);

        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            logger.info(`Deleted file: ${filepath}`);
            return true;
        }

        logger.warn(`File not found for deletion: ${filepath}`);
        return false;
    } catch (error) {
        logger.error(`Error deleting file ${filepath}:`, error);
        return false;
    }
}

/**
 * Get file info
 */
export function getFileInfo(filename: string, uploadType: 'projects' | 'properties' | 'profiles' = 'projects') {
    const fullPath = path.join(uploadType === 'projects' ? PROJECT_MEDIA_DIR : uploadType === 'properties' ? PROPERTY_MEDIA_DIR : PROFILE_DIR, filename);

    if (!fs.existsSync(fullPath)) {
        return null;
    }

    const stats = fs.statSync(fullPath);

    return {
        filename,
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        url: getFileUrl(filename, uploadType)
    };
}

/**
 * Clean up old files (optional cleanup utility)
 * Remove files older than specified days
 */
export async function cleanupOldFiles(days: number = 90): Promise<number> {
    let deletedCount = 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const directories = [PROJECT_MEDIA_DIR, PROPERTY_MEDIA_DIR, PROFILE_DIR];

    for (const directory of directories) {
        const files = fs.readdirSync(directory);

        for (const file of files) {
            const filePath = path.join(directory, file);
            const stats = fs.statSync(filePath);

            if (stats.birthtime < cutoffDate) {
                fs.unlinkSync(filePath);
                deletedCount++;
                logger.info(`Cleaned up old file: ${file}`);
            }
        }
    }

    logger.info(`Cleanup completed: ${deletedCount} files deleted`);
    return deletedCount;
}
