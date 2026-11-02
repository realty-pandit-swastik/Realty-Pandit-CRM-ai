import express from 'express';
import prisma from '../db';
import { authMiddleware } from '../middleware/auth';
import { CalendarService } from '../services/calendar';
import { WhatsAppService } from '../services/whatsapp';
import { notify } from '../services/notify';
import { captureRouteError } from '../utils/capture';
import { AppointmentStatus, AppointmentType, Inventory, Prisma } from '@prisma/client';
import { z } from 'zod';
import { sanitizationService } from '../services/sanitization_service';
import { normalizePhone } from '../utils/phone';
import { buildFullContactVisibilityFilter } from '../middleware/contact_visibility';
import { getTeamIds } from '../utils/team_scope';

const whatsappService = new WhatsAppService();

const router = express.Router();
const calendarService = new CalendarService();

async function appointmentResponse<T extends { property: Inventory | null }>(appointment: T, agent: NonNullable<express.Request['agent']>) {
    if (!appointment.property) return appointment;
    return { ...appointment, property: sanitizationService.redactInventoryForStaff(appointment.property, {
        agentId: agent.id,
        isSuperBoss: agent.role === 'super_boss',
        teamIds: await getTeamIds(agent),
    }) };
}

function appointmentWhere(req: express.Request): Prisma.AppointmentWhereUniqueInput {
    return { id: String(req.params.id), tenant_id: req.agent!.tenant_id,
        ...(req.agent!.role === 'employee' ? { assigned_to_agent_id: req.agent!.id } : {}),
        contact: { tenant_id: req.agent!.tenant_id },
        OR: [{ property_id: null }, { property: { tenant_id: req.agent!.tenant_id } }],
    };
}

const appointmentUpdate = z.object({
    status: z.enum(AppointmentStatus).optional(), scheduled_at: z.iso.datetime({ offset: true }).optional(),
    duration: z.number().int().positive().max(2147483647).optional(),
    description: z.string().max(20000).optional(), notes: z.string().max(20000).optional(),
    assigned_to_agent_id: z.string().min(1).optional(),
});

/**
 * GET /api/calendar/appointments
 * Get appointments for the authenticated user (based on role)
 * Query params: startDate, endDate, status, type
 */
router.get('/appointments', authMiddleware, async (req, res) => {
    try {
        const { role, id: userId, phone } = req.agent!;
        const { startDate, endDate, status, type, contact_id } = req.query;

        // Build filter based on role
        let whereClause: any = {
            tenant_id: req.agent!.tenant_id,
            AND: [
                { contact: { tenant_id: req.agent!.tenant_id } },
                { OR: [{ property_id: null }, { property: { tenant_id: req.agent!.tenant_id } }] },
            ],
        };
        if (req.query.mine === 'true') whereClause.assigned_to_agent_id = userId;
        if (req.query.upcoming === 'true') whereClause.AND.push({ status: { notIn: ['completed', 'cancelled', 'no_show', 'requested'] } });
        const paginated = req.query.page !== undefined || req.query.limit !== undefined;
        const page = Number(req.query.page || 1), limit = Number(req.query.limit || 25);
        if (paginated && (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100)) {
            return res.status(400).json({ error: 'Invalid pagination. Limit must be 1–100.' });
        }

        // Date range filter
        if (startDate || endDate) {
            whereClause.scheduled_at = {};
            if (startDate) whereClause.scheduled_at.gte = new Date(startDate as string);
            if (endDate) whereClause.scheduled_at.lte = new Date(endDate as string);
        }

        // Status filter
        if (status) {
            whereClause.status = status;
        }

        // Type filter
        if (type) {
            whereClause.type = type;
        }

        // Contact filter (for lead slide-over visit history)
        if (contact_id) {
            whereClause.contact_id = contact_id as string;
        }

        // Role-based filtering
        if (role === 'employee') {
            // Employees see only their assigned appointments
            whereClause.assigned_to_agent_id = userId;
        } else if (role === 'builder') {
            // Builders see appointments for their properties
            whereClause.property = {
                owner: {
                    contact_phone: phone,
                    externalType: 'REAL_ESTATE_BUILDER'
                }
            };
        } else if (role === 'agent') {
            // External agents see appointments for their properties
            whereClause.property = {
                owner: {
                    contact_phone: phone,
                    externalType: 'PROPERTY_AGENT'
                }
            };
        }

        const appointments = await prisma.appointment.findMany({
            where: whereClause,
            ...(paginated ? { take: limit, skip: (page - 1) * limit } : {}),
            include: {
                contact: {
                    select: {
                        phone_number: true,
                        name: true,
                        email: true,
                    },
                },
                property: {
                    select: {
                        id: true,
                        location: true,
                        type: true,
                        price: true,
                        specs: true,
                    },
                },
                assigned_to_agent: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    },
                },
            },
            orderBy: [{ scheduled_at: 'asc' }, { id: 'asc' }],
        });

        return res.json({
            success: true,
            appointments,
            count: appointments.length,
            ...(paginated ? { total: await prisma.appointment.count({ where: whereClause }), page, limit } : {}),
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'calendar#1' });
        console.error('Get appointments error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch appointments',
            error: error.message,
        });
    }
});

