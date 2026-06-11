/**
 * Unified Inventory Workflow API Routes
 *
 * These routes power the step-by-step inventory upload workflow
 * across all platforms: Admin Dashboard, Public Website, WhatsApp.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { WorkflowEngine } from '../workflows/workflow_engine';
import { WORKFLOW_GROUPS, DOCUMENT_TYPES, ENRICHMENT_STEPS, ENRICHMENT_GROUPS } from '../workflows/workflow_definition';
import { moderateImages, ModerationResult } from '../services/image_moderation';
import { authMiddleware } from '../middleware/auth';
import logger from '../utils/logger';
import prisma from '../db';
import { captureRouteError } from '../utils/capture';

const router = Router();
const engine = new WorkflowEngine();

// ─── Upload configuration ────────────────────────────────────────────────────

const UPLOAD_BASE = path.join(process.cwd(), 'uploads');
const PENDING_DIR = path.join(UPLOAD_BASE, 'pending');
const PROPERTY_DIR = path.join(UPLOAD_BASE, 'properties');

// Ensure directories exist
[PENDING_DIR, PROPERTY_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif', 'image/gif', 'image/bmp', 'image/tiff'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/3gpp', 'video/x-ms-wmv', 'video/mpeg'];
const ALLOWED_DOC_TYPES = [
    'application/pdf',
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
];

const mediaStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PENDING_DIR),
    filename: (_req, file, cb) => {
        cb(null, `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`);
    },
});

const uploadMedia = multer({
    storage: mediaStorage,
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
        else cb(new Error(`Invalid image type. Allowed: ${ALLOWED_IMAGE_TYPES.join(', ')}`));
    },
    limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});

const uploadVideo = multer({
    storage: mediaStorage,
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) cb(null, true);
        else cb(new Error(`Invalid video type. Allowed: MP4, WebM, MOV, AVI`));
    },
    limits: { fileSize: 100 * 1024 * 1024, files: 3 },
});

const uploadDocument = multer({
    storage: mediaStorage,
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_DOC_TYPES.includes(file.mimetype)) cb(null, true);
        else cb(new Error(`Invalid document type. Allowed: ${ALLOWED_DOC_TYPES.join(', ')}`));
    },
    limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/workflow/definition
 * Returns the full workflow step definitions + groups + document types.
 */
router.get('/definition', (_req: Request, res: Response) => {
    try {
        const steps = engine.getDefinition();
        res.json({
            steps,
            groups: WORKFLOW_GROUPS,
            document_types: DOCUMENT_TYPES,
            enrichment_steps: ENRICHMENT_STEPS,
            enrichment_groups: ENRICHMENT_GROUPS,
        });
    } catch (err) {
        captureRouteError(err, _req, { route: 'workflow#1' });
        logger.error('[Workflow] Error fetching definition', err);
        res.status(500).json({ error: 'Failed to fetch workflow definition' });
    }
});

/**
 * POST /api/workflow/next-step
 * Body: { current_step_id: string | null, answers: {} }
 * Returns the next visible step with resolved options.
 */
router.post('/next-step', async (req: Request, res: Response) => {
    try {
        const { current_step_id, answers, source } = req.body;

        if (answers === undefined || typeof answers !== 'object') {
            return res.status(400).json({ error: 'answers object is required' });
        }

        // Inject _source for step visibility rules (skip_when/show_when)
        if (source && !answers._source) {
            answers._source = source;
        }

        const result = await engine.getNextStep(current_step_id ?? null, answers);

        if (!result) {
            return res.json({ done: true, step: null, options: null });
        }

        res.json({ done: false, step: result.step, options: result.options || [], metadata: result.metadata || null });
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow#2' });
        logger.error('[Workflow] next-step error', err);
        res.status(500).json({ error: 'Failed to get next step' });
    }
});

/**
 * POST /api/workflow/previous-step
 * Body: { current_step_id: string, answers: {} }
 * Returns the previous visible step.
 */
