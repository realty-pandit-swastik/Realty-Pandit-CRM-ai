/**
 * Chat Workflow API Routes
 *
 * REST API for the conversational property listing chat interface.
 * Powers both website and admin panel chat UIs.
 *
 * Supports two workflow types:
 *   - 'inventory' (default): Property listing/upload workflow
 *   - 'buyer_intake': Buyer lead capture + property matching workflow
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { ChatWorkflowAdapter } from '../workflows/chat_workflow_adapter';
import { BuyerChatWorkflowAdapter } from '../workflows/buyer_chat_workflow_adapter';
import logger from '../utils/logger';
import { captureRouteError } from '../utils/capture';

const router = Router();
const adapter = new ChatWorkflowAdapter();
const buyerAdapter = new BuyerChatWorkflowAdapter();

// ─── Upload configuration (reuse same dirs as workflow routes) ───────────────

const UPLOAD_BASE = path.join(process.cwd(), 'uploads');
const PENDING_DIR = path.join(UPLOAD_BASE, 'pending');

[PENDING_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif', 'image/gif', 'image/bmp', 'image/tiff', 'image/svg+xml'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/3gpp', 'video/x-ms-wmv', 'video/mpeg'];
const ALLOWED_DOC_TYPES = [
    'application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif',
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
        if ([...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_DOC_TYPES].includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype}`));
        }
    },
    limits: { fileSize: 100 * 1024 * 1024, files: 10 },
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/chat/start
 * Start a new chat workflow session.
 * Body: { session_id?: string, workflow_type?: 'inventory' | 'buyer_intake', source?: 'web' | 'admin' }
 */
router.post('/start', async (req: Request, res: Response) => {
    try {
        const { session_id, workflow_type, source, prefill } = req.body || {};

        if (workflow_type === 'buyer_intake') {
            const result = await buyerAdapter.startSession(session_id, source || 'web', prefill);
            return res.json(result);
        }

        const result = await adapter.startSession(session_id, source || 'web');
        res.json(result);
    } catch (err) {
        captureRouteError(err, req, { route: 'chat_workflow#1' });
        logger.error('[ChatWorkflow] /start error:', err);
        res.status(500).json({ error: 'Failed to start chat session' });
    }
});

/**
 * POST /api/chat/message
 * Send a message in the chat workflow.
 * Body: { session_id: string, text?: string, quick_reply_value?: string, workflow_type?: string, source?: string }
 */
router.post('/message', async (req: Request, res: Response) => {
    try {
        const { session_id, text, quick_reply_value, workflow_type, source } = req.body || {};
        if (!session_id) {
            return res.status(400).json({ error: 'session_id is required' });
        }

        if (workflow_type === 'buyer_intake') {
            const result = await buyerAdapter.handleMessage(session_id, text, quick_reply_value, source || 'web');
            return res.json(result);
        }

        const result = await adapter.handleMessage(session_id, text, quick_reply_value);
        res.json(result);
    } catch (err) {
        captureRouteError(err, req, { route: 'chat_workflow#2' });
        logger.error('[ChatWorkflow] /message error:', err);
        res.status(500).json({ error: 'Failed to process message' });
    }
});

/**
 * POST /api/chat/upload-media
 * Upload media files during chat workflow.
 * Multipart form: session_id + files (photos/videos/documents)
 */
router.post('/upload-media', (req: Request, res: Response) => {
    uploadMedia.array('files', 10)(req, res, async (multerErr: any) => {
        if (multerErr) {
            logger.error('[ChatWorkflow] /upload-media multer error:', multerErr);
            if (multerErr.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'File too large. Maximum size is 50MB per file.' });
            }
            if (multerErr.code === 'LIMIT_FILE_COUNT') {
                return res.status(400).json({ error: 'Too many files. Maximum 10 files per upload.' });
            }
            return res.status(400).json({ error: multerErr.message || 'Invalid file upload' });
        }

        try {
            const { session_id, type } = req.body;
            if (!session_id) {
                return res.status(400).json({ error: 'session_id is required' });
            }

            const files = req.files as Express.Multer.File[];
            if (!files || files.length === 0) {
                return res.status(400).json({ error: 'No files uploaded' });
            }

            const urls = files.map(f => `/uploads/pending/${f.filename}`);
            const docMeta = files.map(f => ({
                file_name: f.originalname,
                mime_type: f.mimetype,
                file_size: f.size,
            }));

            const uploadType = type || (files[0].mimetype.startsWith('image/') ? 'photo' :
                files[0].mimetype.startsWith('video/') ? 'video' : 'document');

            const result = await adapter.handleUpload(session_id, uploadType, urls, docMeta);
            res.json(result);
        } catch (err) {
        captureRouteError(err, req, { route: 'chat_workflow#3' });
            logger.error('[ChatWorkflow] /upload-media error:', err);
            res.status(500).json({ error: 'Failed to upload media' });
        }
    });
});

