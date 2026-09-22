
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'properties');
const DOCS_DIR = path.join(process.cwd(), 'uploads', 'documents');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif', 'image/gif', 'image/bmp'];
const ALLOWED_DOC_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];

interface UploadResult {
    original: string;
    medium: string;
    thumbnail: string;
}

/**
 * Local disk storage service for property media.
 * Stores originals + generates optimized variants via sharp.
 * Migration path: swap this service to use S3 when scaling to AWS.
 */
export class StorageService {

    constructor() {
        // Ensure base uploads directories exist
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        fs.mkdirSync(DOCS_DIR, { recursive: true });
    }

    /**
     * Upload and optimize an image for a property.
     * Generates: original (WebP), medium (800x600), thumbnail (400x300).
     */
    async uploadImage(
        file: Express.Multer.File,
        inventoryId: string
    ): Promise<UploadResult> {
        // Validate
        if (!ALLOWED_MIMES.includes(file.mimetype)) {
            throw new Error(`Invalid file type: ${file.mimetype}. Allowed: jpeg, png, webp`);
        }
        if (file.size > MAX_FILE_SIZE) {
            throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 10MB`);
        }

        // 2026-08-11: the media route now uses multer diskStorage (a 100MB video buffered in
        // RAM would blow the ~2GB Node heap), so `file.buffer` is undefined there and the bytes
        // live at `file.path`. sharp accepts either a path or a Buffer, so support both and stay
        // compatible with any caller still using memoryStorage.
        const sharpSource: string | Buffer = (file as any).path || file.buffer;

        // Create directory for this property
        const propertyDir = path.join(UPLOADS_DIR, inventoryId);
        fs.mkdirSync(propertyDir, { recursive: true });

        const timestamp = Date.now();
        const baseName = `${timestamp}`;

        // Original → WebP (optimized)
        const originalPath = path.join(propertyDir, `${baseName}.webp`);
        await sharp(sharpSource)
            .webp({ quality: 85 })
            .toFile(originalPath);

        // Medium (800x600) → for property detail page
        const mediumPath = path.join(propertyDir, `${baseName}_medium.webp`);
        await sharp(sharpSource)
            .resize(800, 600, { fit: 'cover' })
            .webp({ quality: 80 })
            .toFile(mediumPath);

        // Thumbnail (400x300) → for listing cards
        const thumbPath = path.join(propertyDir, `${baseName}_thumb.webp`);
        await sharp(sharpSource)
            .resize(400, 300, { fit: 'cover' })
            .webp({ quality: 75 })
            .toFile(thumbPath);

        // Return relative URL paths (served via express.static)
        return {
            original: `/uploads/properties/${inventoryId}/${baseName}.webp`,
            medium: `/uploads/properties/${inventoryId}/${baseName}_medium.webp`,
            thumbnail: `/uploads/properties/${inventoryId}/${baseName}_thumb.webp`
        };
    }

    /**
     * Upload a buffer directly (e.g., from WhatsApp media download).
     */
    async uploadBuffer(
        buffer: Buffer,
        inventoryId: string,
        mimeType: string = 'image/jpeg'
    ): Promise<UploadResult> {
        const fakeFile = {
            buffer,
            mimetype: mimeType,
            size: buffer.length
        } as Express.Multer.File;

        return this.uploadImage(fakeFile, inventoryId);
    }

    /**
     * Upload a document (PDF, Word, or image) without image optimization.
     * Stores the file as-is — no sharp processing.
     */
    async uploadDocument(
        buffer: Buffer,
        folderKey: string,
        mimeType: string,
        originalFilename?: string
    ): Promise<{ url: string; file_name: string; mime_type: string; file_size: number }> {
        if (!ALLOWED_DOC_MIMES.includes(mimeType)) {
            throw new Error(`Invalid document type: ${mimeType}. Allowed: PDF, Word, JPEG, PNG, WebP`);
        }
        if (buffer.length > MAX_FILE_SIZE) {
            throw new Error(`File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB. Max: 10MB`);
        }

        const docDir = path.join(DOCS_DIR, folderKey);
        fs.mkdirSync(docDir, { recursive: true });

        const ext = mimeType === 'application/pdf' ? '.pdf'
            : mimeType === 'application/msword' ? '.doc'
            : mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? '.docx'
            : mimeType === 'image/png' ? '.png'
            : mimeType === 'image/webp' ? '.webp'
            : '.jpg';

        const timestamp = Date.now();
        const fileName = originalFilename || `document_${timestamp}${ext}`;
        const safeName = `${timestamp}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = path.join(docDir, safeName);

        fs.writeFileSync(filePath, buffer);

        return {
            url: `/uploads/documents/${folderKey}/${safeName}`,
            file_name: fileName,
            mime_type: mimeType,
            file_size: buffer.length,
        };
    }

    /**
     * Delete a specific media file and its variants.
     */
    async deleteMedia(inventoryId: string, filename: string): Promise<void> {
        const baseName = filename.replace(/\.(webp|jpg|jpeg|png)$/, '');
        const propertyDir = path.join(UPLOADS_DIR, inventoryId);

        const variants = [
            `${baseName}.webp`,
            `${baseName}_medium.webp`,
            `${baseName}_thumb.webp`
        ];

        for (const variant of variants) {
            const filePath = path.join(propertyDir, variant);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    }

    /**
     * Delete all media for a property.
     */
    async deleteAllMedia(inventoryId: string): Promise<void> {
        const propertyDir = path.join(UPLOADS_DIR, inventoryId);
        if (fs.existsSync(propertyDir)) {
            fs.rmSync(propertyDir, { recursive: true });
        }
    }

    /**
     * Get total disk usage of uploads directory in MB.
     */
    getDiskUsageMB(): number {
        return this.getDirSize(UPLOADS_DIR) / (1024 * 1024);
    }

    private getDirSize(dirPath: string): number {
        if (!fs.existsSync(dirPath)) return 0;
        let size = 0;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                size += this.getDirSize(fullPath);
            } else {
                size += fs.statSync(fullPath).size;
            }
        }
        return size;
    }
}