router.post('/previous-step', async (req: Request, res: Response) => {
    try {
        const { current_step_id, answers } = req.body;

        if (!current_step_id) {
            return res.status(400).json({ error: 'current_step_id is required' });
        }

        const result = await engine.getPreviousStep(current_step_id, answers || {});

        if (!result) {
            return res.json({ step: null, options: null });
        }

        res.json({ step: result.step, options: result.options || [] });
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow#3' });
        logger.error('[Workflow] previous-step error', err);
        res.status(500).json({ error: 'Failed to get previous step' });
    }
});

/**
 * POST /api/workflow/validate
 * Body: { step_id: string, value: any, answers: {} }
 * Returns { valid: boolean, error?: string }.
 */
router.post('/validate', async (req: Request, res: Response) => {
    try {
        const { step_id, value, answers } = req.body;

        if (!step_id) {
            return res.status(400).json({ error: 'step_id is required' });
        }

        const result = await engine.validateStep(step_id, value, answers || {});
        res.json(result);
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow#4' });
        logger.error('[Workflow] validate error', err);
        res.status(500).json({ error: 'Validation failed' });
    }
});

/**
 * POST /api/workflow/options
 * Body: { step_id: string, answers: {} }
 * Returns resolved dropdown options for a step.
 */
router.post('/options', async (req: Request, res: Response) => {
    try {
        const { step_id, answers } = req.body;

        if (!step_id) {
            return res.status(400).json({ error: 'step_id is required' });
        }

        const steps = engine.getDefinition();
        const step = steps.find(s => s.id === step_id);

        if (!step) {
            return res.status(404).json({ error: `Step not found: ${step_id}` });
        }

        const options = await engine.getStepOptions(step, answers || {});
        res.json({ options });
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow#5' });
        logger.error('[Workflow] options error', err);
        res.status(500).json({ error: 'Failed to fetch options' });
    }
});

/**
 * POST /api/workflow/visible-steps
 * Body: { answers: {} }
 * Returns all visible steps for progress tracking.
 */
router.post('/visible-steps', async (req: Request, res: Response) => {
    try {
        const { answers } = req.body;
        const steps = await engine.getVisibleSteps(answers || {});
        res.json({ steps, groups: WORKFLOW_GROUPS });
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow#6' });
        logger.error('[Workflow] visible-steps error', err);
        res.status(500).json({ error: 'Failed to get visible steps' });
    }
});

/**
 * POST /api/workflow/summary
 * Body: { answers: {} }
 * Returns human-readable summary of all answers.
 */
router.post('/summary', async (req: Request, res: Response) => {
    try {
        const { answers } = req.body;

        if (!answers) {
            return res.status(400).json({ error: 'answers object is required' });
        }

        const summary = await engine.buildSummary(answers);
        res.json({ summary });
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow#7' });
        logger.error('[Workflow] summary error', err);
        res.status(500).json({ error: 'Failed to build summary' });
    }
});

/**
 * POST /api/workflow/commit
 * Body: { answers: {}, source: "web" | "admin" | "whatsapp" | "voice" }
 * Commits the workflow — creates Contact + Owner + Inventory + Interaction.
 * Optional: Bearer token for admin/agent identity.
 */