/**
 * GET /api/calendar/appointments/:id
 * Get single appointment details
 */
router.get('/appointments/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const appointment = await prisma.appointment.findUnique({
            where: appointmentWhere(req),
            include: {
                contact: true,
                property: true,
                assigned_to_agent: { select: { id: true, name: true, email: true, phone: true } },
                tenant: true,
            },
        });

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found',
            });
        }

        return res.json({
            success: true,
            appointment: await appointmentResponse(appointment, req.agent!),
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'calendar#2' });
        console.error('Get appointment error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch appointment',
            error: error.message,
        });
    }
});

/**
 * POST /api/calendar/appointments
 * Create a new appointment
 */
router.post('/appointments', authMiddleware, async (req, res) => {
    try {
        let {
            contact_id,
            title,
            description,
            notes,
            type,
            scheduled_at,
            duration = 30,
            assigned_to_agent_id,
            property_id,
            location,
            source,
            channel,
        } = req.body;

        // Validate required fields
        if (!contact_id || !title || !type || !scheduled_at) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: contact_id, title, type, scheduled_at',
            });
        }

                const actor = req.agent!;
        if (!['super_boss', 'manager', 'employee'].includes(actor.role)) return res.status(403).json({ error: 'Staff authentication required' });
        if (typeof contact_id !== 'string' || typeof title !== 'string' || !title.trim() || title.length > 500 ||
            !Object.values(AppointmentType).includes(type) || typeof scheduled_at !== 'string' || !Number.isFinite(new Date(scheduled_at).getTime()) ||
            !Number.isInteger(Number(duration)) || Number(duration) <= 0 || Number(duration) > 1440 ||
            (notes !== undefined && (typeof notes !== 'string' || notes.length > 20000)) ||
            (description !== undefined && (typeof description !== 'string' || description.length > 20000))) return res.status(400).json({ error: 'Check the contact, visit type, date, duration and notes' });
        const normalizedContact = normalizePhone(contact_id);
        if (!normalizedContact) return res.status(400).json({ error: 'Enter a valid CRM contact phone' });
        const contact = await prisma.contact.findFirst({ where: { phone_number: normalizedContact, tenant_id: actor.tenant_id,
            AND: [await buildFullContactVisibilityFilter(actor.id, actor.role)] }, select: { phone_number: true } });
        if (!contact) return res.status(404).json({ error: 'Contact is not accessible to your account' });
        if (property_id && (typeof property_id !== 'string' || !await prisma.inventory.findFirst({ where: { id: property_id, tenant_id: actor.tenant_id }, select: { id: true } }))) return res.status(404).json({ error: 'Property is not available' });
        const assignee = assigned_to_agent_id || actor.id;
        const team = await getTeamIds(actor);
        if (typeof assignee !== 'string' || (actor.role !== 'super_boss' && !team.includes(assignee)) ||
            !await prisma.agent.findFirst({ where: { id: assignee, tenant_id: actor.tenant_id, status: 'active' }, select: { id: true } })) return res.status(400).json({ error: 'Choose an active authorized team member' });
        contact_id = normalizedContact;
        assigned_to_agent_id = assignee;
        duration = Number(duration);

        // Calculate end_time
        const scheduledDate = new Date(scheduled_at);
        const endTime = new Date(scheduledDate.getTime() + duration * 60000);

        const appointment = await prisma.appointment.create({
            data: {
                contact_id,
                title,
                description,
                notes,
                type,
                scheduled_at: scheduledDate,
                duration,
                end_time: endTime,
                assigned_to_agent_id,
                property_id,
                location,
                source: source || 'manual',
                channel: channel || 'website',
                status: 'scheduled',
                tenant_id: req.agent!.tenant_id,
            },
            include: {
                contact: true,
                property: true,
                assigned_to_agent: { select: { id: true, name: true, email: true, phone: true } },
            },
        });

        // Send WhatsApp reminder if contact has phone
        await calendarService.sendAppointmentReminder(appointment.id);

        // Notify inventory agent (fire-and-forget) — masked buyer details, full visit info
        if (type === 'property_visit' && property_id && appointment.property) {
            try {
                const inv = await prisma.inventory.findUnique({
                    where: { id: property_id },
                    select: {
                        uploaded_by_agent_id: true,
                        uploaded_by_agent: { select: { phone: true, name: true } },
                    },
                });
                if (inv?.uploaded_by_agent?.phone) {
                    const agentWaPhone = inv.uploaded_by_agent.phone.replace(/^\+/, '');
                    const maskedBuyer = contact_id.replace(/^(\+?\d{2})(\d{3})(\d+)(\d{2})$/, '$1$2XXXXX$4');
                    const visitDate = scheduledDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                    const visitTime = scheduledDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                    const message = [
                        `*Visit Scheduled for Your Property*`,
                        ``,
                        `A buyer has scheduled a visit for your property.`,
                        `*Property:* ${appointment.property.type || 'Property'} in ${(appointment.property as any).location || property_id}`,
                        `*Visit Date:* ${visitDate} at ${visitTime}`,
                        `*Buyer:* ${maskedBuyer} (contact details via your CRM coordinator)`,
                        ``,
                        `Our team will coordinate the visit details with you shortly.`,
                        `\u2013 Realty Pandit`,
                    ].join('\n');
                    whatsappService.sendText(agentWaPhone, message)
                        .catch(err => console.warn('[Calendar] Inventory agent WA failed:', err.message));
                }
            } catch (notifyErr) {
                console.warn('[Calendar] Inventory agent notification error:', notifyErr);
            }
        }

        // Log interaction
        await prisma.interaction.create({
            data: {
                tenant_id: req.agent!.tenant_id,
                phone_number: contact_id,
                channel: channel || 'website',
                direction: 'outbound',
                event_type: 'appointment_created',
                content: `Appointment created: ${title} at ${scheduled_at}`,
            },
        });

        // Notify assigned agent (if different from creator)
        if (appointment.agent_id && appointment.agent_id !== req.agent!.id) {
            const assignedAgent = await prisma.agent.findUnique({ where: { id: appointment.agent_id }, select: { id: true, phone: true, email: true, name: true } });
            if (assignedAgent) {
                notify('appointment_created', [{ id: assignedAgent.id, type: 'agent', phone: assignedAgent.phone, email: assignedAgent.email || undefined, name: assignedAgent.name }], {
                    property_info: title || 'property visit', date: new Date(scheduled_at).toLocaleDateString('en-IN'), time: new Date(scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                });
            }
        }

        return res.json({
            success: true,
            appointment: await appointmentResponse(appointment, req.agent!),
            message: 'Appointment created successfully',
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'calendar#3' });
        console.error('Create appointment error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create appointment',
            error: error.message,
        });
    }
});

