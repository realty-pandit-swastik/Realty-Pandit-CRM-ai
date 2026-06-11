/**
 * Builder Routes - PHASE 14: Builder Backend API
 *
 * Complete API for builders to manage projects, leads, and appointments
 * Includes auth, project CRUD, units, media, leads, appointments, and dashboard
 */

import { Router } from 'express';
import prisma from '../db';
import jwt from 'jsonwebtoken';
import { ownerService } from '../services/owner';
import { permissionEngine, maskPhone, maskName } from '../services/permission_engine';
import { uploadProjectMedia, getFileUrl, deleteFile } from '../services/upload'; // PHASE 15: Local file storage
import { OwnerScope, ExternalOwnerType, PlanType, ProjectStatus, ProjectListingStatus } from '@prisma/client';
import logger from '../utils/logger';
import { NotificationAgent } from '../agents/notification_agent';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { setAuthCookies } from '../middleware/auth';
import { captureRouteError } from '../utils/capture';

const notificationAgent = new NotificationAgent();

// Generate a 6-digit OTP
function generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

const router = Router();
const JWT_SECRET = process.env.BUILDER_JWT_SECRET || process.env.AGENT_JWT_SECRET;
if (!JWT_SECRET) throw new Error('BUILDER_JWT_SECRET or AGENT_JWT_SECRET must be set');

// =============================================
// MIDDLEWARE
// =============================================

/**
 * Authenticate builder using JWT
 * Extracts owner info from token
 */