router.post('/commit', async (req: Request, res: Response) => {
    try {
        const { answers, source } = req.body;

        if (!answers || !source) {
            return res.status(400).json({ error: 'answers and source are required' });
        }

        const validSources = ['web', 'admin', 'whatsapp', 'voice'];
        if (!validSources.includes(source)) {
            return res.status(400).json({ error: `source must be one of: ${validSources.join(', ')}` });
        }

        // Optional agent identity — supports both HttpOnly cookie (admin SPA) and
        // Bearer header (legacy API clients). Mirrors authMiddleware's dual-mode pattern.
        // Bug fix 2026-05-12: previously only read Bearer, which broke every admin
        // submit since the admin frontend uses cookies, not Bearer tokens.
        let agentId: string | undefined;
        const cookieToken: string | undefined = req.cookies?.['rp_access_token'];
        const authHeader = req.headers.authorization;
        const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
        const token = cookieToken ?? bearerToken;

        if (token) {
            try {
                const decoded: any = jwt.verify(token, process.env.JWT_SECRET || process.env.AGENT_JWT_SECRET || 'secret');
                if (decoded?.id) agentId = decoded.id;
            } catch {
                // Invalid/expired token. Public users (web/whatsapp/voice) don't need auth.
                // Admin must reject to avoid NULL uploaded_by_agent_id in DB.
                if (source === 'admin') {
                    return res.status(401).json({ error: 'Session expired. Please refresh the page and try again.' });
                }
            }
        }

        // Admin submissions always require an authenticated agent
        if (source === 'admin' && !agentId) {
            return res.status(401).json({ error: 'Session expired. Please refresh the page and try again.' });
        }

        // Inject _source for engine to read
        if (!answers._source) answers._source = source;

        const result = await engine.commit(answers, source, agentId);
        res.status(201).json({ success: true, ...result });
    } catch (err) {
        captureRouteError(err, req, { route: 'workflow#8' });
        logger.error('[Workflow] commit error', err);
        res.status(500).json({ error: (err as Error).message || 'Failed to commit inventory' });
    }
});

/**
 * POST /api/workflow/upload-media
 * Multipart form with field "photos" (up to 10 images).
 * Returns { urls: string[] } — paths to pending uploaded files.
 *
 * NEW BEHAVIOR: Accepts uploads immediately, moderates asynchronously.
 * This provides instant feedback to users instead of blocking 10-25 seconds.
 */
