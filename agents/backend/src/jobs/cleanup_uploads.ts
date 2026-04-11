/**
 * Cleanup Job for Orphaned Upload Files
 *
 * This job deletes files in /uploads/pending/ that are:
 * 1. Older than 24 hours
 * 2. Not referenced in any Inventory record (media_urls or video_urls)
 *
 * Purpose: Prevent disk space accumulation from abandoned workflow sessions
 *
 * Usage:
 * - Can be run manually: ts-node src/jobs/cleanup_uploads.ts
 * - Can be scheduled via cron: 0 2 * * * (daily at 2 AM)
 * - Can be called programmatically: await cleanupOrphanedUploads()
 */

import fs from 'fs';
import path from 'path';
import prisma from '../db';
import logger from '../utils/logger';

const UPLOAD_BASE = path.join(process.cwd(), 'uploads');
const PENDING_DIR = path.join(UPLOAD_BASE, 'pending');
const MAX_AGE_HOURS = 24;

interface CleanupResult {
    scannedFiles: number;
    deletedFiles: number;
    deletedSize: number; // in bytes
    errors: number;
    deletedFileNames: string[];
}

/**
 * Main cleanup function
 */
export async function cleanupOrphanedUploads(): Promise<CleanupResult> {
    const result: CleanupResult = {
        scannedFiles: 0,
        deletedFiles: 0,
        deletedSize: 0,
        errors: 0,
        deletedFileNames: [],
    };

    logger.info('[Cleanup] Starting orphaned uploads cleanup job');

    try {
        // Check if pending directory exists
        if (!fs.existsSync(PENDING_DIR)) {
            logger.warn('[Cleanup] Pending directory does not exist:', PENDING_DIR);
            return result;
        }

        // Get all files in pending directory
        const files = fs.readdirSync(PENDING_DIR);
        result.scannedFiles = files.length;

        logger.info(`[Cleanup] Found ${files.length} files in pending directory`);

        // Get cutoff time (24 hours ago)
        const cutoffTime = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000);

        // Get all referenced file paths from Inventory
        const inventories = await prisma.inventory.findMany({
            select: {
                media_urls: true,
                video_urls: true,
            },
        });

        // Build set of referenced files for fast lookup
        const referencedFiles = new Set<string>();
        for (const inv of inventories) {
            // media_urls is string[] or null
            if (Array.isArray(inv.media_urls)) {
                for (const url of inv.media_urls) {
                    // Extract filename from URL (e.g., "/uploads/pending/abc.jpg" -> "abc.jpg")
                    const filename = path.basename(url);
                    referencedFiles.add(filename);
                }
            }
            // video_urls is string[] or null
            if (Array.isArray(inv.video_urls)) {
                for (const url of inv.video_urls) {
                    const filename = path.basename(url);
                    referencedFiles.add(filename);
                }
            }
        }

        logger.info(`[Cleanup] Found ${referencedFiles.size} files referenced in Inventory`);

        // Process each file
        for (const filename of files) {
            try {
                const filePath = path.join(PENDING_DIR, filename);
                const stats = fs.statSync(filePath);

                // Skip if not a file
                if (!stats.isFile()) {
                    continue;
                }

                // Check if file is older than 24 hours
                if (stats.mtime > cutoffTime) {
                    continue; // File is too recent, skip
                }

                // Check if file is referenced in any Inventory
                if (referencedFiles.has(filename)) {
                    continue; // File is referenced, skip
                }

                // File is orphaned and old enough - delete it
                try {
                    fs.unlinkSync(filePath);
                    result.deletedFiles++;
                    result.deletedSize += stats.size;
                    result.deletedFileNames.push(filename);

                    logger.info(`[Cleanup] Deleted orphaned file: ${filename} (${Math.round(stats.size / 1024)}KB, age: ${Math.round((Date.now() - stats.mtime.getTime()) / (60 * 60 * 1000))}h)`);
                } catch (deleteErr) {
                    result.errors++;
                    logger.error(`[Cleanup] Failed to delete file: ${filename}`, deleteErr);
                }
            } catch (fileErr) {
                result.errors++;
                logger.error(`[Cleanup] Error processing file: ${filename}`, fileErr);
            }
        }

        logger.info('[Cleanup] Job completed', {
            scannedFiles: result.scannedFiles,
            deletedFiles: result.deletedFiles,
            deletedSize: `${Math.round(result.deletedSize / 1024)}KB`,
            errors: result.errors,
        });

        return result;
    } catch (error) {
        logger.error('[Cleanup] Job failed with error', error);
        throw error;
    }
}

/**
 * Run cleanup job if this file is executed directly
 */
if (require.main === module) {
    cleanupOrphanedUploads()
        .then((result) => {
            console.log('Cleanup completed successfully:', result);
            process.exit(0);
        })
        .catch((error) => {
            console.error('Cleanup failed:', error);
            process.exit(1);
        });
}