/**
 * POST /api/chat/confirm
 * Confirm or edit the property listing.
 * Body: { session_id: string, confirmed: boolean }
 */
router.post('/confirm', async (req: Request, res: Response) => {
    try {
        const { session_id, confirmed } = req.body;
        if (!session_id) {
            return res.status(400).json({ error: 'session_id is required' });
        }

        // Try to extract agentId from auth token if present
        let agentId: string | undefined;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            try {
                const token = authHeader.split(' ')[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
                agentId = decoded.agentId || decoded.id;
            } catch {
                // No valid token — that's fine for website (web) submissions
            }
        }

        const result = await adapter.handleConfirm(session_id, confirmed, agentId);
        res.json(result);
    } catch (err) {
        captureRouteError(err, req, { route: 'chat_workflow#4' });
        logger.error('[ChatWorkflow] /confirm error:', err);
        res.status(500).json({ error: 'Failed to process confirmation' });
    }
});

/**
 * GET /api/chat/session/:id
 * Get session state for reconnection.
 * Query: ?workflow_type=buyer_intake (optional)
 */
router.get('/session/:id', async (req: Request, res: Response) => {
    try {
        const workflowType = req.query.workflow_type as string;

        if (workflowType === 'buyer_intake') {
            const result = await buyerAdapter.getSession(req.params.id as string);
            return res.json(result);
        }

        const result = await adapter.getSession(req.params.id as string);
        res.json(result);
    } catch (err) {
        captureRouteError(err, req, { route: 'chat_workflow#5' });
        logger.error('[ChatWorkflow] /session error:', err);
        res.status(500).json({ error: 'Failed to get session' });
    }
});

// ─── Buyer-Specific Routes ──────────────────────────────────────────────────

/**
 * POST /api/chat/buyer/action
 * Handle buyer action on a property card.
 * Body: { session_id: string, action: 'schedule_visit' | 'next_property' | 'change_requirements', source?: string }
 */
router.post('/buyer/action', async (req: Request, res: Response) => {
    try {
        const { session_id, action, source } = req.body;
        if (!session_id || !action) {
            return res.status(400).json({ error: 'session_id and action are required' });
        }

        const result = await buyerAdapter.handleAction(session_id, action, source || 'web');
        res.json(result);
    } catch (err) {
        captureRouteError(err, req, { route: 'chat_workflow#6' });
        logger.error('[ChatWorkflow] /buyer/action error:', err);
        res.status(500).json({ error: 'Failed to process buyer action' });
    }
});

/**
 * POST /api/chat/buyer/book
 * Book a property visit.
 * Body: { session_id: string, property_id: string, preferred_date?: string, preferred_time?: string, source?: string }
 */
router.post('/buyer/book', async (req: Request, res: Response) => {
    try {
        const { session_id, property_id, preferred_date, preferred_time, source } = req.body;
        if (!session_id || !property_id) {
            return res.status(400).json({ error: 'session_id and property_id are required' });
        }

        const result = await buyerAdapter.handleBookVisit(
            session_id,
            property_id,
            preferred_date,
            preferred_time,
            source || 'web',
        );
        res.json(result);
    } catch (err) {
        captureRouteError(err, req, { route: 'chat_workflow#7' });
        logger.error('[ChatWorkflow] /buyer/book error:', err);
        res.status(500).json({ error: 'Failed to book visit' });
    }
});

export default router;