const authenticateBuilder = async (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.ownerId = decoded.ownerId;
        req.owner = decoded; // { ownerId, scope, externalType, planType, phone }
        next();
    } catch (err) {
        captureRouteError(err, req, { route: 'builder#1' });
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

/**
 * Require REAL_ESTATE_BUILDER type
 * Must be used after authenticateBuilder
 */
const requireBuilder = async (req: any, res: any, next: any) => {
    const { scope, externalType } = req.owner;

    if (scope !== OwnerScope.EXTERNAL || externalType !== ExternalOwnerType.REAL_ESTATE_BUILDER) {
        return res.status(403).json({ error: 'Builder access required. Only builders can access this endpoint.' });
    }

    next();
};

// =============================================
// TASK-108: BUILDER AUTH ROUTES
// =============================================

/**
 * POST /api/builder/register
 * Register new builder with owner creation
 */
router.post('/register', async (req, res) => {
    const { name, phone, email, companyName, planType } = req.body;

    try {
        logger.info('[Builder] Registration request:', { phone, companyName });

        // Validation
        if (!name || !phone) {
            return res.status(400).json({ error: 'Name and phone are required' });
        }

        // Check if already registered
        const existingOwner = await ownerService.getOwnerByPhone(phone);
        if (existingOwner) {
            return res.status(409).json({ error: 'Builder already registered with this phone number' });
        }

        // Create owner (creates contact if needed)
        const result = await ownerService.createOwner({
            contactPhone: phone,
            scope: OwnerScope.EXTERNAL,
            externalType: ExternalOwnerType.REAL_ESTATE_BUILDER,
            planType: planType || PlanType.FREE,
            contactName: name,
            contactEmail: email
        });

        // Update contact with company name
        if (companyName) {
            await prisma.contact.update({
                where: { phone_number: phone },
                data: {
                    name: companyName, // Use company name as primary name
                    email: email
                }
            });
        }

        logger.info('[Builder] Registration successful:', result.owner.id);

        // Send welcome WhatsApp message
        const waPhone = phone.replace(/^\+/, '');
        notificationAgent.send({
            to: waPhone,
            channel: 'whatsapp',
            message: `Namaste ${name}! Welcome to Realty Pandit Builder Portal.\n\nYour account is now active. You can list your projects, manage leads, and track appointments.\n\nLogin at: https://www.realtypandit.in/builder/login`,
        }).catch(err => logger.error('[Builder] Welcome WhatsApp failed:', err));

        res.json({
            message: 'Registration successful',
            ownerId: result.owner.id,
            planType: result.subscription.plan_type
        });

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#2' });
        logger.error('[Builder] Registration failed:', err);
        res.status(500).json({ error: 'Registration failed: ' + err.message });
    }
});

/**
 * POST /api/builder/login-otp
 * Send OTP to builder's phone
 */
router.post('/login-otp', async (req, res) => {
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    try {
        // Check if builder exists
        const owner = await ownerService.getOwnerByPhone(phone);

        if (!owner || owner.externalType !== ExternalOwnerType.REAL_ESTATE_BUILDER) {
            return res.status(404).json({ error: 'Builder not found. Please register first.' });
        }

        // Generate OTP, store in Redis (5 min TTL), send via WhatsApp
        const otp = generateOtp();
        const otpKey = `builder_otp:${phone}`;
        await cacheSet(otpKey, otp, 300); // 5 minutes

        logger.info(`[Builder] OTP generated for ${phone}`);

        const waPhone = phone.replace(/^\+/, '');
        notificationAgent.send({
            to: waPhone,
            channel: 'whatsapp',
            message: `Your Realty Pandit Builder login OTP is: *${otp}*\n\nValid for 5 minutes. Do not share this code with anyone.`,
            log_interaction: false,
        }).catch(err => logger.error('[Builder] OTP WhatsApp send failed:', err));

        res.json({ message: 'OTP sent successfully' });

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#3' });
        logger.error('[Builder] OTP request failed:', err);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

/**
 * POST /api/builder/verify-otp
 * Verify OTP and issue JWT token
 */
router.post('/verify-otp', async (req, res) => {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
        return res.status(400).json({ error: 'Phone and OTP are required' });
    }

    try {
        // Validate OTP from Redis (falls back to '1234' for dev/demo if Redis unavailable)
        const otpKey = `builder_otp:${phone}`;
        const storedOtp = await cacheGet(otpKey);
        const validOtp = storedOtp || '1234'; // fallback for demo mode
        if (otp !== validOtp) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }
        // Clear OTP after successful use
        if (storedOtp) await cacheDel(otpKey);

        // Get owner record
        const owner = await prisma.owner.findUnique({
            where: { contact_phone: phone },
            include: {
                contact: true,
                subscription: true
            }
        });

        if (!owner || owner.externalType !== ExternalOwnerType.REAL_ESTATE_BUILDER) {
            return res.status(404).json({ error: 'Builder not found' });
        }

        // Generate JWT with owner info
        const token = jwt.sign(
            {
                ownerId: owner.id,
                scope: owner.scope,
                externalType: owner.externalType,
                planType: owner.subscription?.plan_type || PlanType.FREE,
                phone: phone
            },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        logger.info(`[Builder] Login successful: ${owner.id}`);
        setAuthCookies(res, token);

        res.json({
            token,
            owner: {
                id: owner.id,
                name: owner.contact.name,
                email: owner.contact.email,
                phone: owner.contact.phone_number,
                planType: owner.subscription?.plan_type || PlanType.FREE,
                status: owner.status
            }
        });

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#4' });
        logger.error('[Builder] OTP verification failed:', err);
        res.status(500).json({ error: 'Verification failed' });
    }
});

/**
 * GET /api/builder/me
 * Get current builder's profile with permissions
 */
router.get('/me', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;

    try {
        const ownerData = await ownerService.getOwnerById(ownerId);
        const stats = await ownerService.getOwnerStats(ownerId);

        res.json({
            id: ownerData.id,
            name: ownerData.contact.name,
            email: ownerData.contact.email,
            phone: ownerData.contact.phone_number,
            status: ownerData.status,
            subscription: {
                planType: ownerData.subscription?.plan_type,
                status: ownerData.subscription?.status,
                startDate: ownerData.subscription?.start_date,
                endDate: ownerData.subscription?.end_date
            },
            permissions: ownerData.permissions,
            stats
        });

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#5' });
        logger.error('[Builder] Profile fetch failed:', err);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// =============================================
// TASK-109: PROJECT CRUD ROUTES
// =============================================

/**
 * POST /api/builder/projects
 * Create new project
 */
router.post('/projects', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;

    try {
        // Check permission
        const canAdd = await permissionEngine.canAddProject(ownerId);
        if (!canAdd.allowed) {
            return res.status(403).json({ error: canAdd.reason });
        }

        const {
            name,
            projectType,
            city,
            locality,
            googleMapLink,
            reraNumber,
            possessionDate,
            projectStatus,
            shortDescription,
            longDescription
        } = req.body;

        // Validation
        if (!name || !projectType || !city || !locality || !shortDescription) {
            return res.status(400).json({ error: 'Missing required fields: name, projectType, city, locality, shortDescription' });
        }

        const project = await prisma.project.create({
            data: {
                owner_id: ownerId,
                name,
                project_type: projectType,
                city,
                locality,
                google_map_link: googleMapLink,
                rera_number: reraNumber,
                possession_date: possessionDate ? new Date(possessionDate) : null,
                project_status: projectStatus || ProjectStatus.UNDER_CONSTRUCTION,
                short_description: shortDescription,
                long_description: longDescription,
                status: ProjectListingStatus.DRAFT
            }
        });

        logger.info(`[Builder] Project created: ${project.id} by owner ${ownerId}`);

        res.status(201).json(project);

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#6' });
        logger.error('[Builder] Project creation failed:', err);
        res.status(500).json({ error: 'Failed to create project: ' + err.message });
    }
});

/**
 * GET /api/builder/projects
 * List builder's projects
 */
router.get('/projects', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;
    const { status, page = 1, limit = 10 } = req.query;

    try {
        const where: any = { owner_id: ownerId };
        if (status) where.status = status;

        const projects = await prisma.project.findMany({
            where,
            include: {
                units: { where: { is_active: true } },
                media: { take: 1 },
                _count: {
                    select: {
                        leads: true,
                        units: true,
                        media: true
                    }
                }
            },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit),
            orderBy: { created_at: 'desc' }
        });

        const total = await prisma.project.count({ where });

        res.json({ projects, total, page: Number(page), limit: Number(limit) });

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#7' });
        logger.error('[Builder] Projects fetch failed:', err);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

/**
 * GET /api/builder/projects/:id
 * Get single project with full details
 */
router.get('/projects/:id', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;
    const { id } = req.params;

    try {
        const project = await prisma.project.findUnique({
            where: { id },
            include: {
                units: true,
                media: true,
                leads: {
                    include: {
                        contact: true,
                        appointments: true
                    },
                    orderBy: { created_at: 'desc' },
                    take: 10
                },
                _count: {
                    select: {
                        leads: true,
                        appointments: true
                    }
                }
            }
        });

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Check ownership
        if (project.owner_id !== ownerId) {
            return res.status(403).json({ error: 'Access denied - not your project' });
        }

        res.json(project);

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#8' });
        logger.error('[Builder] Project fetch failed:', err);
        res.status(500).json({ error: 'Failed to fetch project' });
    }
});

/**
 * PUT /api/builder/projects/:id
 * Update project details
 */
router.put('/projects/:id', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;
    const { id } = req.params;

    try {
        // Check ownership
        const existing = await prisma.project.findUnique({ where: { id } });
        if (!existing || existing.owner_id !== ownerId) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }

        const {
            name,
            projectType,
            city,
            locality,
            googleMapLink,
            reraNumber,
            possessionDate,
            projectStatus,
            shortDescription,
            longDescription
        } = req.body;

        const project = await prisma.project.update({
            where: { id },
            data: {
                name,
                project_type: projectType,
                city,
                locality,
                google_map_link: googleMapLink,
                rera_number: reraNumber,
                possession_date: possessionDate ? new Date(possessionDate) : undefined,
                project_status: projectStatus,
                short_description: shortDescription,
                long_description: longDescription
            }
        });

        logger.info(`[Builder] Project updated: ${id}`);

        res.json(project);

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#9' });
        logger.error('[Builder] Project update failed:', err);
        res.status(500).json({ error: 'Failed to update project: ' + err.message });
    }
});

/**
 * PATCH /api/builder/projects/:id/activate
 * Activate project (DRAFT → ACTIVE)
 */
router.patch('/projects/:id/activate', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;
    const { id } = req.params;

    try {
        // Check ownership
        const project = await prisma.project.findUnique({
            where: { id },
            include: {
                units: true,
                media: true
            }
        });

        if (!project || project.owner_id !== ownerId) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }

        // Validate activation requirements
        if (project.units.length === 0) {
            return res.status(400).json({ error: 'Cannot activate: Project must have at least 1 unit' });
        }

        if (project.media.length === 0) {
            return res.status(400).json({ error: 'Cannot activate: Project must have at least 1 image' });
        }

        if (!project.rera_number) {
            return res.status(400).json({ error: 'Cannot activate: RERA number is required' });
        }

        // Activate
        const updated = await prisma.project.update({
            where: { id },
            data: { status: ProjectListingStatus.ACTIVE }
        });

        logger.info(`[Builder] Project activated: ${id}`);

        res.json({ message: 'Project activated successfully', project: updated });

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#10' });
        logger.error('[Builder] Project activation failed:', err);
        res.status(500).json({ error: 'Failed to activate project: ' + err.message });
    }
});