/**
 * PATCH /api/calendar/appointments/:id
 * Update appointment (status, reschedule, etc.)
 */
router.patch('/appointments/:id', authMiddleware, async (req, res) => {
    try {
        const current = await prisma.appointment.findUnique({ where: appointmentWhere(req), select: { scheduled_at: true, duration: true } });
        if (!current) return res.status(404).json({ error: 'Appointment not found' });
        const parsed = appointmentUpdate.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Invalid appointment fields, status or date.' });
        const { status, scheduled_at, duration, assigned_to_agent_id, ...fields } = parsed.data;
        if (assigned_to_agent_id && ((req.agent!.role === 'employee' && assigned_to_agent_id !== req.agent!.id) ||
            !await prisma.agent.findFirst({ where: { id: assigned_to_agent_id, tenant_id: req.agent!.tenant_id, status: 'active' }, select: { id: true } }))) {
            return res.status(403).json({ error: 'Assignee is outside your access.' });
        }
        const updateData: Prisma.AppointmentUncheckedUpdateInput = { ...fields, status, assigned_to_agent_id };
        if (scheduled_at !== undefined || duration !== undefined) {
            const date = scheduled_at ? new Date(scheduled_at) : current.scheduled_at;
            updateData.scheduled_at = date;
            updateData.duration = duration ?? current.duration;
            updateData.end_time = new Date(date.getTime() + (duration ?? current.duration) * 60000);
        }

        const appointment = await prisma.appointment.update({
            where: appointmentWhere(req),
            data: updateData,
            include: {
                contact: true,
                property: true,
                assigned_to_agent: { select: { id: true, name: true, email: true, phone: true } },
            },
        });

        // Log status change
        if (status) {
            await prisma.interaction.create({
                data: {
                    tenant_id: appointment.tenant_id,
                    phone_number: appointment.contact_id,
                    channel: appointment.channel || 'website',
                    direction: 'outbound',
                    event_type: 'appointment_updated',
                    content: `Appointment status changed to: ${status}`,
                },
            });
        }

        // Notify on reschedule
        if (scheduled_at && appointment.assigned_to_agent_id) {
            const assignedAgent = await prisma.agent.findUnique({ where: { id: appointment.assigned_to_agent_id }, select: { id: true, phone: true, email: true, name: true } });
            if (assignedAgent && assignedAgent.id !== req.agent!.id) {
                notify('appointment_rescheduled', [{ id: assignedAgent.id, type: 'agent', phone: assignedAgent.phone, email: assignedAgent.email || undefined, name: assignedAgent.name }], {
                    property_info: appointment.title || 'property visit', new_date: new Date(scheduled_at).toLocaleDateString('en-IN'), new_time: new Date(scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                });
            }
        }

        return res.json({
            success: true,
            appointment: await appointmentResponse(appointment, req.agent!),
            message: 'Appointment updated successfully',
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'calendar#4' });
        console.error('Update appointment error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update appointment',
            error: error.message,
        });
    }
});