router.post('/upload-media', authMiddleware, (req: Request, res: Response) => {
    logger.info('[Upload] Media upload request received', {
        origin: req.headers.origin,
        contentType: req.headers['content-type'],
        userAgent: req.headers['user-agent']?.substring(0, 100),
        agentId: (req as any).agent?.id,
    });

    uploadMedia.array('photos', 10)(req, res, async (err) => {
        try {
            if (err) {
                logger.error('[Upload] Media upload failed', {
                    error: err.message,
                    code: err instanceof multer.MulterError ? err.code : 'UNKNOWN',
                    field: err instanceof multer.MulterError ? err.field : undefined,
                });
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Max 10MB per image.' });
                    if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Too many files. Max 10 photos.' });
                }
                return res.status(400).json({ error: (err as Error).message });
            }

            const files = req.files as Express.Multer.File[];
            if (!files || files.length === 0) {
                logger.warn('[Upload] No files in upload request');
                return res.status(400).json({ error: 'No files uploaded' });
            }

            logger.info('[Upload] Files received for processing', {
                count: files.length,
                sizes: files.map(f => Math.round(f.size / 1024) + 'KB'),
                types: files.map(f => f.mimetype),
            });

            // STEP 1: Accept all uploads immediately and return URLs to user
            const urls: string[] = [];
            for (const file of files) {
                urls.push(`/uploads/pending/${file.filename}`);
            }

            logger.info('[Upload] Files accepted, returning URLs immediately', {
                count: urls.length,
            });

            // STEP 2: Return response immediately (no blocking!)
            res.json({
                urls,
                count: urls.length,
                message: 'Files uploaded successfully. Content moderation in progress.',
            });

            // STEP 3: Fire off moderation asynchronously (fire-and-forget)
            // Use setImmediate to run after response is sent
            setImmediate(async () => {
                try {
                    const filePaths = files.map(f => f.path);
                    const moderationResults = await moderateImages(filePaths);

                    const approved: string[] = [];
                    const rejected: { url: string; reasons: string[] }[] = [];

                    for (const file of files) {
                        const result = moderationResults[file.path];
                        const url = `/uploads/pending/${file.filename}`;

                        if (result && !result.approved) {
                            // Delete rejected file
                            try {
                                fs.unlinkSync(file.path);
                                logger.warn('[Upload] File rejected and deleted by moderation', {
                                    filename: file.filename,
                                    reasons: result.reasons,
                                });
                            } catch (unlinkErr) {
                                logger.error('[Upload] Failed to delete rejected file', {
                                    filename: file.filename,
                                    error: unlinkErr,
                                });
                            }
                            rejected.push({ url, reasons: result.reasons });
                        } else {
                            approved.push(url);
                        }
                    }

                    logger.info('[Upload] Async moderation complete', {
                        approved: approved.length,
                        rejected: rejected.length,
                        rejectionReasons: rejected.length > 0 ? rejected.map(r => r.reasons.join(', ')) : undefined,
                    });

                    // If any files were rejected, find inventory records that reference those URLs
                    // and mark them as PENDING_REVIEW so admins can review
                    if (rejected.length > 0) {
                        try {
                            const rejectedUrls = rejected.map(r => r.url);
                            // Search for inventory items containing any of the rejected URLs
                            const affectedInventory = await prisma.inventory.findMany({
                                where: {
                                    status: { in: ['active', 'draft'] },
                                    media_urls: { hasSome: rejectedUrls },
                                },
                                select: { id: true },
                            });
                            for (const inv of affectedInventory) {
                                await prisma.inventory.update({
                                    where: { id: inv.id },
                                    data: { status: 'pending_review' },
                                });
                                logger.warn('[Upload] Inventory marked PENDING_REVIEW due to rejected images', {
                                    inventoryId: inv.id,
                                    rejectedFiles: rejectedUrls,
                                });
                            }
                        } catch (reviewErr) {
                            logger.error('[Upload] Failed to mark inventory as PENDING_REVIEW', { error: reviewErr });
                        }
                    }
                } catch (moderationError) {
                    logger.error('[Upload] Async moderation failed', {
                        error: moderationError,
                        files: files.map(f => f.filename),
                    });
                    // Don't crash - files are already uploaded and URLs returned
                    // Moderation failure is logged but doesn't affect user experience
                }
            });
        } catch (error) {
        captureRouteError(error, req, { route: 'workflow#9' });
            logger.error('[Upload] Unexpected error in upload handler', { error });
            if (!res.headersSent) {
                res.status(500).json({ error: 'Upload failed due to server error' });
            }
        }
    });
});

/**
 * POST /api/workflow/upload-video
 * Multipart form with field "videos" (up to 3 videos).
 * Returns { urls: string[] } — paths to pending uploaded files.
 */
router.post('/upload-video', authMiddleware, (req: Request, res: Response) => {
    uploadVideo.array('videos', 3)(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Max 50MB per video.' });
                if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Too many files. Max 3 videos.' });
            }
            return res.status(400).json({ error: (err as Error).message });
        }

        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const urls = files.map(f => `/uploads/pending/${f.filename}`);
        res.json({ urls, count: urls.length });
    });
});

/**
 * POST /api/workflow/upload-document
 * Multipart form with field "document" (single file) + "doc_type" + "title".
 * Returns { url, doc_type, title, file_name, mime_type, file_size }.
 */
router.post('/upload-document', authMiddleware, (req: Request, res: Response) => {
    uploadDocument.single('document')(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'File too large. Max 20MB per document.' });
            }
            return res.status(400).json({ error: (err as Error).message });
        }

        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No document uploaded' });
        }

        const docType = req.body.doc_type || 'other';
        const title = req.body.title || file.originalname;

        res.json({
            url: `/uploads/pending/${file.filename}`,
            doc_type: docType,
            title,
            file_name: file.originalname,
            mime_type: file.mimetype,
            file_size: file.size,
        });
    });
});

export default router;