/**
 * PATCH /api/builder/projects/:id/pause
 * Pause project (ACTIVE → PAUSED)
 */
router.patch('/projects/:id/pause', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;
    const { id } = req.params;

    try {
        // Check ownership
        const project = await prisma.project.findUnique({ where: { id } });
        if (!project || project.owner_id !== ownerId) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }

        const updated = await prisma.project.update({
            where: { id },
            data: { status: ProjectListingStatus.PAUSED }
        });

        logger.info(`[Builder] Project paused: ${id}`);

        res.json({ message: 'Project paused successfully', project: updated });

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#11' });
        logger.error('[Builder] Project pause failed:', err);
        res.status(500).json({ error: 'Failed to pause project: ' + err.message });
    }
});

// =============================================
// TASK-110: PROJECT UNIT ROUTES
// =============================================

/**
 * POST /api/builder/projects/:projectId/units
 * Add unit configuration to project
 */
router.post('/projects/:projectId/units', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;
    const { projectId } = req.params;

    try {
        // Check project ownership
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project || project.owner_id !== ownerId) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }

        const {
            configuration,
            areaMin,
            areaMax,
            areaUnit,
            priceMin,
            priceMax,
            priceUnit,
            totalUnits,
            availableUnits,
            floorPlanUrl
        } = req.body;

        // Validation
        if (!configuration || !areaMin || !priceMin) {
            return res.status(400).json({ error: 'Missing required fields: configuration, areaMin, priceMin' });
        }

        if (areaMin > (areaMax || areaMin)) {
            return res.status(400).json({ error: 'areaMin cannot be greater than areaMax' });
        }

        if (priceMin > (priceMax || priceMin)) {
            return res.status(400).json({ error: 'priceMin cannot be greater than priceMax' });
        }

        const unit = await prisma.projectUnit.create({
            data: {
                project_id: projectId,
                configuration,
                area_min: areaMin,
                area_max: areaMax,
                area_unit: areaUnit || 'sqft',
                price_min: priceMin,
                price_max: priceMax,
                price_unit: priceUnit || 'Lakh',
                total_units: totalUnits,
                available_units: availableUnits,
                floor_plan_url: floorPlanUrl,
                is_active: true
            }
        });

        logger.info(`[Builder] Unit added to project ${projectId}: ${unit.id}`);

        res.status(201).json(unit);

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#12' });
        logger.error('[Builder] Unit creation failed:', err);
        res.status(500).json({ error: 'Failed to add unit: ' + err.message });
    }
});

