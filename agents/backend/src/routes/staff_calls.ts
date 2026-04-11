/**
 * Staff Call Intelligence API Routes
 * Handles call recording uploads, AI processing, and staff review workflow
 * All endpoints require JWT authentication
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../db';
import { authMiddleware, checkPermission } from '../middleware/auth';
import audioStorage from '../services/audio_storage';
import { validate } from '../validators';
import { callSubmitSchema } from '../validators/calls.validator';
import logger from '../utils/logger';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.AGENT_JWT_SECRET || 'agent-secret';

// Agent authentication middleware for staff calls
const authenticateAgent = async (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.agent = { id: decoded.id, phone: decoded.phone };
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid token' });
    }
};

const router = Router();

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/temp/',
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
    },
    fileFilter: (req, file, cb) => {
        // Accept audio files only
        const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/3gpp', 'audio/ogg'];
        if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(mp3|wav|m4a|3gp|ogg)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only audio files are allowed.'));
        }
    },
});

// ---------------------------------------------------------
// POST /api/calls/upload - Upload call recording
// ---------------------------------------------------------
router.post('/upload', authenticateAgent, upload.single('audio'), async (req, res) => {
    try {
        const agentId = (req as any).agent.id; // From JWT middleware
        const { phone_number, classification, duration } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'Audio file is required' });
        }

        if (!phone_number) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        // Get tenant
        const agent = await prisma.agent.findUnique({
            where: { id: agentId },
            select: { tenant_id: true },
        });

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Find or create contact
        const contact = await prisma.contact.upsert({
            where: { phone_number },
            update: {
                last_interaction: new Date(),
                last_channel: 'staff_call',
            },
            create: {
                phone_number,
                tenant_id: agent.tenant_id,
                source: 'staff_call',
                contact_type: 'UNKNOWN',
                last_channel: 'staff_call',
                last_interaction: new Date(),
            },
        });

        // Create StaffCall record with UPLOADING status
        const staffCall = await prisma.staffCall.create({
            data: {
                tenant_id: agent.tenant_id,
                staff_agent_id: agentId,
                phone_number,
                classification: classification || 'OUTBOUND',
                call_type: 'BUSINESS',
                duration: duration ? parseInt(duration) : null,
                status: 'UPLOADING',
            },
        });

        // Upload audio to cloud storage (async)
        audioStorage
            .handleMultipartUpload(req.file, staffCall.id)
            .then(async (uploadResult) => {
                // Update staff call with recording URL
                await prisma.staffCall.update({
                    where: { id: staffCall.id },
                    data: {
                        recording_url: uploadResult.url,
                        duration: uploadResult.duration || null,
                        status: 'PROCESSING',
                    },
                });

                logger.info(`[StaffCall] Upload complete: ${staffCall.id}`);
            })
            .catch(async (error) => {
                logger.error('[StaffCall] Upload failed:', error);
                await prisma.staffCall.update({
                    where: { id: staffCall.id },
                    data: { status: 'REJECTED' },
                });
            });

        res.status(201).json({
            success: true,
            call_id: staffCall.id,
            message: 'Call recording uploaded successfully. Processing will begin shortly.',
        });
    } catch (error) {
        logger.error('[StaffCall] Upload error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// ---------------------------------------------------------
// GET /api/calls/:id - Get call status and AI results
// ---------------------------------------------------------
router.get('/:id', authenticateAgent, async (req, res) => {
    try {
        const { id } = req.params;
        const agentId = (req as any).agent.id;

        const staffCall = await prisma.staffCall.findUnique({
            where: { id },
            include: {
                contact: {
                    select: {
                        name: true,
                        phone_number: true,
                        contact_type: true,
                        intent: true,
                    },
                },
            },
        });

        if (!staffCall) {
            return res.status(404).json({ error: 'Call not found' });
        }

        // Verify ownership (agent can only view their own calls)
        if (staffCall.staff_agent_id !== agentId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Generate signed URL if recording exists
        let playbackUrl = null;
        if (staffCall.recording_url) {
            try {
                // Extract public ID from URL
                const publicId = staffCall.recording_url.split('/').slice(-2).join('/').split('.')[0];
                playbackUrl = audioStorage.generateSignedUrl(publicId, { expiresIn: 3600 });
            } catch (err) {
                logger.warn('Failed to generate signed URL:', err);
                playbackUrl = staffCall.recording_url; // Fallback to direct URL
            }
        }

        res.json({
            id: staffCall.id,
            phone_number: staffCall.phone_number,
            contact: staffCall.contact,
            status: staffCall.status,
            duration: staffCall.duration,
            recording_url: playbackUrl,
            transcript: staffCall.transcript,
            ai_extraction: staffCall.ai_extraction,
            confidence_score: staffCall.confidence_score,
            staff_edited_data: staffCall.staff_edited_data,
            created_at: staffCall.created_at,
            submitted_at: staffCall.submitted_at,
        });
    } catch (error) {
        logger.error('[StaffCall] Get error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// ---------------------------------------------------------
// POST /api/calls/:id/submit - Submit reviewed call to CRM (SSOT)
// ---------------------------------------------------------
router.post('/:id/submit', authenticateAgent, validate(callSubmitSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const agentId = (req as any).agent.id;
        const { edited_data } = req.body; // Staff edits/corrections

        const staffCall = await prisma.staffCall.findUnique({
            where: { id },
            include: { staff_agent: { select: { tenant_id: true } } },
        });

        if (!staffCall) {
            return res.status(404).json({ error: 'Call not found' });
        }

        // Verify ownership
        if (staffCall.staff_agent_id !== agentId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Verify status
        if (staffCall.status !== 'READY_FOR_REVIEW') {
            return res.status(400).json({ error: 'Call is not ready for submission' });
        }

        // Merge edited data with AI extraction
        const finalData = edited_data || staffCall.ai_extraction as any;
        const tenantId = staffCall.staff_agent.tenant_id;

        // SSOT INTEGRATION - Start transaction
        await prisma.$transaction(async (tx) => {
            // 1. Update/Create Contact
            const contact = await tx.contact.upsert({
                where: { phone_number: staffCall.phone_number },
                update: {
                    // Update contact_type if detected from call
                    contact_type: finalData.role || undefined,
                    // Update qualification data from AI extraction
                    intent: finalData.intent?.toLowerCase() || undefined,
                    property_type: finalData.propertyType || undefined,
                    budget_min: finalData.budgetMin || undefined,
                    budget_max: finalData.budgetMax || undefined,
                    preferred_location: finalData.location || undefined,
                    // Update AI summary
                    ai_summary: finalData.summary || undefined,
                    // Update tracking
                    last_channel: 'staff_call',
                    last_interaction: new Date(),
                },
                create: {
                    phone_number: staffCall.phone_number,
                    tenant_id: tenantId,
                    source: 'staff_call',
                    contact_type: finalData.role || 'UNKNOWN',
                    intent: finalData.intent?.toLowerCase() || undefined,
                    property_type: finalData.propertyType || undefined,
                    budget_min: finalData.budgetMin || undefined,
                    budget_max: finalData.budgetMax || undefined,
                    preferred_location: finalData.location || undefined,
                    ai_summary: finalData.summary || undefined,
                    last_channel: 'staff_call',
                    last_interaction: new Date(),
                },
            });

            // 2. Create VoiceCall record
            await tx.voiceCall.create({
                data: {
                    tenant_id: tenantId,
                    phone_number: staffCall.phone_number,
                    direction: staffCall.classification === 'INBOUND' ? 'inbound' : 'outbound',
                    call_status: 'answered',
                    duration: staffCall.duration || 0,
                    recording_url: staffCall.recording_url || undefined,
                    transcript: staffCall.transcript || undefined,
                    ai_call_summary: finalData.summary || undefined,
                    started_at: staffCall.created_at,
                    ended_at: new Date(staffCall.created_at.getTime() + (staffCall.duration || 0) * 1000),
                },
            });

            // 3. Create Interaction record
            await tx.interaction.create({
                data: {
                    tenant_id: tenantId,
                    phone_number: staffCall.phone_number,
                    channel: 'staff_call',
                    direction: staffCall.classification === 'INBOUND' ? 'inbound' : 'outbound',
                    event_type: 'call',
                    content: `Staff call: ${finalData.summary || 'Call recorded'}`,
                    metadata: {
                        call_id: staffCall.id,
                        duration: staffCall.duration,
                        confidence: staffCall.confidence_score,
                        extracted_data: finalData,
                    },
                },
            });

            // 4. Update/Create LeadScore
            // Give +10 points for calls > 30 seconds (meaningful conversation)
            if (staffCall.duration && staffCall.duration > 30) {
                const existingScore = await tx.leadScore.findUnique({
                    where: { phone_number: staffCall.phone_number },
                });

                if (existingScore) {
                    await tx.leadScore.update({
                        where: { phone_number: staffCall.phone_number },
                        data: {
                            engagement: { increment: 10 },
                            score: { increment: 10 },
                        },
                    });
                } else {
                    await tx.leadScore.create({
                        data: {
                            tenant_id: tenantId,
                            phone_number: staffCall.phone_number,
                            engagement: 10,
                            score: 10,
                            last_calculated: new Date(),
                        },
                    });
                }
            }

            // 5. Update StaffCall record with approval
            await tx.staffCall.update({
                where: { id },
                data: {
                    staff_edited_data: finalData,
                    status: 'APPROVED',
                    submitted_at: new Date(),
                },
            });
        });

        logger.info(`[StaffCall] SSOT integration complete: ${id}`);

        res.json({
            success: true,
            message: 'Call submitted to CRM successfully. Contact, VoiceCall, Interaction, and LeadScore updated.',
        });
    } catch (error) {
        logger.error('[StaffCall] Submit error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// ---------------------------------------------------------
// POST /api/calls/:id/reject - Reject and discard call
// ---------------------------------------------------------
router.post('/:id/reject', authenticateAgent, async (req, res) => {
    try {
        const { id } = req.params;
        const agentId = (req as any).agent.id;

        const staffCall = await prisma.staffCall.findUnique({
            where: { id },
        });

        if (!staffCall) {
            return res.status(404).json({ error: 'Call not found' });
        }

        // Verify ownership
        if (staffCall.staff_agent_id !== agentId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Delete recording from cloud storage
        if (staffCall.recording_url) {
            try {
                const publicId = staffCall.recording_url.split('/').slice(-2).join('/').split('.')[0];
                await audioStorage.deleteAudioFile(publicId);
            } catch (err) {
                logger.warn('Failed to delete audio file:', err);
            }
        }

        // Mark as rejected
        await prisma.staffCall.update({
            where: { id },
            data: {
                status: 'REJECTED',
                recording_url: null, // Clear URL after deletion
            },
        });

        res.json({
            success: true,
            message: 'Call rejected and recording deleted',
        });
    } catch (error) {
        logger.error('[StaffCall] Reject error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// ---------------------------------------------------------
// GET /api/calls/history - Get staff call history
// ---------------------------------------------------------
router.get('/', authenticateAgent, async (req, res) => {
    try {
        const agentId = (req as any).agent.id;
        const { page = '1', limit = '20', status, phone_number } = req.query;

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const skip = (pageNum - 1) * limitNum;

        // Build filters
        const where: any = { staff_agent_id: agentId };
        if (status) where.status = status;
        if (phone_number) where.phone_number = phone_number;

        // Get calls with pagination
        const [calls, total] = await Promise.all([
            prisma.staffCall.findMany({
                where,
                include: {
                    contact: {
                        select: {
                            name: true,
                            phone_number: true,
                            contact_type: true,
                        },
                    },
                },
                orderBy: { created_at: 'desc' },
                skip,
                take: limitNum,
            }),
            prisma.staffCall.count({ where }),
        ]);

        res.json({
            calls: calls.map((call) => ({
                id: call.id,
                phone_number: call.phone_number,
                contact: call.contact,
                status: call.status,
                duration: call.duration,
                confidence_score: call.confidence_score,
                created_at: call.created_at,
                submitted_at: call.submitted_at,
            })),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        logger.error('[StaffCall] History error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// ---------------------------------------------------------
// GET /api/calls/stats - Get call statistics
// ---------------------------------------------------------
router.get('/stats/overview', authenticateAgent, async (req, res) => {
    try {
        const agentId = (req as any).agent.id;

        // Get counts by status
        const stats = await prisma.staffCall.groupBy({
            by: ['status'],
            where: { staff_agent_id: agentId },
            _count: true,
        });

        // Get total call duration
        const totalDuration = await prisma.staffCall.aggregate({
            where: {
                staff_agent_id: agentId,
                status: 'APPROVED',
            },
            _sum: { duration: true },
        });

        // Get today's calls
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayCalls = await prisma.staffCall.count({
            where: {
                staff_agent_id: agentId,
                created_at: { gte: today },
            },
        });

        // Format response
        const statusCounts = stats.reduce(
            (acc, s) => {
                acc[s.status.toLowerCase()] = s._count;
                return acc;
            },
            {} as Record<string, number>
        );

        res.json({
            total_calls: stats.reduce((sum, s) => sum + s._count, 0),
            by_status: statusCounts,
            total_duration_minutes: Math.round((totalDuration._sum.duration || 0) / 60),
            today_calls: todayCalls,
        });
    } catch (error) {
        logger.error('[StaffCall] Stats error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// ---------------------------------------------------------
// GET /api/calls/voice-log - Get VoiceCall history (Phase 4.1)
// ---------------------------------------------------------
router.get('/voice-log/all', authMiddleware, checkPermission('view_reports'), async (req, res) => {
    try {
        const { status, direction, phone_number, from_date, to_date, limit = '100' } = req.query;

        // Build filters
        const where: any = {};
        if (status) where.call_status = status;
        if (direction) where.direction = direction;
        if (phone_number) where.phone_number = phone_number;

        // Date range filter
        if (from_date || to_date) {
            where.started_at = {};
            if (from_date) where.started_at.gte = new Date(from_date as string);
            if (to_date) where.started_at.lte = new Date(to_date as string);
        }

        const calls = await prisma.voiceCall.findMany({
            where,
            orderBy: { started_at: 'desc' },
            take: parseInt(limit as string),
            include: {
                contact: {
                    select: {
                        name: true,
                    },
                },
            },
        });

        res.json({ calls, total: calls.length });
    } catch (error) {
        logger.error('[VoiceCall] Log error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
