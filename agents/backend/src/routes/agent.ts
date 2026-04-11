
import { Router } from 'express';
import prisma from '../db';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { CommissionService } from '../services/commission';
import { permissionEngine, maskPhone, maskName } from '../services/permission_engine';
import { validate } from '../validators';
import { agentLoginOtpSchema, agentVerifyOtpSchema, agentRegisterSchema, closeDealSchema } from '../validators/calls.validator';
import logger from '../utils/logger';
import { cacheGet, cacheSet, cacheDel } from '../utils/redis';
import { normalizePhone } from '../utils/phone';
import { sendOtp } from '../services/otp_sender';
import { ensureOwner } from '../services/ensure_owner';
import { StorageService } from '../services/storage';

const storageService = new StorageService();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/x-msvideo', 'application/pdf'];
        cb(null, allowed.includes(file.mimetype));
    }
});

const commissionService = new CommissionService();

// OTP helpers for partner agent auth
const AGENT_OTP_TTL = 300; // 5 minutes
const AGENT_OTP_RATE_TTL = 600; // 10 min rate window
const AGENT_OTP_MAX_SENDS = 5;

async function storeAgentOtp(phone: string, otp: string): Promise<void> {
    await cacheSet(`otp:agent:${phone}`, JSON.stringify({ otp }), AGENT_OTP_TTL);
}

async function getAgentOtp(phone: string): Promise<string | null> {
    const data = await cacheGet(`otp:agent:${phone}`);
    if (!data) return null;
    try { return JSON.parse(data).otp; } catch { return null; }
}

async function deleteAgentOtp(phone: string): Promise<void> {
    await cacheDel(`otp:agent:${phone}`);
}

async function checkAgentOtpRate(phone: string): Promise<{ allowed: boolean; remaining: number }> {
    const key = `otp:agent:rate:${phone}`;
    const countStr = await cacheGet(key);
    const count = countStr ? parseInt(countStr) : 0;
    if (count >= AGENT_OTP_MAX_SENDS) return { allowed: false, remaining: 0 };
    await cacheSet(key, String(count + 1), AGENT_OTP_RATE_TTL);
    return { allowed: true, remaining: AGENT_OTP_MAX_SENDS - count - 1 };
}

const router = Router();
const JWT_SECRET = process.env.AGENT_JWT_SECRET!;

// Middleware for Agent Auth
const authenticateAgent = async (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; phone: string };
        req.agentId = decoded.id;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid token' });
    }
};

// 1. Auth: Send OTP via WhatsApp
router.post('/login-otp', validate(agentLoginOtpSchema), async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    if (!phone) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }

    try {
        // Rate limit
        const rateCheck = await checkAgentOtpRate(phone);
        if (!rateCheck.allowed) {
            return res.status(429).json({ error: 'Too many OTP requests. Please try again after 10 minutes.' });
        }

        // Check if partner agent exists
        const agent = await prisma.partnerAgent.findUnique({ where: { phone_number: phone } });
        if (!agent) {
            return res.status(404).json({ error: 'No partner account found for this number. Please contact your coordinator.' });
        }

        // Generate 6-digit OTP
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        await storeAgentOtp(phone, otp);

        // Send OTP via WhatsApp + email (dual delivery)
        const result = await sendOtp({
            phone,
            email: agent.email,
            otp,
            purpose: 'login',
            validMinutes: 5,
        });

        if (!result.anyDelivered) {
            return res.status(502).json({ error: 'Failed to send OTP. Please try again later.' });
        }

        logger.info(`[AgentAuth] OTP sent to ${phone} (wa: ${result.whatsappSent}, email: ${result.emailSent})`);
        res.json({ message: result.message, remaining: rateCheck.remaining });
    } catch (error) {
        logger.error('[AgentAuth] OTP send error:', error);
        res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
    }
});

// 2. Auth: Verify OTP
router.post('/verify-otp', validate(agentVerifyOtpSchema), async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const { otp } = req.body;
    if (!phone) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }

    try {
        // Validate OTP from Redis
        const storedOtp = await getAgentOtp(phone);
        if (!storedOtp || storedOtp !== otp) {
            return res.status(400).json({ error: 'Invalid or expired OTP. Please request a new one.' });
        }

        // Clear OTP after successful verification
        await deleteAgentOtp(phone);

        // Partner must already exist (registered by admin/coordinator)
        const agent = await prisma.partnerAgent.findUnique({
            where: { phone_number: phone },
            include: {
                managing_agent: { select: { id: true, name: true, phone: true, email: true } }
            }
        });

        if (!agent) {
            return res.status(404).json({ error: 'No partner account found. Please contact your coordinator.' });
        }

        const hasPassword = !!agent.password_hash;

        const token = jwt.sign({
            id: agent.id,
            phone: agent.phone_number,
            partner_category: agent.partner_category,
            parent_partner_id: agent.parent_partner_id
        }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            token,
            agent: {
                id: agent.id,
                name: agent.name,
                package: agent.package_type,
                partner_category: agent.partner_category,
                parent_partner_id: agent.parent_partner_id,
                business_name: agent.business_name,
                has_password: hasPassword,
                coordinator: agent.managing_agent ? {
                    name: agent.managing_agent.name,
                    phone: agent.managing_agent.phone,
                    email: agent.managing_agent.email
                } : null
            }
        });
    } catch (error) {
        logger.error('[AgentAuth] Verify OTP error:', error);
        res.status(500).json({ error: 'Verification failed. Please try again.' });
    }
});

