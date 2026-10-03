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
import { captureRouteError } from '../utils/capture';
import { normalizePhone, phoneVariants } from '../utils/phone';
import { closeCallReviewTask, lakhsToRupees, reviewedContactFields } from '../services/staff_call_processing';
import { completeStaffCallUpload } from '../services/staff_call_upload';
import { applyApprovedCall } from '../services/call_followup';

const authenticateAgent = authMiddleware;

const router = Router();

function localRecordingPath(url: string | null): string | null {
    if (!url || !/^uploads\/staff_calls\/[0-9a-f-]{36}\/recording\.(mp3|wav|m4a|3gp|ogg)$/i.test(url)) return null;
    return path.join(process.cwd(), url);
}

router.get('/voice-log/:id/audio', authMiddleware, checkPermission('view_reports'), async (req, res) => {
    const call = await prisma.voiceCall.findUnique({ where: { id: String(req.params.id) } });
    if (!call || call.tenant_id !== req.agent!.tenant_id) return res.sendStatus(404);
    const file = localRecordingPath(call.recording_url);
    if (!file || !fs.existsSync(file)) return res.sendStatus(404);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(file);
});

router.get('/:id/audio', authenticateAgent, async (req, res) => {
    const call = await prisma.staffCall.findUnique({ where: { id: String(req.params.id) } });
    if (!call || call.staff_agent_id !== req.agent!.id || call.tenant_id !== req.agent!.tenant_id) return res.sendStatus(404);
    const file = localRecordingPath(call.recording_url);
    if (!file || !fs.existsSync(file)) return res.sendStatus(404);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(file);
});

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
    const rejectUpload = (status: number, error: string) => {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(status).json({ error });
    };
    try {
        const agentId = (req as any).agent.id; // From JWT middleware
        const { classification, duration } = req.body;
        const phone_number = normalizePhone(String(req.body.phone_number || ''));

        if (!req.file) {
            return rejectUpload(400, 'Audio file is required');
        }

        if (!phone_number || !['INBOUND', 'OUTBOUND', undefined].includes(classification)) {
            return rejectUpload(400, 'Valid phone number and call classification required');
        }

        // Get tenant
        const agent = await prisma.agent.findUnique({
            where: { id: agentId },
            select: { tenant_id: true },
        });

        if (!agent) {
            return rejectUpload(404, 'Agent not found');
        }

        // Find or create contact
        const existing = await prisma.contact.findFirst({ where: { phone_number: { in: phoneVariants(phone_number) } } });
        if (existing && existing.tenant_id !== agent.tenant_id) {
            return rejectUpload(403, 'Contact unavailable');
        }
        const contact = existing || await prisma.contact.create({
            data: {
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
                phone_number: contact.phone_number,
                classification: classification || 'OUTBOUND',
                call_type: 'BUSINESS',
                duration: duration ? parseInt(duration) : null,
                status: 'UPLOADING',
            },
        });

        await completeStaffCallUpload(staffCall.id, req.file);
        logger.info(`[StaffCall] Upload complete: ${staffCall.id}`);

        res.status(201).json({
            success: true,
            call_id: staffCall.id,
            message: 'Call recording uploaded successfully. Processing will begin shortly.',
        });
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        captureRouteError(error, req, { route: 'staff_calls#2' });
        logger.error('[StaffCall] Upload error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// ---------------------------------------------------------
// GET /api/calls/caller-id - Real-time caller dossier lookup
// ---------------------------------------------------------
router.get('/caller-id', authenticateAgent, async (req, res) => {
    try {
        const rawPhone = String(req.query.phone || '');
        const phone = normalizePhone(rawPhone);
        if (!phone) {
            return res.status(400).json({ error: 'Valid phone parameter required' });
        }

        const variants = phoneVariants(phone);
        const contact = await prisma.contact.findFirst({
            where: {
                phone_number: { in: variants },
                tenant_id: (req as any).agent.tenant_id,
            },
            include: {
                assigned_agent: {
                    select: { id: true, name: true, phone: true, role: true },
                },
            },
        });

        if (!contact) {
            return res.json({
                found: false,
                phone_number: phone,
                message: 'No existing CRM record found for this number',
            });
        }

        const [deals, interactions] = await Promise.all([
            prisma.transaction.findMany({
                where: {
                    demand_contact_id: { in: variants },
                    tenant_id: (req as any).agent.tenant_id,
                },
                select: {
                    id: true,
                    status: true,
                    source: true,
                    source_ref: true,
                    type: true,
                    demand_intent: true,
                    demand_location: true,
                    demand_budget_min: true,
                    demand_budget_max: true,
                    coordinator_agent: { select: { id: true, name: true } },
                    created_at: true,
                },
                orderBy: { created_at: 'desc' },
                take: 10,
            }),
            prisma.interaction.findMany({
                where: {
                    phone_number: { in: variants },
                    tenant_id: (req as any).agent.tenant_id,
                },
                select: {
                    id: true,
                    event_type: true,
                    direction: true,
                    channel: true,
                    content: true,
                    created_at: true,
                },
                orderBy: { created_at: 'desc' },
                take: 5,
            }),
        ]);

        const dealIds = deals.map(d => d.id);
        const shortages = dealIds.length > 0 ? await prisma.shortageEntry.findMany({
            where: { deal_id: { in: dealIds }, status: 'OPEN' },
            select: { id: true, deal_id: true, area: true, match_count: true, status: true },
        }) : [];

        res.json({
            found: true,
            contact: {
                id: contact.id,
                phone_number: contact.phone_number,
                name: contact.name,
                contact_type: contact.contact_type,
                intent: contact.intent,
                property_type: contact.property_type,
                budget_min: contact.budget_min,
                budget_max: contact.budget_max,
                preferred_location: contact.preferred_location,
                ai_summary: contact.ai_summary,
                assigned_agent: contact.assigned_agent,
                last_channel: contact.last_channel,
                last_interaction: contact.last_interaction,
            },
            deals,
            interactions,
            shortages,
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'staff_calls#caller_id' });
        logger.error('[StaffCall] Caller ID lookup error:', error);
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

        const playbackUrl = staffCall.recording_url ? `/api/calls/${id}/audio` : null;

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
        captureRouteError(error, req, { route: 'staff_calls#3' });
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
        const finalData = { ...(staffCall.ai_extraction as any), ...edited_data };
        const tenantId = staffCall.staff_agent.tenant_id;

        // SSOT INTEGRATION - Start transaction
        await prisma.$transaction(async (tx) => {
            // 1. Update/Create Contact
            const contact = await tx.contact.upsert({
                where: { phone_number: staffCall.phone_number },
                update: {
                    // Update contact_type if detected from call
                    ...reviewedContactFields(finalData),
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
                    budget_min: lakhsToRupees(finalData.budgetMin) || undefined,
                    budget_max: lakhsToRupees(finalData.budgetMax) || undefined,
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
                        source: 'staff_review',
                        review_status: 'VERIFIED',
                        reviewed_by: agentId,
                        prior_values: (staffCall.staff_edited_data as any)?.prior_values || {},
                        auto_saved_fields: (staffCall.staff_edited_data as any)?.auto_saved_fields || {},
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
                    staff_edited_data: { ...(staffCall.staff_edited_data as any), final_data: finalData, review_status: 'VERIFIED', reviewed_by: agentId },
                    status: 'APPROVED',
                    submitted_at: new Date(),
                },
            });
        });

        logger.info(`[StaffCall] SSOT integration complete: ${id}`);

        await closeCallReviewTask(String(id)).catch((err) => logger.warn(`[StaffCall] Could not close review task for ${id}: ${err.message}`));
        const followup = await applyApprovedCall(
            { id: String(id), phone_number: staffCall.phone_number }, finalData, agentId, req.body.auto_share === true,
        );

        res.json({
            success: true,
            message: 'Call submitted to CRM successfully. Contact, VoiceCall, Interaction, and LeadScore updated.',
            followup,
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'staff_calls#4' });
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
        if (staffCall.status === 'APPROVED') {
            return res.status(409).json({ error: 'Approved call cannot be rejected' });
        }

        // Delete the local recording before clearing its database reference.
        if (staffCall.recording_url) {
            try {
                const publicId = staffCall.recording_url.slice('uploads/staff_calls/'.length);
                await audioStorage.deleteAudioFile(publicId);
            } catch (err) {
                logger.error('Failed to delete audio file:', err);
                return res.status(500).json({ error: 'Recording deletion failed' });
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

        await closeCallReviewTask(String(id)).catch((err) => logger.warn(`[StaffCall] Could not close review task for ${id}: ${err.message}`));

        res.json({
            success: true,
            message: 'Call rejected and recording deleted',
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'staff_calls#5' });
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
        captureRouteError(error, req, { route: 'staff_calls#6' });
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
        captureRouteError(error, req, { route: 'staff_calls#7' });
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
        const where: any = { tenant_id: req.agent!.tenant_id };
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

        res.json({ calls: calls.map(call => ({
            ...call,
            recording_url: call.recording_url?.includes('uploads/staff_calls/')
                ? (localRecordingPath(call.recording_url) ? `/api/calls/voice-log/${call.id}/audio` : null)
                : call.recording_url,
        })), total: calls.length });
    } catch (error) {
        captureRouteError(error, req, { route: 'staff_calls#8' });
        logger.error('[VoiceCall] Log error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