/**
 * DELETE /api/calendar/appointments/:id
 * Cancel/delete appointment
 */
router.delete('/appointments/:id', authMiddleware, async (req, res) => {
    try {
        if (!await prisma.appointment.findUnique({ where: appointmentWhere(req), select: { id: true } })) return res.status(404).json({ error: 'Appointment not found' });

        const appointment = await prisma.appointment.update({
            where: appointmentWhere(req),
            data: { status: 'cancelled' },
        });

        // Log cancellation
        await prisma.interaction.create({
            data: {
                tenant_id: appointment.tenant_id,
                phone_number: appointment.contact_id,
                channel: appointment.channel || 'website',
                direction: 'outbound',
                event_type: 'appointment_cancelled',
                content: `Appointment cancelled: ${appointment.title}`,
            },
        });

        // Notify assigned agent about cancellation
        if (appointment.assigned_to_agent_id && appointment.assigned_to_agent_id !== req.agent!.id) {
            const assignedAgent = await prisma.agent.findUnique({ where: { id: appointment.assigned_to_agent_id }, select: { id: true, phone: true, email: true, name: true } });
            if (assignedAgent) {
                notify('appointment_cancelled', [{ id: assignedAgent.id, type: 'agent', phone: assignedAgent.phone, email: assignedAgent.email || undefined, name: assignedAgent.name }], {
                    property_info: appointment.title || 'property visit',
                });
            }
        }

        return res.json({
            success: true,
            message: 'Appointment cancelled successfully',
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'calendar#5' });
        console.error('Cancel appointment error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to cancel appointment',
            error: error.message,
        });
    }
});

/**
 * GET /api/calendar/summary
 * Get calendar summary (upcoming, today, this week counts)
 */
router.get('/summary', authMiddleware, async (req, res) => {
    try {
        const { role, id: userId, phone } = req.agent!;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() + 7);

        // Build base filter
        let baseFilter: any = {
            tenant_id: req.agent!.tenant_id,
        };

        // Role-based filtering (same as appointments endpoint)
        if (role === 'employee') {
            baseFilter.assigned_to_agent_id = userId;
        } else if (role === 'builder') {
            baseFilter.property = {
                owner: {
                    contact_phone: phone,
                    externalType: 'REAL_ESTATE_BUILDER'
                }
            };
        } else if (role === 'agent') {
            baseFilter.property = {
                owner: {
                    contact_phone: phone,
                    externalType: 'PROPERTY_AGENT'
                }
            };
        }

        // Count today's appointments
        const todayCount = await prisma.appointment.count({
            where: {
                ...baseFilter,
                scheduled_at: {
                    gte: today,
                    lt: tomorrow,
                },
                status: {
                    notIn: ['cancelled', 'completed'],
                },
            },
        });

        // Count this week's appointments
        const weekCount = await prisma.appointment.count({
            where: {
                ...baseFilter,
                scheduled_at: {
                    gte: today,
                    lt: weekEnd,
                },
                status: {
                    notIn: ['cancelled', 'completed'],
                },
            },
        });

        // Count pending appointments
        const pendingCount = await prisma.appointment.count({
            where: {
                ...baseFilter,
                status: 'scheduled',
                scheduled_at: {
                    gte: now,
                },
            },
        });

        return res.json({
            success: true,
            summary: {
                today: todayCount,
                this_week: weekCount,
                pending: pendingCount,
            },
        });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'calendar#6' });
        console.error('Get calendar summary error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch calendar summary',
            error: error.message,
        });
    }
});

export default router;
