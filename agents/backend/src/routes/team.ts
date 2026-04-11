
import { Router } from 'express';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import bcrypt from 'bcryptjs';
import prisma from '../db';
import logger from '../utils/logger';
import { authMiddleware, checkPermission } from '../middleware/auth';
import { emailProvisioner } from '../services/email_provisioner';
import { ensureOwner } from '../services/ensure_owner';
import { WhatsAppService } from '../services/whatsapp';
import { notify } from '../services/notify';

const whatsappService = new WhatsAppService();
const ADMIN_PANEL_URL = process.env.ADMIN_PANEL_URL || 'https://admin.realtypandit.in';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/team/inventory/bulk-template - Download CSV template (no auth, static data)
router.get('/inventory/bulk-template', (req, res) => {
    const template = [
        'type,category,intent,state,district,locality,pincode,price,price_unit,bedrooms,bathrooms,area,area_unit,owner_phone,owner_name,status,furnishing,floor_number,total_floors,facing,property_age,key_holder_type,amenities,category_slug,sub_category_slug,type_slug,configuration_slug',
        'flat,residential,sell,Uttar Pradesh,Gautam Buddh Nagar,"Sector 18, Noida",201301,5500000,Lakh,2,2,1200,sqft,9999999999,Rahul Sharma,active,semi_furnished,3,12,north,1-3_years,UPLOADER,"parking,lift,security",residential,apartment,flat,2_bhk',
        'house,residential,rent,Haryana,Gurgaon,"DLF Phase 2",122002,45000,,3,3,2500,sqft,9888888888,Priya Singh,active,fully_furnished,,,east,,OWNER,"parking,garden,security",residential,individual_housing,independent_house,',
        'plot,commercial,sell,Uttar Pradesh,Gautam Buddh Nagar,"Noida Extension",201306,8000000,Lakh,,,2000,sqyd,9777777777,Amit Kumar,active,,,,,new_construction,EXTERNAL,"",commercial,,,',
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory_template.csv"');
    res.send(template);
});

// All team routes below require authentication
router.use(authMiddleware);

// =============================================================
// TEAM MEMBER MANAGEMENT
// =============================================================

// GET /api/team/members-list - Lightweight list of team member names (for dropdowns, accessible to all)
router.get('/members-list', checkPermission('view_inventory'), async (req, res) => {
    try {
        const members = await prisma.agent.findMany({
            where: { tenant_id: req.agent!.tenant_id, status: 'active' },
            select: { id: true, name: true, role: true },
            orderBy: [{ role: 'asc' }, { name: 'asc' }]
        });
        res.json(members);
    } catch (error) {
        logger.error('Team members-list fetch error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/team/members - List all team members
router.get('/members', checkPermission('manage_team'), async (req, res) => {
    try {
        const members = await prisma.agent.findMany({
            where: { tenant_id: req.agent!.tenant_id },
            select: {
                id: true, name: true, email: true, phone: true,
                role: true, department: true, status: true,
                last_login_at: true, created_at: true,
                reports_to: { select: { name: true, email: true } },
                _count: { select: { assigned_leads: true } }
            },
            orderBy: [{ role: 'asc' }, { name: 'asc' }]
        });
        res.json(members);
    } catch (error) {
        logger.error('Team members fetch error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/team/email-preview - Preview auto-generated email for a name
router.get('/email-preview', checkPermission('manage_team'), async (req, res) => {
    const { name } = req.query;
    if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'name query param required' });
    }
    try {
        const email = await emailProvisioner.generateUniqueEmail(name);
        res.json({ email });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/team/members - Create a new team member
router.post('/members', checkPermission('create_agents'), async (req, res) => {
    const { name, phone, role, department, reports_to_id, customEmail, customPassword } = req.body;

    if (!name || !phone) {
        return res.status(400).json({ error: 'name and phone are required' });
    }

    // Normalize phone to E.164
    const normalizedPhone = phone.startsWith('+') ? phone : `+91${phone.replace(/^0+/, '')}`;

    // Role restriction: managers can only create employees
    const creatorRole = req.agent!.role;
    const targetRole = role || 'employee';
    if (creatorRole === 'manager' && targetRole !== 'employee') {
        return res.status(403).json({ error: 'Managers can only create employee accounts' });
    }
    if (creatorRole !== 'super_boss' && targetRole === 'super_boss') {
        return res.status(403).json({ error: 'Only super_boss can create another super_boss' });
    }

    try {
        // Auto-generate or use custom email
        const email = customEmail || await emailProvisioner.generateUniqueEmail(name);

        // Check email uniqueness
        const existing = await prisma.agent.findUnique({ where: { email } });
        if (existing) {
            return res.status(400).json({ error: `Email ${email} is already in use` });
        }

        // Generate temporary password if not provided
        const tempPassword = customPassword || generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        // Create agent record
        const agent = await prisma.agent.create({
            data: {
                name,
                email,
                phone: normalizedPhone,
                role: targetRole,
                department: department || null,
                password_hash: passwordHash,
                tenant_id: req.agent!.tenant_id,
                reports_to_id: reports_to_id || null,
                status: 'active'
            },
            select: {
                id: true, name: true, email: true, phone: true,
                role: true, department: true, status: true, created_at: true
            }
        });

        // SSOT: Upsert Contact record for this team member
        const tenant = await prisma.tenant.findUnique({ where: { id: req.agent!.tenant_id } });
        if (tenant) {
            await prisma.contact.upsert({
                where: { phone_number: normalizedPhone },
                create: {
                    phone_number: normalizedPhone,
                    tenant_id: req.agent!.tenant_id,
                    name,
                    email,
                    contact_type: 'MANAGEMENT',
                    source: 'admin_created'
                },
                update: {
                    name,
                    email,
                    contact_type: 'MANAGEMENT'
                }
            });

            // Log interaction
            await prisma.interaction.create({
                data: {
                    tenant_id: req.agent!.tenant_id,
                    phone_number: normalizedPhone,
                    channel: 'admin',
                    direction: 'outbound',
                    event_type: 'team_member_created',
                    content: `Team member created: ${name} (${targetRole}${department ? ', ' + department : ''})`,
                    metadata: { agent_id: agent.id, created_by: req.agent!.id, role: targetRole, department }
                }
            });
        }

        // Provision email mailbox (non-blocking)
        emailProvisioner.provision(email, tempPassword).catch(err => {
            logger.warn(`[Team] Email provision failed for ${email}: ${err.message}`);
        });

        // Generate setup token for password self-service
        const setupToken = randomUUID();
        const setupExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
        await prisma.agent.update({
            where: { id: agent.id },
            data: { setup_token: setupToken, setup_token_expires: setupExpiry },
        });

        const setupLink = `${ADMIN_PANEL_URL}/setup-password?token=${setupToken}`;

        // Send WhatsApp welcome message (non-blocking)
        sendWelcomeWhatsApp(normalizedPhone, name, targetRole, department, email, setupLink, req.agent!.tenant_id)
            .catch(err => logger.warn(`[Team] WhatsApp welcome failed for ${normalizedPhone}: ${err.message}`));

        // Notify all admins about new team member
        const admins = await prisma.agent.findMany({ where: { role: { in: ['super_boss', 'manager'] }, status: 'active', id: { not: req.agent!.id } }, select: { id: true, phone: true, email: true, name: true } });
        if (admins.length > 0) {
            notify('team_member_joined', admins.map(a => ({ id: a.id, type: 'agent' as const, phone: a.phone, email: a.email || undefined, name: a.name })), {
                name, role: targetRole,
            });
        }

        res.status(201).json({
            agent,
            setupLink,
            credentials: {
                email,
                tempPassword,
                setupLink,
                imapHost: 'mail.realtypandit.in',
                imapPort: 993,
                smtpHost: 'mail.realtypandit.in',
                smtpPort: 587,
                note: 'A welcome message with password setup link has been sent to their WhatsApp.'
            }
        });
    } catch (error) {
        logger.error('Create team member error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/team/members/:id - Update member details
router.patch('/members/:id', checkPermission('manage_team'), async (req, res) => {
    const { id } = req.params;
    const { name, phone, department, role, personal_email } = req.body;

    // Role changes: only super_boss
    if (role && req.agent!.role !== 'super_boss') {
        return res.status(403).json({ error: 'Only super_boss can change roles' });
    }

    try {
        const updateData: any = {};
        if (name) updateData.name = name;
        if (phone) updateData.phone = phone.startsWith('+') ? phone : `+91${phone.replace(/^0+/, '')}`;
        if (department !== undefined) updateData.department = department;
        if (role) updateData.role = role;
        if (personal_email !== undefined) {
            updateData.personal_email = personal_email ? personal_email.trim().toLowerCase() : null;
        }

        const agent = await prisma.agent.update({
            where: { id },
            data: updateData,
            select: {
                id: true, name: true, email: true, phone: true,
                role: true, department: true, status: true
            }
        });

        // SSOT: Sync Contact record when phone is updated
        if (updateData.phone) {
            await prisma.contact.upsert({
                where: { phone_number: updateData.phone },
                create: {
                    phone_number: updateData.phone,
                    tenant_id: req.agent!.tenant_id,
                    name: agent.name,
                    email: agent.email,
                    contact_type: 'MANAGEMENT',
                    source: 'team_update',
                },
                update: {
                    contact_type: 'MANAGEMENT',
                    name: agent.name,
                    email: agent.email,
                }
            });
        }

        res.json(agent);
    } catch (error) {
        logger.error('Update team member error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/team/members/:id/deactivate - Deactivate or reactivate a member
router.patch('/members/:id/deactivate', checkPermission('manage_settings'), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'active' or 'inactive'

    if (id === req.agent!.id) {
        return res.status(400).json({ error: 'Cannot change your own status' });
    }

    try {
        const agent = await prisma.agent.update({
            where: { id },
            data: { status: status === 'active' ? 'active' : 'inactive' },
            select: { id: true, name: true, email: true, status: true }
        });
        res.json({ ...agent, message: `Account ${agent.status}` });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/team/members/:id/reset-password - Reset member password + send setup link
router.patch('/members/:id/reset-password', checkPermission('manage_team'), async (req, res) => {
    const { id } = req.params;

    try {
        const agent = await prisma.agent.findUnique({
            where: { id },
            select: { id: true, email: true, name: true, phone: true, role: true, department: true, tenant_id: true }
        });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });

        const newPassword = generateTempPassword();
        const hash = await bcrypt.hash(newPassword, 10);

        // Generate setup token so they can set their own password
        const setupToken = randomUUID();
        const setupExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);

        await prisma.agent.update({
            where: { id },
            data: { password_hash: hash, setup_token: setupToken, setup_token_expires: setupExpiry },
        });

        // Update email mailbox password too
        emailProvisioner.updatePassword(agent.email, newPassword).catch(() => {});

        const setupLink = `${ADMIN_PANEL_URL}/setup-password?token=${setupToken}`;

        // Send setup link via WhatsApp (non-blocking)
        if (agent.phone) {
            sendWelcomeWhatsApp(agent.phone, agent.name, agent.role, agent.department, agent.email, setupLink, agent.tenant_id)
                .catch(err => logger.warn(`[Team] WhatsApp reset link failed for ${agent.phone}: ${err.message}`));
        }

        res.json({
            message: 'Password reset successfully. Setup link sent to WhatsApp.',
            name: agent.name,
            email: agent.email,
            newPassword,
            setupLink,
            note: agent.phone ? 'A password setup link has been sent to their WhatsApp.' : 'No phone on file — share the password manually.',
        });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// PATCH /api/team/members/:id/set-password - Boss sets custom password for a team member
router.patch('/members/:id/set-password', checkPermission('manage_team'), async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Can't set own password via this route
    if (id === req.agent!.id) {
        return res.status(400).json({ error: 'Use forgot-password to reset your own password.' });
    }

    try {
        const target = await prisma.agent.findUnique({
            where: { id },
            select: { id: true, name: true, email: true, role: true, tenant_id: true },
        });
        if (!target) return res.status(404).json({ error: 'Agent not found' });

        // Boss restriction: can't set password for users with higher role
        const roleRank: Record<string, number> = { super_boss: 3, manager: 2, employee: 1 };
        const creatorRank = roleRank[req.agent!.role] || 0;
        const targetRank = roleRank[target.role] || 0;
        if (targetRank > creatorRank) {
            return res.status(403).json({ error: 'Cannot set password for users with higher role.' });
        }

        // Hash and update
        const hash = await bcrypt.hash(password, 10);
        await prisma.agent.update({
            where: { id },
            data: { password_hash: hash },
        });

        // Audit trail
        try {
            await prisma.agentActionLog.create({
                data: {
                    tenant_id: req.agent!.tenant_id,
                    agent_name: 'AdminAgent',
                    action: 'set_password',
                    phone_number: target.email,
                    status: 'success',
                    details: { set_by: req.agent!.id, target_name: target.name, target_role: target.role },
                },
            });
        } catch { /* non-blocking audit */ }

        logger.info(`[Team] Password set for ${target.name} (${target.email}) by ${req.agent!.id}`);
        res.json({ success: true, message: `Password updated for ${target.name}.` });
    } catch (error) {
        logger.error('Set password error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// POST /api/team/members/:id/resend-setup - Resend WhatsApp welcome with fresh setup link
router.post('/members/:id/resend-setup', checkPermission('manage_team'), async (req, res) => {
    const { id } = req.params;

    try {
        const agent = await prisma.agent.findUnique({
            where: { id },
            select: { id: true, name: true, email: true, phone: true, role: true, department: true, tenant_id: true, status: true },
        });
        if (!agent) return res.status(404).json({ error: 'Agent not found' });
        if (agent.status !== 'active') return res.status(400).json({ error: 'Agent is inactive' });
        if (!agent.phone) return res.status(400).json({ error: 'Agent has no phone number' });

        // Generate fresh setup token (48h)
        const setupToken = randomUUID();
        const setupExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
        await prisma.agent.update({
            where: { id },
            data: { setup_token: setupToken, setup_token_expires: setupExpiry },
        });

        const setupLink = `${ADMIN_PANEL_URL}/setup-password?token=${setupToken}`;

        await sendWelcomeWhatsApp(agent.phone, agent.name, agent.role, agent.department, agent.email, setupLink, agent.tenant_id);

        logger.info(`[Team] Resent setup link for ${agent.name} (${agent.phone})`);
        res.json({ success: true, message: `Setup link resent to ${agent.phone}`, setupLink });
    } catch (error) {
        logger.error('Resend setup link error:', error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/team/members-without-phone - Count active agents with no phone
router.get('/members-without-phone', checkPermission('manage_team'), async (req, res) => {
    try {
        const count = await prisma.agent.count({
            where: {
                tenant_id: req.agent!.tenant_id,
                status: 'active',
                OR: [{ phone: null }, { phone: '' }],
            },
        });
        res.json({ count });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// =============================================================
// BULK INVENTORY UPLOAD
// =============================================================

// POST /api/team/inventory/bulk-upload - Upload CSV of properties
router.post('/inventory/bulk-upload', checkPermission('bulk_upload'), upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'CSV file required. Field name: file' });
    }

    const results = { imported: 0, skipped: 0, errors: [] as string[] };

    try {
        const csvContent = req.file.buffer.toString('utf-8');
        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        });

        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return res.status(500).json({ error: 'Tenant configuration missing' });

        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const rowNum = i + 2; // 1-based, +1 for header

            // Required fields validation
            if (!row.owner_phone) {
                results.errors.push(`Row ${rowNum}: owner_phone is required`);
                results.skipped++;
                continue;
            }
            if (!row.type) {
                results.errors.push(`Row ${rowNum}: type is required (flat, house, plot, office, shop)`);
                results.skipped++;
                continue;
            }
            if (!row.intent) {
                results.errors.push(`Row ${rowNum}: intent is required (sell, rent, lease)`);
                results.skipped++;
                continue;
            }

            try {
                const ownerPhone = row.owner_phone.startsWith('+') ? row.owner_phone : `+91${row.owner_phone.replace(/^0+/, '')}`;

                // SSOT: Upsert Contact
                await prisma.contact.upsert({
                    where: { phone_number: ownerPhone },
                    create: {
                        phone_number: ownerPhone,
                        tenant_id: tenant.id,
                        name: row.owner_name || null,
                        contact_type: 'SELLER_LANDLORD',
                        source: 'bulk_upload'
                    },
                    update: {
                        contact_type: 'SELLER_LANDLORD'
                    }
                });

                // Build specs object
                const specs: any = {};
                if (row.bedrooms) specs.bedrooms = parseInt(row.bedrooms);
                if (row.bathrooms) specs.bathrooms = parseInt(row.bathrooms);
                if (row.area) specs.area = parseFloat(row.area);
                if (row.area_unit) specs.area_unit = row.area_unit;

                // Resolve classification slugs to IDs (optional columns)
                let categoryId: string | undefined;
                let subCategoryId: string | undefined;
                let typeId: string | undefined;
                let configurationId: string | undefined;

                if (row.category_slug) {
                    const cat = await prisma.propertyCategory.findFirst({ where: { slug: row.category_slug } });
                    if (cat) categoryId = cat.id;
                }
                if (row.sub_category_slug && categoryId) {
                    const subCat = await prisma.propertySubCategory.findFirst({ where: { slug: row.sub_category_slug, category_id: categoryId } });
                    if (subCat) subCategoryId = subCat.id;
                }
                if (row.type_slug && subCategoryId) {
                    const typ = await prisma.propertyType.findFirst({ where: { slug: row.type_slug, sub_category_id: subCategoryId } });
                    if (typ) typeId = typ.id;
                }
                if (row.configuration_slug) {
                    const config = await prisma.propertyConfiguration.findFirst({ where: { slug: row.configuration_slug } });
                    if (config) configurationId = config.id;
                }

                // Parse amenities (comma-separated) into features JSON
                let features: Record<string, boolean> | undefined;
                if (row.amenities) {
                    features = {};
                    const amenityWords = row.amenities.toLowerCase().split(/[,;\s]+/);
                    const AMENITY_MAP: Record<string, string> = {
                        'parking': 'parking', 'lift': 'lift', 'garden': 'garden',
                        'pool': 'pool', 'gym': 'gym', 'security': 'security',
                        'power_backup': 'power_backup', 'water_supply': 'water_supply',
                        'club_house': 'club_house', 'intercom': 'intercom',
                        'gas_pipeline': 'gas_pipeline', 'park': 'park',
                    };
                    for (const w of amenityWords) {
                        const key = AMENITY_MAP[w.trim()];
                        if (key) features[key] = true;
                    }
                    if (Object.keys(features).length === 0) features = undefined;
                }

                // Ensure Owner exists for this phone (creates if needed)
                const ownerId = await ensureOwner(ownerPhone, tenant.id);

                // Compute structured address + legacy location
                const csvState = row.state || undefined;
                const csvDistrict = row.district || undefined;
                const csvLocality = row.locality || undefined;
                const csvPincode = row.pincode || undefined;
                const csvLocation = row.location || (csvLocality && csvDistrict ? `${csvLocality}, ${csvDistrict}` : csvLocality || csvDistrict || null);
                const csvFullAddress = [csvLocality, csvDistrict, csvState, csvPincode ? `- ${csvPincode}` : '']
                    .filter(Boolean).join(', ').replace(', -', ' -') || undefined;

                // Compute raw price from price + price_unit
                let csvPrice: number | null = row.price ? parseFloat(row.price) : null;
                if (csvPrice && row.price_unit) {
                    if (row.price_unit.toLowerCase() === 'lakh') csvPrice *= 100000;
                    else if (row.price_unit.toLowerCase() === 'crore') csvPrice *= 10000000;
                }

                // Create inventory record
                await prisma.inventory.create({
                    data: {
                        tenant_id: tenant.id,
                        owner_id: ownerId,
                        owner_phone: ownerPhone,
                        category: row.category || 'residential',
                        type: row.type,
                        intent: row.intent,
                        location: csvLocation,
                        price: csvPrice,
                        price_unit: row.price_unit || undefined,
                        status: row.status || 'active',
                        specs: Object.keys(specs).length > 0 ? specs : null,
                        media_urls: [],
                        uploaded_by_agent_id: req.agent!.id,

                        // Classification IDs (resolved from slugs)
                        category_id: categoryId,
                        sub_category_id: subCategoryId,
                        type_id: typeId,
                        configuration_id: configurationId,

                        // Structured address fields
                        state: csvState,
                        district: csvDistrict,
                        locality: csvLocality,
                        pincode: csvPincode,
                        full_address: csvFullAddress,

                        // New fields
                        features: features || undefined,
                        furnishing: row.furnishing || undefined,
                        floor_number: row.floor_number ? parseInt(row.floor_number) : undefined,
                        total_floors: row.total_floors ? parseInt(row.total_floors) : undefined,
                        facing: row.facing || undefined,
                        property_age: row.property_age || undefined,
                        description: row.description || undefined,

                        // Key holder
                        key_holder_type: row.key_holder_type || undefined,
                        key_holder_name: row.key_holder_name || undefined,
                        key_holder_phone: row.key_holder_phone || undefined,
                    }
                });

                // Log interaction
                await prisma.interaction.create({
                    data: {
                        tenant_id: tenant.id,
                        phone_number: ownerPhone,
                        channel: 'admin',
                        direction: 'inbound',
                        event_type: 'inventory_bulk_uploaded',
                        content: `Bulk upload: ${row.type} in ${row.location || 'unknown'}, ${row.intent}`,
                        metadata: { uploaded_by: req.agent!.id, row: rowNum }
                    }
                });

                results.imported++;
            } catch (rowError: any) {
                results.errors.push(`Row ${rowNum}: ${rowError.message}`);
                results.skipped++;
            }
        }

        res.json({
            ...results,
            total: records.length,
            message: `Imported ${results.imported} of ${records.length} properties.`
        });
    } catch (error: any) {
        logger.error('Bulk upload error:', error);
        res.status(400).json({ error: `CSV parse error: ${error.message}` });
    }
});

// NOTE: bulk-template route is defined above (before auth middleware) for public access

// =============================================================
// HELPERS
// =============================================================

/**
 * Send WhatsApp welcome message with password setup link to new team member.
 */
async function sendWelcomeWhatsApp(
    phone: string, name: string, role: string,
    department: string | null, email: string,
    setupLink: string, tenantId: string,
): Promise<void> {
    const roleLabel = role === 'super_boss' ? 'Super Boss' : role === 'manager' ? 'Manager' : 'Team Member';
    const deptLine = department ? ` in *${department}*` : '';

    // WhatsApp Cloud API expects phone without '+' prefix
    const waPhone = phone.replace(/^\+/, '');

    // Send template first (opens 24h session window)
    await whatsappService.sendTemplate(waPhone, 'rp_team_welcome', {});

    // Follow up with the actual setup link as a text message
    const setupMessage = `Hi *${name}*! 👋\n\nYou've been added as *${roleLabel}*${deptLine} at Realty Pandit.\n\n📧 Email: ${email}\n\n🔐 *Set your password here:*\n${setupLink}\n\n⏳ This link is valid for *48 hours*. Click it to create your password and start using the admin panel.`;
    await whatsappService.sendText(waPhone, setupMessage);

    // SSOT: Log welcome message as interaction
    try {
        await prisma.interaction.create({
            data: {
                tenant_id: tenantId,
                phone_number: phone,
                channel: 'whatsapp',
                direction: 'outbound',
                event_type: 'welcome_message_sent',
                content: `Welcome message sent to ${name} with password setup link`,
                metadata: { email, role, setup_link_sent: true },
            },
        });
    } catch (err) {
        logger.warn(`[Team] Failed to log welcome interaction: ${(err as Error).message}`);
    }
}

function generateTempPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$';
    let password = '';
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

export default router;