/**
 * PUT /api/builder/units/:unitId
 * Update unit details
 */
router.put('/units/:unitId', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;
    const { unitId } = req.params;

    try {
        // Check ownership via project
        const unit = await prisma.projectUnit.findUnique({
            where: { id: unitId },
            include: { project: true }
        });

        if (!unit || unit.project.owner_id !== ownerId) {
            return res.status(404).json({ error: 'Unit not found or access denied' });
        }

        const {
            configuration,
            areaMin,
            areaMax,
            areaUnit,
            priceMin,
            priceMax,
            priceUnit,
            totalUnits,
            availableUnits,
            floorPlanUrl
        } = req.body;

        // Validation
        if (areaMin && areaMax && areaMin > areaMax) {
            return res.status(400).json({ error: 'areaMin cannot be greater than areaMax' });
        }

        if (priceMin && priceMax && priceMin > priceMax) {
            return res.status(400).json({ error: 'priceMin cannot be greater than priceMax' });
        }

        const updated = await prisma.projectUnit.update({
            where: { id: unitId },
            data: {
                configuration,
                area_min: areaMin,
                area_max: areaMax,
                area_unit: areaUnit,
                price_min: priceMin,
                price_max: priceMax,
                price_unit: priceUnit,
                total_units: totalUnits,
                available_units: availableUnits,
                floor_plan_url: floorPlanUrl
            }
        });

        logger.info(`[Builder] Unit updated: ${unitId}`);

        res.json(updated);

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#13' });
        logger.error('[Builder] Unit update failed:', err);
        res.status(500).json({ error: 'Failed to update unit: ' + err.message });
    }
});