// 3. Register (Public)
router.post('/register', validate(agentRegisterSchema), async (req, res) => {
    const { name, phone, email, companyName } = req.body;

    try {
        // Ensure Contact exists
        let contact = await prisma.contact.findUnique({ where: { phone_number: phone } });
        if (!contact) {
            const tenant = await prisma.tenant.findFirst();
            if (!tenant) return res.status(500).json({ error: 'System not configured: no tenant found' });
            contact = await prisma.contact.create({
                data: {
                    phone_number: phone,
                    tenant_id: tenant.id,
                    name: name,
                    email: email,
                    contact_type: 'PARTNER_AGENT',
                    source: 'agent_registration'
                }
            });
        } else {
            // Update contact type
            await prisma.contact.update({
                where: { phone_number: phone },
                data: { contact_type: 'PARTNER_AGENT', name: name, email: email }
            });
        }

        const agent = await prisma.partnerAgent.create({
            data: {
                phone_number: phone,
                name,
                email,
                company_name: companyName,
                package_type: 'FREE',
                status: 'ACTIVE'
            }
        });

        res.json({ message: 'Registration successful', agentId: agent.id });
    } catch (err: any) {
        logger.error(err);
        res.status(500).json({ error: 'Registration failed ' + err.message });
    }
});

// 3b. Login with Password
router.post('/login-password', async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const { password } = req.body;
    if (!phone || !password) {
        return res.status(400).json({ error: 'Phone and password are required' });
    }

    try {
        const agent = await prisma.partnerAgent.findUnique({
            where: { phone_number: phone },
            include: {
                managing_agent: { select: { id: true, name: true, phone: true, email: true } }
            }
        });

        if (!agent || !agent.password_hash) {
            return res.status(401).json({ error: 'Invalid credentials. If you haven\'t set a password, login with OTP first.' });
        }

        const valid = await bcrypt.compare(password, agent.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (agent.status !== 'ACTIVE') {
            return res.status(403).json({ error: 'Account is not active. Contact your coordinator.' });
        }

        const token = jwt.sign({
            id: agent.id,
            phone: agent.phone_number,
            partner_category: agent.partner_category,
            parent_partner_id: agent.parent_partner_id
        }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            token,
            agent: {
                id: agent.id,
                name: agent.name,
                package: agent.package_type,
                partner_category: agent.partner_category,
                parent_partner_id: agent.parent_partner_id,
                business_name: agent.business_name,
                has_password: true,
                coordinator: agent.managing_agent ? {
                    name: agent.managing_agent.name,
                    phone: agent.managing_agent.phone,
                    email: agent.managing_agent.email
                } : null
            }
        });
    } catch (error) {
        logger.error('[AgentAuth] Password login error:', error);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

// 3c. Set/Update Password (authenticated)
router.post('/set-password', authenticateAgent, async (req: any, res) => {
    const { password, current_password } = req.body;
    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const agent = await prisma.partnerAgent.findUnique({ where: { id: req.agentId } });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        // If password already set, require current password
        if (agent.password_hash) {
            if (!current_password) {
                return res.status(400).json({ error: 'Current password is required to change password' });
            }
            const valid = await bcrypt.compare(current_password, agent.password_hash);
            if (!valid) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }
        }

        const hash = await bcrypt.hash(password, 10);
        await prisma.partnerAgent.update({
            where: { id: req.agentId },
            data: { password_hash: hash }
        });

        res.json({ message: 'Password set successfully. You can now login with your password.' });
    } catch (error) {
        logger.error('[AgentAuth] Set password error:', error);
        res.status(500).json({ error: 'Failed to set password' });
    }
});

