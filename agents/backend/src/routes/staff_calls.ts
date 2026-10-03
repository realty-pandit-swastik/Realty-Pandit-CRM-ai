/**
 * Staff Call Intelligence API Routes
 * Handles call recording uploads, AI processing, and staff review workflow
 * All endpoints require JWT authentication
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Prisma } from '@prisma/client';
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
import { runCallFollowup } from '../services/call_followup';
import { approvedCallFields, callMatchCriteria } from '../services/call_demand';
import { buildContactVisibilityFilter } from '../middleware/contact_visibility';
import { getTeamIds } from '../utils/team_scope';
import { MatchingEngine } from '../services/matching_engine';

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
                tenant_id: req.agent!.tenant_id,
                AND: [buildContactVisibilityFilter(req.agent!.id, req.agent!.role)],
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

        const teamIds = await getTeamIds(req.agent!);
        const dealScope = req.agent!.role === 'super_boss' ? {} : { OR: [{ coordinator_agent_id: { in: teamIds } }, { executive_agent_id: { in: teamIds } }] };
        const [deals, interactions] = await Promise.all([
            prisma.transaction.findMany({
                where: {
                    demand_contact_id: { in: variants },
                    ...dealScope,
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
                    coordinator: { select: { id: true, name: true } },
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
                id: contact.phone_number,
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
        if (staffCall.staff_agent_id !== agentId || staffCall.tenant_id !== req.agent!.tenant_id) {
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
            processing_attempts: staffCall.processing_attempts, processing_error: staffCall.processing_error,
            followup_status: staffCall.followup_status, followup_error: staffCall.followup_error,
            created_at: staffCall.created_at,
            submitted_at: staffCall.submitted_at,
        });
    } catch (error) {
        captureRouteError(error, req, { route: 'staff_calls#3' });
        logger.error('[StaffCall] Get error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

router.post('/:id/match-preview', authenticateAgent, validate(callSubmitSchema), async (req, res) => {
    try {
        const call = await prisma.staffCall.findUnique({ where: { id: String(req.params.id) } });
        if (!call || call.staff_agent_id !== req.agent!.id || call.tenant_id !== req.agent!.tenant_id) return res.sendStatus(404);
        if (call.status !== 'READY_FOR_REVIEW') return res.status(409).json({ error: 'Call is not awaiting review' });
        const data = { ...(call.ai_extraction as any), ...req.body.edited_data };
        const matches = ['BUY', 'RENT'].includes(data.intent) ? await new MatchingEngine().findMatches(await callMatchCriteria(data, call.tenant_id), 10) : [];
        return res.json({ matches: matches.map(m => ({ id: m.id, display_id: m.display_id, location: m.location, score: m.match_score })), draft: await approvedCallFields(data) });
    } catch (error) { captureRouteError(error, req, { route: 'staff_calls#preview' }); return res.status(500).json({ error: 'Could not preview matches' }); }
});

router.post('/:id/retry', authenticateAgent, async (req, res) => {
    const call = await prisma.staffCall.findUnique({ where: { id: String(req.params.id) } });
    if (!call || call.staff_agent_id !== req.agent!.id || call.tenant_id !== req.agent!.tenant_id) return res.sendStatus(404);
    if (call.status === 'APPROVED' && call.followup_status === 'FAILED') {
        await prisma.staffCall.updateMany({ where: { id: call.id, followup_status: 'FAILED' }, data: { followup_status: 'PENDING', followup_attempts: 0 } });
    } else if (call.status === 'PROCESSING' && call.processing_attempts >= 3) {
        await prisma.staffCall.updateMany({ where: { id: call.id, status: 'PROCESSING', processing_claim_token: null }, data: { processing_attempts: 0, processing_error: null } });
    } else return res.status(409).json({ error: 'Call has no exhausted retryable work' });
    return res.json({ success: true });
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
        if (staffCall.staff_agent_id !== agentId || staffCall.tenant_id !== req.agent!.tenant_id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        // Verify status
        if (staffCall.status === 'APPROVED') return res.json({ success: true, already_approved: true, followup: staffCall.followup_result, followup_status: staffCall.followup_status });
        if (staffCall.status !== 'READY_FOR_REVIEW') {
            return res.status(400).json({ error: 'Call is not ready for submission' });
        }

        // Merge edited data with AI extraction
        const finalData = { ...(staffCall.ai_extraction as any), ...edited_data };
        const tenantId = staffCall.tenant_id;
        const contactFields = await approvedCallFields(finalData);

        // SSOT INTEGRATION - Start transaction
        const approved = await prisma.$transaction(async (tx) => {
            const claimed = await tx.staffCall.updateMany({ where: { id, tenant_id: tenantId, staff_agent_id: agentId, status: 'READY_FOR_REVIEW' }, data: { status: 'APPROVED', submitted_at: new Date(), auto_share: req.body.auto_share === true, followup_status: 'PENDING', staff_edited_data: { ...(staffCall.staff_edited_data as any), final_data: finalData, review_status: 'VERIFIED', reviewed_by: agentId } } });
            if (!claimed.count) return false;
            const existingContact = await tx.contact.findUnique({ where: { phone_number: staffCall.phone_number } });
            if (existingContact && existingContact.tenant_id !== tenantId) throw new Error('Contact unavailable');
            // 1. Update/Create Contact
            const contact = await tx.contact.upsert({
                where: { phone_number: staffCall.phone_number },
                update: {
                    // Update contact_type if detected from call
                    ...contactFields,
                    // Update tracking
                    last_channel: 'staff_call',
                    last_interaction: new Date(),
                },
                create: {
                    phone_number: staffCall.phone_number,
                    tenant_id: tenantId,
                    source: 'staff_call',
                    ...contactFields,
                    contact_type: (contactFields.contact_type || 'UNKNOWN') as any,
                    last_channel: 'staff_call',
                    last_interaction: new Date(),
                },
            });

            // Update only this contact's active call-sourced enquiry; portal enquiries stay separate.
            if (['BUY', 'RENT'].includes(finalData.intent)) await tx.transaction.updateMany({ where: {
                tenant_id: tenantId, demand_contact_id: staffCall.phone_number, source: 'staff_call',
                status: { in: ['NEW', 'QUALIFIED', 'VISIT_SCHEDULED', 'VISITED', 'NEGOTIATION'] },
                type: finalData.intent === 'RENT' ? 'RENT' : 'SALE',
            }, data: {
                demand_intent: contactFields.intent, demand_location: contactFields.preferred_location,
                demand_budget_min: contactFields.budget_min, demand_budget_max: contactFields.budget_max,
                demand_taxonomy_node_id: contactFields.demand_taxonomy_node_id,
                demand_schema_values: contactFields.demand_schema_values,
                demand_area_min: contactFields.area_min, demand_area_max: contactFields.area_max,
                demand_budget_type: contactFields.demand_budget_type,
            } });

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
                            engagement_score: { increment: 10 },
                            total_score: { increment: 10 },
                        },
                    });
                } else {
                    await tx.leadScore.create({
                        data: {
                            tenant_id: tenantId,
                            phone_number: staffCall.phone_number,
                            engagement_score: 10,
                            total_score: 10,
                        },
                    });
                }
            }

            await tx.task.updateMany({ where: { task_type: 'CALL_REVIEW', stage_metadata: { path: ['call_id'], equals: id } }, data: { status: 'DONE' } });
            return true;
        });
        if (!approved) {
            const current = await prisma.staffCall.findUnique({ where: { id } });
            if (current?.status === 'APPROVED') return res.json({ success: true, already_approved: true, followup: current.followup_result, followup_status: current.followup_status });
            return res.status(409).json({ error: 'Call review changed; reload the call' });
        }

        logger.info(`[StaffCall] SSOT integration complete: ${id}`);

        await closeCallReviewTask(String(id)).catch((err) => logger.warn(`[StaffCall] Could not close review task for ${id}: ${err.message}`));
        const followup = await runCallFollowup(String(id)).catch(error => {
            logger.warn(`[StaffCall] Follow-up remains queued for ${id}: ${(error as Error).message}`);
            return null;
        });

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
        if (staffCall.staff_agent_id !== agentId || staffCall.tenant_id !== req.agent!.tenant_id) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        if (staffCall.status === 'APPROVED') {
            return res.status(409).json({ error: 'Approved call cannot be rejected' });
        }

        // Claim rejection before deleting audio, so a concurrent approval cannot succeed.
        const rejected = await prisma.staffCall.updateMany({ where: { id, staff_agent_id: agentId, tenant_id: req.agent!.tenant_id, status: { in: ['PROCESSING', 'TRANSCRIBED', 'READY_FOR_REVIEW', 'REJECTED'] } }, data: { status: 'REJECTED', ai_extraction: Prisma.DbNull, processing_claim_token: null, processing_claimed_at: null, staff_edited_data: { ...(staffCall.staff_edited_data as any), review_status: 'REJECTED' } } });
        if (!rejected.count) return res.status(409).json({ error: 'Call was approved; reload the call' });
        if (staffCall.recording_url) {
            const publicId = staffCall.recording_url.slice('uploads/staff_calls/'.length);
            await audioStorage.deleteAudioFile(publicId);
        }
        await prisma.staffCall.update({ where: { id }, data: { recording_url: null } });

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
        const where: any = { staff_agent_id: agentId, tenant_id: req.agent!.tenant_id };
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
                processing_attempts: call.processing_attempts, processing_error: call.processing_error,
                followup_status: call.followup_status, followup_error: call.followup_error,
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
            where: { staff_agent_id: agentId, tenant_id: req.agent!.tenant_id },
            _count: true,
        });

        // Get total call duration
        const totalDuration = await prisma.staffCall.aggregate({
            where: {
                staff_agent_id: agentId,
                tenant_id: req.agent!.tenant_id,
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
                tenant_id: req.agent!.tenant_id,
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