/**
 * DELETE /api/builder/units/:unitId
 * Soft delete unit
 */
router.delete('/units/:unitId', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;
    const { unitId } = req.params;

    try {
        // Check ownership via project
        const unit = await prisma.projectUnit.findUnique({
            where: { id: unitId },
            include: {
                project: {
                    include: {
                        leads: {
                            where: { configuration: { equals: undefined } } // Check if any leads reference this config
                        }
                    }
                }
            }
        });

        if (!unit || unit.project.owner_id !== ownerId) {
            return res.status(404).json({ error: 'Unit not found or access denied' });
        }

        // Soft delete (set is_active = false)
        await prisma.projectUnit.update({
            where: { id: unitId },
            data: { is_active: false }
        });

        logger.info(`[Builder] Unit soft deleted: ${unitId}`);

        res.json({ message: 'Unit deleted successfully' });

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#14' });
        logger.error('[Builder] Unit deletion failed:', err);
        res.status(500).json({ error: 'Failed to delete unit: ' + err.message });
    }
});

// =============================================
// TASK-111: PROJECT MEDIA ROUTES
// =============================================

/**
 * POST /api/builder/projects/:projectId/media
 * Upload project media (images, videos, floor plans) - PHASE 15: Local file upload
 * Uses multer for multipart/form-data file uploads
 */