// 3d. Get Coordinator Info (authenticated)
router.get('/coordinator', authenticateAgent, async (req: any, res) => {
    try {
        const agent = await prisma.partnerAgent.findUnique({
            where: { id: req.agentId },
            include: {
                managing_agent: { select: { name: true, phone: true, email: true } }
            }
        });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        res.json({
            coordinator: agent.managing_agent ? {
                name: agent.managing_agent.name,
                phone: agent.managing_agent.phone,
                email: agent.managing_agent.email
            } : null
        });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// Helper: collect all owner IDs for an agent + their sub-agents (team members)
async function getAgentOwnerIds(agentId: string, phoneNumber: string): Promise<string[]> {
    // Sub-agents (team members) under this agent
    const subAgents = await prisma.partnerAgent.findMany({
        where: { parent_partner_id: agentId },
        select: { phone_number: true },
    });
    const allPhones = [phoneNumber, ...subAgents.map((sa: { phone_number: string }) => sa.phone_number)];
    const owners = await prisma.owner.findMany({
        where: { contact_phone: { in: allPhones } },
        select: { id: true },
    });
    return owners.map((o: { id: string }) => o.id);
}

// 4. Dashboard Stats
router.get('/dashboard', authenticateAgent, async (req: any, res) => {
    const agentId = req.agentId;

    const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // Include own + all sub-agents' inventory in stats
    const ownerIds = await getAgentOwnerIds(agentId, agent.phone_number);

    const activeListings = ownerIds.length > 0 ? await prisma.inventory.count({
        where: { owner_id: { in: ownerIds }, status: 'active' }
    }) : 0;

    const totalListings = ownerIds.length > 0 ? await prisma.inventory.count({
        where: { owner_id: { in: ownerIds } }
    }) : 0;

    const visits = await prisma.scheduledVisit.count({
        where: { agent_id: agentId }
    });

    res.json({
        activeListings,
        totalListings,
        totalEnquiries: visits,
        visitsScheduled: visits,
    });
});

// 5. Inventory (List)
router.get('/inventory', authenticateAgent, async (req: any, res) => {
    const agentId = req.agentId;

    const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // Include own + all sub-agents' (team members') inventory
    const ownerIds = await getAgentOwnerIds(agentId, agent.phone_number);
    if (ownerIds.length === 0) return res.json([]);

    const items = await prisma.inventory.findMany({
        where: { owner_id: { in: ownerIds } },
        orderBy: { created_at: 'desc' },
        select: {
            id: true,
            display_id: true,
            intent: true,
            category: true,
            type: true,
            location: true,
            price: true,
            price_unit: true,
            specs: true,
            status: true,
            media_urls: true,
            description: true,
            furnishing: true,
            floor_number: true,
            total_floors: true,
            facing: true,
            property_age: true,
            uploader_phone: true,
            uploader_name: true,
            owner_phone: true,
            created_at: true,
        }
    });
    res.json(items);
});

// 5b. Inventory (Create) — Partner adds property from their dashboard
router.post('/inventory', authenticateAgent, async (req: any, res) => {
    const agentId = req.agentId;

    try {
        const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        // Check listing limit
        const owner = await prisma.owner.findUnique({ where: { contact_phone: agent.phone_number } });
        if (owner) {
            const currentCount = await prisma.inventory.count({ where: { owner_id: owner.id, status: { in: ['active', 'pending_approval'] } } });
            if (currentCount >= agent.listing_limit) {
                return res.status(403).json({ error: `Listing limit reached (${agent.listing_limit}). Upgrade your package for more listings.` });
            }
        }

        const {
            intent, location, price, price_unit, description,
            category, type, furnishing, floor_number, total_floors,
            facing, property_age, specs,
            // Address fields
            state, district, locality, sub_locality, pincode, full_address,
            apartment_name, flat_no, plot_no,
            // Geo
            latitude, longitude,
            // Amenities & source
            features, lead_reference,
            // Media
            video_urls,
        } = req.body;

        if (!intent) return res.status(400).json({ error: 'Intent is required (sell / rent)' });
        if (!sub_locality && !locality && !full_address) return res.status(400).json({ error: 'At minimum a locality or address is required' });

        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'Tenant configuration missing' });

        // Ensure Owner exists for this partner
        const ownerId = await ensureOwner(agent.phone_number, tenant.id);

        const inventory = await prisma.inventory.create({
            data: {
                tenant_id: tenant.id,
                owner_id: ownerId,
                owner_phone: agent.phone_number,
                intent,
                category: category || 'residential',
                type: type || 'flat',
                location: sub_locality || locality || district || location || full_address || '',
                price: price ? parseFloat(String(price)) : null,
                price_unit: price_unit || 'Lakh',
                specs: specs || null,
                features: features || null,
                // Partner dashboard uploads require coordinator approval before going live
                status: 'pending_approval',
                media_urls: [],
                video_urls: Array.isArray(video_urls) ? video_urls : [],
                description: description || null,
                furnishing: furnishing || null,
                floor_number: floor_number ? parseInt(String(floor_number)) : null,
                total_floors: total_floors ? parseInt(String(total_floors)) : null,
                facing: facing || null,
                property_age: property_age || null,
                // Address
                state: state || null,
                district: district || null,
                sub_locality: sub_locality || null,
                locality: locality || null,
                pincode: pincode || null,
                full_address: full_address || null,
                apartment_name: apartment_name || null,
                flat_no: flat_no || null,
                plot_no: plot_no || null,
                // Geo
                latitude: latitude ? parseFloat(String(latitude)) : null,
                longitude: longitude ? parseFloat(String(longitude)) : null,
                // Source
                lead_reference: lead_reference || null,
                upload_source: 'mobile_app',
                uploader_phone: agent.phone_number,
                uploader_name: agent.name,
            },
        });

        logger.info(`[AgentInventory] Partner ${agentId} created inventory ${inventory.id}`);
        res.status(201).json(inventory);
    } catch (error) {
        logger.error('[AgentInventory] Create error:', error);
        res.status(500).json({ error: 'Failed to create property listing' });
    }
});

// 5c. Inventory Media Upload — Partner uploads photos/videos after creating listing
router.post('/inventory/:id/upload', authenticateAgent, upload.array('files', 20), async (req: any, res) => {
    try {
        const { id } = req.params;
        const agentId = req.agentId;
        const files = req.files as Express.Multer.File[];

        if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

        // Verify this inventory belongs to this agent
        const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        const inventory = await prisma.inventory.findUnique({ where: { id } });
        if (!inventory) return res.status(404).json({ error: 'Inventory not found' });

        // Primary check: owner ID match
        const owner = await prisma.owner.findUnique({ where: { contact_phone: agent.phone_number } });
        const isOwnerById = owner && inventory.owner_id === owner.id;

        // Fallback check: phone-based ownership (handles phone format variants)
        const { phoneVariants } = await import('../utils/phone');
        const variants = phoneVariants(agent.phone_number);
        const isUploaderByPhone = variants.some((v: string) => v === inventory.uploader_phone || v === inventory.owner_phone);

        if (!isOwnerById && !isUploaderByPhone) {
            return res.status(403).json({ error: 'Not authorized to upload to this listing' });
        }

        const imageUrls: string[] = [];
        const videoUrls: string[] = [];

        for (const file of files) {
            if (file.mimetype.startsWith('video/')) {
                // Store video directly to disk (no sharp processing)
                const videoDir = require('path').join(process.cwd(), 'uploads', 'properties', id);
                require('fs').mkdirSync(videoDir, { recursive: true });
                const ext = file.mimetype === 'video/mp4' ? '.mp4' : file.mimetype === 'video/quicktime' ? '.mov' : '.avi';
                const filename = `${Date.now()}${ext}`;
                require('fs').writeFileSync(require('path').join(videoDir, filename), file.buffer);
                videoUrls.push(`/uploads/properties/${id}/${filename}`);
            } else {
                const result = await storageService.uploadImage(file, id);
                imageUrls.push(result.original);
            }
        }

        const updatedMedia = [...(inventory.media_urls || []), ...imageUrls];
        const updatedVideos = [...(inventory.video_urls || []), ...videoUrls];

        await prisma.inventory.update({
            where: { id },
            data: { media_urls: updatedMedia, video_urls: updatedVideos },
        });

        logger.info(`[AgentMedia] Partner ${agentId} uploaded ${files.length} files to ${id}`);
        res.json({ message: `${files.length} file(s) uploaded`, media_urls: updatedMedia, video_urls: updatedVideos });
    } catch (error) {
        logger.error('[AgentMedia] Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// 5d. GET /agent/inventory — Partner views their own listings
router.get('/inventory', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        const { phoneVariants } = await import('../utils/phone');
        const variants = phoneVariants(agent.phone_number);

        const items = await prisma.inventory.findMany({
            where: {
                OR: [
                    { owner_phone: { in: variants } },
                    { uploader_phone: { in: variants } },
                ],
            },
            orderBy: { created_at: 'desc' },
            select: {
                id: true, display_id: true, status: true, intent: true,
                type: true, category: true, location: true,
                full_address: true, locality: true, district: true, state: true,
                price: true, price_unit: true, display_price: true,
                specs: true, media_urls: true, video_urls: true,
                furnishing: true, description: true, created_at: true,
                flat_no: true, floor_number: true, apartment_name: true,
            },
        });
        res.json(items);
    } catch (error) {
        logger.error('[AgentInventory] List error:', error);
        res.status(500).json({ error: 'Failed to fetch listings' });
    }
});

// 5e. PATCH /agent/inventory/:id — Partner edits their own listing
router.patch('/inventory/:id', authenticateAgent, async (req: any, res) => {
    try {
        const { id } = req.params;
        const agentId = req.agentId;
        const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        const { phoneVariants } = await import('../utils/phone');
        const variants = phoneVariants(agent.phone_number);

        const existing = await prisma.inventory.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Listing not found' });

        // Ownership check
        const isOwner = variants.some(v => v === existing.owner_phone || v === existing.uploader_phone);
        if (!isOwner) return res.status(403).json({ error: 'Not authorized to edit this listing' });

        const allowed = ['price', 'price_unit', 'description', 'specs', 'features', 'furnishing',
            'facing', 'property_age', 'total_floors', 'floor_number', 'flat_no', 'plot_no',
            'apartment_name', 'sub_locality', 'locality', 'district', 'state', 'pincode', 'full_address',
            'latitude', 'longitude'];
        const updateData: any = {};
        for (const field of allowed) {
            if (req.body[field] !== undefined) {
                if (field === 'price') updateData[field] = req.body[field] !== null && req.body[field] !== '' ? parseFloat(req.body[field]) : null;
                else if (['floor_number', 'total_floors'].includes(field)) updateData[field] = req.body[field] !== null && req.body[field] !== '' ? parseInt(String(req.body[field])) : null;
                else if (['latitude', 'longitude'].includes(field)) updateData[field] = req.body[field] !== null && req.body[field] !== '' ? parseFloat(req.body[field]) : null;
                else updateData[field] = req.body[field];
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        // Editing an approved listing → back to pending_approval for re-review
        if (existing.status === 'active') {
            updateData.status = 'pending_approval';
        }

        const updated = await prisma.inventory.update({ where: { id }, data: updateData });
        logger.info(`[AgentInventory] Partner ${agentId} updated listing ${id}`);
        res.json(updated);
    } catch (error) {
        logger.error('[AgentInventory] Update error:', error);
        res.status(500).json({ error: 'Failed to update listing' });
    }
});

// 5f. DELETE /agent/inventory/:id — Partner withdraws/deletes their own listing
router.delete('/inventory/:id', authenticateAgent, async (req: any, res) => {
    try {
        const { id } = req.params;
        const agentId = req.agentId;
        const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        const { phoneVariants } = await import('../utils/phone');
        const variants = phoneVariants(agent.phone_number);

        const existing = await prisma.inventory.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Listing not found' });

        // Ownership check
        const isOwner = variants.includes(existing.owner_phone || '') || variants.includes(existing.uploader_phone || '');
        if (!isOwner) return res.status(403).json({ error: 'Not authorized to delete this listing' });

        if (existing.status === 'active') {
            // Active listings: soft-delete (withdraw) rather than hard delete
            await prisma.inventory.update({ where: { id }, data: { status: 'withdrawn' } });
            logger.info(`[AgentInventory] Partner ${agentId} withdrew active listing ${id}`);
            res.json({ message: 'Listing withdrawn successfully', id });
        } else {
            // pending_approval / withdrawn: hard delete
            await prisma.inventory.delete({ where: { id } });
            logger.info(`[AgentInventory] Partner ${agentId} deleted listing ${id}`);
            res.json({ message: 'Listing deleted successfully', id });
        }
    } catch (error) {
        logger.error('[AgentInventory] Delete error:', error);
        res.status(500).json({ error: 'Failed to delete listing' });
    }
});

// 5g. DELETE /agent/inventory/:id/media/:filename — Partner removes a specific media file
router.delete('/inventory/:id/media/:filename', authenticateAgent, async (req: any, res) => {
    try {
        const { id, filename } = req.params;
        const agentId = req.agentId;
        const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        const { phoneVariants } = await import('../utils/phone');
        const variants = phoneVariants(agent.phone_number);

        const inv = await prisma.inventory.findUnique({ where: { id }, select: { uploader_phone: true, owner_phone: true, media_urls: true, video_urls: true } });
        if (!inv) return res.status(404).json({ error: 'Listing not found' });

        const isOwner = variants.some(v => v === inv.uploader_phone || v === inv.owner_phone);
        if (!isOwner) return res.status(403).json({ error: 'Not authorized' });

        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const isVideo = ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext);

        if (isVideo) {
            const newVideoUrls = inv.video_urls.filter(u => !u.includes(filename));
            await prisma.inventory.update({ where: { id }, data: { video_urls: newVideoUrls } });
        } else {
            try { storageService.deleteMedia(id, filename); } catch { /* file may not exist on disk */ }
            const newMediaUrls = inv.media_urls.filter(u => !u.includes(filename));
            await prisma.inventory.update({ where: { id }, data: { media_urls: newMediaUrls } });
        }

        logger.info(`[AgentMedia] Partner ${agentId} deleted media ${filename} from ${id}`);
        res.json({ success: true });
    } catch (error) {
        logger.error('[AgentMedia] Delete media error:', error);
        res.status(500).json({ error: 'Failed to delete media' });
    }
});

// 6. Leads (With Masking)
// PHASE 13: Updated to use PermissionEngine for data masking
router.get('/leads', authenticateAgent, async (req: any, res) => {
    const agentId = req.agentId;

    // Get agent's owner record for permission check
    const agent = await prisma.partnerAgent.findUnique({
        where: { id: agentId },
        include: {
            contact: {
                include: {
                    owner: true
                }
            }
        }
    });

    if (!agent || !agent.contact?.owner) {
        return res.status(404).json({ error: 'Agent owner record not found. Please complete migration.' });
    }

    const ownerId = agent.contact.owner.id;

    // Get data masking rules from permission engine
    const maskingRules = await permissionEngine.getDataMaskingRules(ownerId);

    // Find visits/leads assigned to this agent's properties
    const visits = await prisma.scheduledVisit.findMany({
        where: { agent_id: agentId },
        orderBy: { created_at: 'desc' }
    });

    // Transform and apply masking based on permissions
    const leads = visits.map(v => {
        return {
            id: v.id,
            name: maskingRules.maskName ? maskName(v.name || '') : v.name,
            phone: maskingRules.maskPhone ? maskPhone(v.phone) : v.phone,
            interest: 'Property Visit',
            status: v.status,
            date: v.created_at,
            isMasked: maskingRules.maskPhone
        };
    });

    res.json(leads);
});

// ── REFERRED LEADS (leads the partner referred to Realty Pandit) ──────────────

// GET /agent/referred-leads
router.get('/referred-leads', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const leads = await prisma.contact.findMany({
            where: { referral_partner_id: agentId },
            select: {
                phone_number: true, name: true, email: true,
                lead_status: true, lifecycle_stage: true, lead_type: true,
                source: true, intent: true,
                budget_min: true, budget_max: true, demand_bhk: true,
                preferred_location: true, timeline: true, notes: true,
                created_at: true, updated_at: true,
                assigned_agent: { select: { name: true } },
            },
            orderBy: { created_at: 'desc' },
        });
        res.json(leads);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /agent/referred-leads/:phone — partner can update client details & requirements
router.patch('/referred-leads/:phone', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const phone = decodeURIComponent(req.params.phone);

        // Verify this lead belongs to this partner
        const contact = await prisma.contact.findFirst({
            where: { phone_number: phone, referral_partner_id: agentId },
        });
        if (!contact) return res.status(404).json({ error: 'Lead not found or not yours' });
        if (contact.lead_status === 'partner_closed') return res.status(400).json({ error: 'Lead is already marked as done' });

        const { name, phone: newPhone, email, intent, budget_min, budget_max,
            demand_bhk, preferred_location, timeline, notes } = req.body;

        const updateData: any = {};
        if (name !== undefined) updateData.name = name || null;
        if (email !== undefined) updateData.email = email || null;
        if (intent !== undefined) updateData.intent = intent || null;
        if (budget_min !== undefined) updateData.budget_min = budget_min || null;
        if (budget_max !== undefined) updateData.budget_max = budget_max || null;
        if (demand_bhk !== undefined) updateData.demand_bhk = demand_bhk ? parseInt(demand_bhk) : null;
        if (preferred_location !== undefined) updateData.preferred_location = preferred_location || null;
        if (timeline !== undefined) updateData.timeline = timeline || null;
        if (notes !== undefined) updateData.notes = notes || null;

        // Phone number change — only if currently TEMP_ or blank
        if (newPhone && contact.phone_number.startsWith('TEMP_')) {
            const { normalizePhone } = await import('../utils/phone');
            const normalized = normalizePhone(newPhone);
            // Move to new phone_number (primary key change — delete + create)
            const updated = await prisma.$transaction(async (tx) => {
                const copy = await tx.contact.create({
                    data: { ...contact, ...updateData, phone_number: normalized, updated_at: new Date() },
                });
                await tx.contact.delete({ where: { phone_number: contact.phone_number } });
                return copy;
            });
            return res.json(updated);
        }

        const updated = await prisma.contact.update({
            where: { phone_number: phone },
            data: { ...updateData, updated_at: new Date() },
        });
        res.json(updated);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /agent/referred-leads/:phone/done — partner marks lead as closed on their end
router.post('/referred-leads/:phone/done', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const phone = decodeURIComponent(req.params.phone);

        const contact = await prisma.contact.findFirst({
            where: { phone_number: phone, referral_partner_id: agentId },
            include: {
                assigned_agent: { select: { id: true, name: true, phone: true, email: true } },
            },
        });
        if (!contact) return res.status(404).json({ error: 'Lead not found or not yours' });
        if (contact.lead_status === 'partner_closed') return res.status(400).json({ error: 'Already marked as done' });

        // Get partner agent info
        const partner = await prisma.partnerAgent.findUnique({
            where: { id: agentId },
            select: { name: true, phone_number: true },
        });

        // Update lead status
        await prisma.contact.update({
            where: { phone_number: phone },
            data: { lead_status: 'partner_closed', updated_at: new Date() },
        });

        // Log an interaction
        await prisma.interaction.create({
            data: {
                phone_number: phone,
                channel: 'system',
                direction: 'inbound',
                event_type: 'partner_closed',
                content: `Partner ${partner?.name || agentId} marked this lead as done — handled with their own inventory`,
                tenant_id: contact.tenant_id,
            },
        });

        // Notify: super_boss + assigned agent
        const { notify } = await import('../services/notify');
        const notifyData = {
            partner_name: partner?.name || 'Partner',
            client_name: contact.name || contact.phone_number,
            client_phone: contact.phone_number,
        };

        const recipients: any[] = [];
        // Super boss
        const superBoss = await prisma.agent.findFirst({ where: { role: 'super_boss', status: 'active' } });
        if (superBoss) {
            recipients.push({ id: superBoss.id, type: 'agent', phone: superBoss.phone, email: superBoss.email, name: superBoss.name });
        }
        // Assigned agent (if different from super boss)
        if (contact.assigned_agent && contact.assigned_agent.id !== superBoss?.id) {
            recipients.push({ id: contact.assigned_agent.id, type: 'agent', phone: contact.assigned_agent.phone, email: contact.assigned_agent.email, name: contact.assigned_agent.name });
        }

        if (recipients.length > 0) {
            await notify('partner_lead_closed', recipients, notifyData);
        }

        res.json({ success: true, message: 'Lead marked as done' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Appointments
// PHASE 13: Updated to use PermissionEngine for data masking
router.get('/appointments', authenticateAgent, async (req: any, res) => {
    const agentId = req.agentId;

    // Get agent's owner record for permission check
    const agent = await prisma.partnerAgent.findUnique({
        where: { id: agentId },
        include: {
            contact: {
                include: {
                    owner: true
                }
            }
        }
    });

    if (!agent || !agent.contact?.owner) {
        return res.status(404).json({ error: 'Agent owner record not found. Please complete migration.' });
    }

    const ownerId = agent.contact.owner.id;

    // Get data masking rules from permission engine
    const maskingRules = await permissionEngine.getDataMaskingRules(ownerId);

    const visits = await prisma.scheduledVisit.findMany({
        where: { agent_id: agentId, status: { in: ['confirmed', 'custom'] } },
        orderBy: { preferred_date: 'asc' }
    });

    const data = visits.map(v => {
        return {
            id: v.id,
            buyer: maskingRules.maskName ? maskName(v.name || '') : v.name,
            phone: maskingRules.maskPhone ? maskPhone(v.phone) : v.phone,
            date: v.preferred_date,
            time: v.preferred_time,
            status: v.status
        };
    });

    res.json(data);
});

// 8. Close Deal (Trigger Commission)
router.post('/visits/:id/close', authenticateAgent, validate(closeDealSchema), async (req: any, res) => {
    const { dealValue } = req.body;
    const visitId = req.params.id;

    try {
        await prisma.scheduledVisit.update({
            where: { id: visitId },
            data: { status: 'completed' }
        });

        const result = await commissionService.processDealClosure(visitId, Number(dealValue));
        res.json({ success: true, commission: result });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// TEAM MANAGEMENT (Company partners can add sub-agents)
// ============================================================

// GET /agent/team - List sub-agents (company partners only)
router.get('/team', authenticateAgent, async (req: any, res) => {
    try {
        const caller = await prisma.partnerAgent.findUnique({ where: { id: req.agentId } });
        if (!caller || caller.partner_category !== 'COMPANY' || caller.parent_partner_id) {
            return res.status(403).json({ error: 'Only company partner owners can manage team' });
        }

        const subAgents = await prisma.partnerAgent.findMany({
            where: { parent_partner_id: caller.id },
            orderBy: { created_at: 'desc' },
            select: {
                id: true, name: true, phone_number: true, email: true,
                status: true, created_at: true
            }
        });
        res.json(subAgents);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /agent/team - Add a sub-agent (company partners only)
router.post('/team', authenticateAgent, async (req: any, res) => {
    const { name, phone, email } = req.body;
    if (!name || !phone) {
        return res.status(400).json({ error: 'name and phone are required' });
    }

    try {
        const caller = await prisma.partnerAgent.findUnique({ where: { id: req.agentId } });
        if (!caller || caller.partner_category !== 'COMPANY' || caller.parent_partner_id) {
            return res.status(403).json({ error: 'Only company partner owners can add team members' });
        }

        const normalizedPhone = phone.startsWith('+') ? phone : `+91${phone.replace(/^0+/, '')}`;

        // Ensure contact exists
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'System not configured' });

        await prisma.contact.upsert({
            where: { phone_number: normalizedPhone },
            create: {
                phone_number: normalizedPhone,
                tenant_id: tenant.id,
                name,
                email: email || undefined,
                contact_type: 'PARTNER_AGENT',
                source: 'partner_team_created'
            },
            update: { name, contact_type: 'PARTNER_AGENT' }
        });

        const subAgent = await prisma.partnerAgent.create({
            data: {
                phone_number: normalizedPhone,
                name,
                email: email || null,
                partner_category: 'INDIVIDUAL',
                parent_partner_id: caller.id,
                managing_agent_id: caller.managing_agent_id,
                business_name: caller.business_name,
                business_address: caller.business_address,
                package_type: caller.package_type,
                status: 'ACTIVE',
                verified: true,
                onboarded_at: new Date()
            }
        });

        res.status(201).json(subAgent);
    } catch (err: any) {
        if (err.code === 'P2002') {
            return res.status(409).json({ error: 'This phone number is already registered' });
        }
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// DEAL MANAGEMENT (Phase 7 - Partner-facing deal endpoints)
// ============================================================

import { createDeal, listDeals, getDealById, getDealTimeline } from '../services/deal_service';
import { partnerCreateDealSchema, createDealQuerySchema } from '../validators/deals.validator';

// POST /agent/deals — Partner submits a buyer lead as a deal
router.post('/deals', authenticateAgent, validate(partnerCreateDealSchema), async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'System not configured' });

        const { customer_name, customer_phone, type: rawType, ...requirements } = req.body;
        // Map user-friendly type to DB enum (BUY→SALE, RENT→RENT, LEASE→RENT)
        const type = rawType === 'BUY' ? 'SALE' : rawType === 'LEASE' ? 'RENT' : rawType;

        // Upsert contact for the customer if phone provided
        let contactId: string;
        if (customer_phone) {
            const phone = customer_phone.startsWith('+') ? customer_phone : `+91${customer_phone.replace(/^0+/, '')}`;
            const contact = await prisma.contact.upsert({
                where: { phone_number: phone },
                create: {
                    phone_number: phone,
                    tenant_id: tenant.id,
                    name: customer_name,
                    contact_type: type === 'RENT' ? 'TENANT' : 'BUYER',
                    source: 'partner_deal',
                },
                update: { name: customer_name },
            });
            contactId = contact.phone_number;
        } else {
            // Create contact with partner's phone as reference (name-only lead)
            const contact = await prisma.contact.create({
                data: {
                    phone_number: `partner_lead_${Date.now()}`,
                    tenant_id: tenant.id,
                    name: customer_name,
                    contact_type: type === 'RENT' ? 'TENANT' : 'BUYER',
                    source: 'partner_deal',
                },
            });
            contactId = contact.phone_number;
        }

        const result = await createDeal(
            {
                tenant_id: tenant.id,
                demand_contact_id: contactId,
                demand_handler_type: 'PARTNER',
                demand_handler_id: agentId,
                type,
                source: 'partner_portal',
                ...requirements,
            },
            agentId,
            'partner_portal'
        );

        if (result.isDuplicate) {
            return res.status(409).json({ error: 'Duplicate deal detected', existing_deal_id: result.deal.id });
        }

        logger.info(`[AgentDeals] Partner ${agentId} created deal ${result.deal.id}`);
        res.status(201).json({
            deal: result.deal,
            matches: result.matches,
            message: result.matches.length > 0
                ? `Deal created! ${result.matches.length} matching properties found.`
                : 'Deal created! Your coordinator will be in touch.',
        });
    } catch (error: any) {
        logger.error('[AgentDeals] Create deal error:', error);
        res.status(500).json({ error: 'Failed to create deal' });
    }
});

// GET /agent/deals — Partner's deals (masked view)
router.get('/deals', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const { status, page, limit } = req.query;

        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'System not configured' });

        // Find deals where this partner is demand or supply handler
        const where: any = {
            tenant_id: tenant.id,
            OR: [
                { demand_handler_id: agentId },
                { supply_handler_id: agentId },
            ],
        };
        if (status) where.status = status;

        const skip = ((parseInt(page) || 1) - 1) * (parseInt(limit) || 20);
        const take = parseInt(limit) || 20;

        const [deals, total] = await Promise.all([
            prisma.transaction.findMany({
                where,
                skip,
                take,
                orderBy: { updated_at: 'desc' },
                include: {
                    demand_contact: { select: { name: true, contact_type: true } },
                    coordinator: { select: { id: true, name: true, phone: true } },
                    inventory: { select: { id: true, type: true, location: true, price: true, media_urls: true } },
                },
            }),
            prisma.transaction.count({ where }),
        ]);

        // Mask data: partners see customer first name only, never see other partner details
        const maskedDeals = deals.map(d => ({
            id: d.id,
            type: d.type,
            status: d.status,
            deal_scenario: d.deal_scenario,
            customer_name: d.demand_handler_id === agentId
                ? d.demand_contact?.name // Own customer - full name
                : maskName(d.demand_contact?.name || ''), // Other's customer - masked
            coordinator: d.coordinator ? { name: d.coordinator.name, phone: d.coordinator.phone } : null,
            property: d.inventory ? {
                type: d.inventory.type,
                location: d.inventory.location,
                price: d.inventory.price,
                image: (d.inventory.media_urls as string[])?.[0] || null,
            } : null,
            demand_location: d.demand_location,
            demand_budget_min: d.demand_budget_min,
            demand_budget_max: d.demand_budget_max,
            created_at: d.created_at,
            updated_at: d.updated_at,
        }));

        res.json({
            deals: maskedDeals,
            pagination: { page: parseInt(page) || 1, limit: take, total, totalPages: Math.ceil(total / take) },
        });
    } catch (error: any) {
        logger.error('[AgentDeals] List deals error:', error);
        res.status(500).json({ error: 'Failed to fetch deals' });
    }
});

// GET /agent/deals/:id — Single deal detail (masked)
router.get('/deals/:id', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const deal = await getDealById(req.params.id);
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        // Verify this partner is involved in the deal
        if (deal.demand_handler_id !== agentId && deal.supply_handler_id !== agentId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const isDemandHandler = deal.demand_handler_id === agentId;

        res.json({
            id: deal.id,
            type: deal.type,
            status: deal.status,
            deal_scenario: deal.deal_scenario,
            customer_name: isDemandHandler
                ? deal.demand_contact?.name
                : maskName(deal.demand_contact?.name || ''),
            customer_phone: isDemandHandler
                ? deal.demand_contact?.phone_number
                : null, // Supply partners never see customer phone
            coordinator: deal.coordinator ? { name: deal.coordinator.name, phone: deal.coordinator.phone } : null,
            property: deal.inventory ? {
                id: deal.inventory.id,
                type: deal.inventory.type,
                location: deal.inventory.location,
                price: deal.inventory.price,
                media_urls: deal.inventory.media_urls,
            } : null,
            demand_location: deal.demand_location,
            demand_budget_min: deal.demand_budget_min,
            demand_budget_max: deal.demand_budget_max,
            demand_property_type: deal.demand_property_type,
            logs: deal.logs?.map(l => ({
                action: l.action,
                details: l.details,
                created_at: l.created_at,
            })),
            queries: deal.queries,
            created_at: deal.created_at,
            updated_at: deal.updated_at,
        });
    } catch (error: any) {
        logger.error('[AgentDeals] Get deal error:', error);
        res.status(500).json({ error: 'Failed to fetch deal' });
    }
});

// GET /agent/deals/:id/matches — Browse matched properties for a deal (one at a time)
router.get('/deals/:id/matches', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const deal = await prisma.transaction.findUnique({ where: { id: req.params.id } });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        if (deal.demand_handler_id !== agentId && deal.supply_handler_id !== agentId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { MatchingEngine: ME } = await import('../services/matching_engine');
        const engine = new ME();

        const matches = await engine.findMatches({
            intent: deal.demand_intent === 'rent_lease' ? 'rent' : 'buy',
            property_type: deal.demand_type_slug || deal.demand_property_type || undefined,
            budget_min: deal.demand_budget_min ? Number(deal.demand_budget_min) : undefined,
            budget_max: deal.demand_budget_max ? Number(deal.demand_budget_max) : undefined,
            preferred_location: deal.demand_location || undefined,
        }, 20);

        // Sanitize: remove owner details
        const sanitized = matches.map(m => ({
            id: m.id,
            type: m.type,
            category: m.category,
            location: m.location,
            price: m.price,
            price_unit: m.price_unit,
            intent: m.intent,
            specs: m.specs,
            features: m.features,
            furnishing: m.furnishing,
            floor_number: m.floor_number,
            total_floors: m.total_floors,
            media_urls: m.media_urls,
            match_score: m.match_score,
        }));

        res.json({ deal_id: deal.id, matches: sanitized, total: sanitized.length });
    } catch (error: any) {
        logger.error('[AgentDeals] Get matches error:', error);
        res.status(500).json({ error: 'Failed to fetch matches' });
    }
});

// POST /agent/deals/:id/schedule-visit — Schedule visit for a matched property
router.post('/deals/:id/schedule-visit', authenticateAgent, async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const deal = await prisma.transaction.findUnique({ where: { id: req.params.id } });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        if (deal.demand_handler_id !== agentId && deal.supply_handler_id !== agentId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { property_id, preferred_date, preferred_time, notes } = req.body;
        if (!property_id) return res.status(400).json({ error: 'property_id is required' });

        const agent = await prisma.partnerAgent.findUnique({ where: { id: agentId } });
        const customerContact = deal.demand_contact_id;

        const visit = await prisma.scheduledVisit.create({
            data: {
                contact_id: customerContact,
                property_id,
                agent_id: agentId,
                name: agent?.name || 'Partner Customer',
                phone: customerContact,
                preferred_date: preferred_date ? new Date(preferred_date) : new Date(),
                preferred_time: preferred_time || 'To be confirmed',
                message: notes || null,
                source: 'partner_portal',
                status: 'scheduled',
            },
        });

        logger.info(`[AgentDeals] Partner ${agentId} scheduled visit ${visit.id} for deal ${req.params.id}`);
        res.status(201).json({ visit_id: visit.id, message: 'Visit scheduled! Your coordinator will confirm.' });
    } catch (error: any) {
        logger.error('[AgentDeals] Schedule visit error:', error);
        res.status(500).json({ error: 'Failed to schedule visit' });
    }
});

// POST /agent/deals/:id/query — Partner raises a query
router.post('/deals/:id/query', authenticateAgent, validate(createDealQuerySchema), async (req: any, res) => {
    try {
        const agentId = req.agentId;
        const deal = await prisma.transaction.findUnique({ where: { id: req.params.id } });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        // Verify partner is involved
        if (deal.demand_handler_id !== agentId && deal.supply_handler_id !== agentId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const raisedByType = deal.demand_handler_id === agentId ? 'partner_demand' : 'partner_supply';

        const query = await prisma.dealQuery.create({
            data: {
                transaction_id: req.params.id,
                raised_by_type: raisedByType,
                raised_by_id: agentId,
                subject: req.body.subject,
                message: req.body.message,
                status: 'OPEN',
            },
        });

        logger.info(`[AgentDeals] Partner ${agentId} raised query ${query.id} on deal ${req.params.id}`);
        res.status(201).json(query);
    } catch (error: any) {
        logger.error('[AgentDeals] Create query error:', error);
        res.status(500).json({ error: 'Failed to create query' });
    }
});

export default router;