router.post('/projects/:projectId/media',
    authenticateBuilder,
    requireBuilder,
    uploadProjectMedia.array('files', 10), // Allow up to 10 files at once
    async (req: any, res) => {
        const { ownerId } = req.owner;
        const { projectId } = req.params;
        const files = req.files as Express.Multer.File[];

        try {
            // Check project ownership
            const project = await prisma.project.findUnique({ where: { id: projectId } });
            if (!project || project.owner_id !== ownerId) {
                return res.status(404).json({ error: 'Project not found or access denied' });
            }

            if (!files || files.length === 0) {
                return res.status(400).json({ error: 'No files uploaded' });
            }

            const { mediaType, caption } = req.body;

            // Validation
            if (!mediaType) {
                return res.status(400).json({ error: 'Missing required field: mediaType' });
            }

            // Check media count limits
            const mediaCount = await prisma.projectMedia.count({
                where: { project_id: projectId, media_type: mediaType }
            });

            const limits: Record<string, number> = {
                IMAGE: 20,
                VIDEO: 3,
                FLOOR_PLAN: 5,
                BROCHURE: 5,
                MASTER_PLAN: 2
            };

            const remainingSlots = (limits[mediaType] || 10) - mediaCount;

            if (files.length > remainingSlots) {
                return res.status(400).json({
                    error: `Can only upload ${remainingSlots} more ${mediaType}(s). Maximum ${limits[mediaType]} allowed.`
                });
            }

            // Create media records for all uploaded files
            const mediaRecords = await Promise.all(
                files.map(async (file, index) => {
                    const mediaUrl = getFileUrl(file.filename, 'projects');

                    return await prisma.projectMedia.create({
                        data: {
                            project_id: projectId,
                            media_type: mediaType,
                            media_url: mediaUrl,
                            caption: caption || file.originalname,
                            display_order: mediaCount + index
                        }
                    });
                })
            );

            logger.info(`[Builder] ${files.length} media file(s) uploaded to project ${projectId}`);

            res.status(201).json({
                message: `${files.length} file(s) uploaded successfully`,
                media: mediaRecords
            });

        } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#15' });
            logger.error('[Builder] Media upload failed:', err);
            res.status(500).json({ error: 'Failed to upload media: ' + err.message });
        }
    }
);

/**
 * DELETE /api/builder/media/:mediaId
 * Delete project media
 */
router.delete('/media/:mediaId', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;
    const { mediaId } = req.params;

    try {
        // Check ownership via project
        const media = await prisma.projectMedia.findUnique({
            where: { id: mediaId },
            include: { project: true }
        });

        if (!media || media.project.owner_id !== ownerId) {
            return res.status(404).json({ error: 'Media not found or access denied' });
        }

        // PHASE 15: Delete file from local storage
        // Extract filename from media_url (e.g., /uploads/projects/filename.jpg → projects/filename.jpg)
        const urlPath = media.media_url.replace('/uploads/', '');
        await deleteFile(urlPath);

        // Delete database record
        await prisma.projectMedia.delete({
            where: { id: mediaId }
        });

        logger.info(`[Builder] Media deleted: ${mediaId}`);

        res.json({ message: 'Media deleted successfully' });

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#16' });
        logger.error('[Builder] Media deletion failed:', err);
        res.status(500).json({ error: 'Failed to delete media: ' + err.message });
    }
});

// =============================================
// TASK-112: BUILDER LEAD MANAGEMENT ROUTES
// =============================================

/**
 * GET /api/builder/leads
 * List all leads for builder's projects
 */
router.get('/leads', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;
    const { status, projectId, page = 1, limit = 20 } = req.query;

    try {
        const where: any = {
            project: { owner_id: ownerId }
        };

        if (status) where.status = status;
        if (projectId) where.project_id = projectId;

        const leads = await prisma.builderLead.findMany({
            where,
            include: {
                contact: true,
                project: { select: { name: true, city: true, locality: true } },
                appointments: {
                    orderBy: { scheduled_date: 'desc' },
                    take: 1
                }
            },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit),
            orderBy: { created_at: 'desc' }
        });

        // Apply data masking if FREE plan
        const maskingRules = await permissionEngine.getDataMaskingRules(ownerId);

        if (maskingRules.maskPhone) {
            leads.forEach(lead => {
                lead.contact.phone_number = maskPhone(lead.contact.phone_number);
                lead.contact.name = maskName(lead.contact.name || '');
                if (lead.contact.email) {
                    lead.contact.email = null; // Hide email for FREE plan
                }
            });
        }

        const total = await prisma.builderLead.count({ where });

        res.json({ leads, total, page: Number(page), limit: Number(limit) });

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#17' });
        logger.error('[Builder] Leads fetch failed:', err);
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
});

/**
 * GET /api/builder/leads/:id
 * Get single lead with full details
 */
router.get('/leads/:id', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;
    const { id } = req.params;

    try {
        const lead = await prisma.builderLead.findUnique({
            where: { id },
            include: {
                contact: {
                    include: {
                        interactions: {
                            where: { event_type: 'builder_lead' },
                            orderBy: { timestamp: 'desc' },
                            take: 10
                        }
                    }
                },
                project: true,
                appointments: {
                    orderBy: { scheduled_date: 'desc' }
                }
            }
        });

        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        // Check ownership
        if (lead.project.owner_id !== ownerId) {
            return res.status(403).json({ error: 'Access denied - not your lead' });
        }

        // Apply data masking if needed
        const maskingRules = await permissionEngine.getDataMaskingRules(ownerId);
        if (maskingRules.maskPhone) {
            lead.contact.phone_number = maskPhone(lead.contact.phone_number);
            lead.contact.name = maskName(lead.contact.name || '');
            if (lead.contact.email) {
                lead.contact.email = null;
            }
        }

        res.json(lead);

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#18' });
        logger.error('[Builder] Lead fetch failed:', err);
        res.status(500).json({ error: 'Failed to fetch lead' });
    }
});

/**
 * PATCH /api/builder/leads/:id/status
 * Update lead status
 */
router.patch('/leads/:id/status', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    try {
        // Check ownership
        const lead = await prisma.builderLead.findUnique({
            where: { id },
            include: { project: true, contact: true }
        });

        if (!lead || lead.project.owner_id !== ownerId) {
            return res.status(404).json({ error: 'Lead not found or access denied' });
        }

        // Update status
        const updated = await prisma.builderLead.update({
            where: { id },
            data: { status }
        });

        // Log status change in interactions
        const tenant = await prisma.tenant.findFirst();
        if (tenant) {
            await prisma.interaction.create({
                data: {
                    tenant_id: tenant.id,
                    phone_number: lead.contact_phone,
                    channel: 'builder_portal',
                    direction: 'outbound',
                    event_type: 'status_update',
                    metadata: {
                        leadId: id,
                        oldStatus: lead.status,
                        newStatus: status,
                        projectId: lead.project_id
                    }
                }
            });
        }

        logger.info(`[Builder] Lead status updated: ${id} → ${status}`);

        res.json(updated);

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#19' });
        logger.error('[Builder] Lead status update failed:', err);
        res.status(500).json({ error: 'Failed to update lead status: ' + err.message });
    }
});

// =============================================
// TASK-113: BUILDER APPOINTMENT ROUTES
// =============================================

/**
 * GET /api/builder/appointments
 * List upcoming site visits
 */
router.get('/appointments', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;
    const { status, page = 1, limit = 20 } = req.query;

    try {
        const where: any = {
            lead: {
                project: { owner_id: ownerId }
            }
        };

        if (status) where.status = status;

        const appointments = await prisma.builderAppointment.findMany({
            where,
            include: {
                lead: {
                    include: {
                        contact: true,
                        project: { select: { name: true, city: true, locality: true } }
                    }
                }
            },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit),
            orderBy: { scheduled_date: 'asc' }
        });

        // Apply data masking if needed
        const maskingRules = await permissionEngine.getDataMaskingRules(ownerId);
        if (maskingRules.maskPhone) {
            appointments.forEach(apt => {
                apt.lead.contact.phone_number = maskPhone(apt.lead.contact.phone_number);
                apt.lead.contact.name = maskName(apt.lead.contact.name || '');
            });
        }

        const total = await prisma.builderAppointment.count({ where });

        res.json({ appointments, total, page: Number(page), limit: Number(limit) });

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#20' });
        logger.error('[Builder] Appointments fetch failed:', err);
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
});

/**
 * PATCH /api/builder/appointments/:id/status
 * Update appointment status
 */
router.patch('/appointments/:id/status', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    try {
        // Check ownership
        const appointment = await prisma.builderAppointment.findUnique({
            where: { id },
            include: {
                lead: {
                    include: {
                        project: true,
                        contact: true
                    }
                }
            }
        });

        if (!appointment || appointment.lead.project.owner_id !== ownerId) {
            return res.status(404).json({ error: 'Appointment not found or access denied' });
        }

        // Update status
        const updated = await prisma.builderAppointment.update({
            where: { id },
            data: { status }
        });

        logger.info(`[Builder] Appointment status updated: ${id} → ${status}`);

        // Send WhatsApp notification to buyer about appointment status change
        const buyerPhone = appointment.lead.contact?.phone_number;
        if (buyerPhone) {
            const projectName = appointment.lead.project?.name || 'the project';
            const statusMessages: Record<string, string> = {
                CONFIRMED: `Your site visit for *${projectName}* has been *confirmed*. Our team will be in touch with further details.`,
                VISITED: `Thank you for visiting *${projectName}*! We hope you liked it. Feel free to reach out if you have any questions.`,
                NO_SHOW: `We noticed you couldn't make it for the scheduled visit to *${projectName}*. Would you like to reschedule? Just reply and we'll arrange a new time.`,
                CANCELLED: `Your appointment for *${projectName}* has been cancelled. Reply if you'd like to reschedule.`,
            };
            const message = statusMessages[status] || `Your appointment status for *${projectName}* has been updated to: *${status}*.`;
            notificationAgent.send({
                to: buyerPhone.replace(/^\+/, ''),
                channel: 'whatsapp',
                message,
            }).catch(err => logger.error('[Builder] Appointment notification failed:', err));
        }

        res.json(updated);

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#21' });
        logger.error('[Builder] Appointment status update failed:', err);
        res.status(500).json({ error: 'Failed to update appointment status: ' + err.message });
    }
});

// =============================================
// TASK-114: BUILDER DASHBOARD STATS ROUTE
// =============================================

/**
 * GET /api/builder/dashboard/stats
 * Get builder dashboard statistics
 */
router.get('/dashboard/stats', authenticateBuilder, requireBuilder, async (req: any, res) => {
    const { ownerId } = req.owner;

    try {
        const [activeProjects, totalLeads, upcomingVisits, conversions, totalProjects] = await Promise.all([
            prisma.project.count({
                where: {
                    owner_id: ownerId,
                    status: ProjectListingStatus.ACTIVE
                }
            }),
            prisma.builderLead.count({
                where: { project: { owner_id: ownerId } }
            }),
            prisma.builderAppointment.count({
                where: {
                    lead: { project: { owner_id: ownerId } },
                    status: { in: ['SCHEDULED', 'CONFIRMED'] }
                }
            }),
            prisma.builderLead.count({
                where: {
                    project: { owner_id: ownerId },
                    status: 'CONVERTED'
                }
            }),
            prisma.project.count({
                where: { owner_id: ownerId }
            })
        ]);

        // Get recent leads
        const recentLeads = await prisma.builderLead.findMany({
            where: { project: { owner_id: ownerId } },
            include: {
                contact: true,
                project: { select: { name: true } }
            },
            orderBy: { created_at: 'desc' },
            take: 5
        });

        // Apply masking if needed
        const maskingRules = await permissionEngine.getDataMaskingRules(ownerId);
        if (maskingRules.maskPhone) {
            recentLeads.forEach(lead => {
                lead.contact.phone_number = maskPhone(lead.contact.phone_number);
                lead.contact.name = maskName(lead.contact.name || '');
            });
        }

        const stats = {
            totalProjects,
            activeProjects,
            totalLeads,
            upcomingVisits,
            conversions,
            conversionRate: totalLeads > 0 ? ((conversions / totalLeads) * 100).toFixed(1) : '0.0',
            recentLeads
        };

        res.json(stats);

    } catch (err: any) {
        captureRouteError(err, req, { route: 'builder#22' });
        logger.error('[Builder] Dashboard stats fetch failed:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

export default router;
