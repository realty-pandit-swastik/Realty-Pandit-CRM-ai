import express from 'express';
import prisma from '../db';
import { authMiddleware } from '../middleware/auth';
import { CalendarService } from '../services/calendar';
import { WhatsAppService } from '../services/whatsapp';
import { notify } from '../services/notify';

const whatsappService = new WhatsAppService();

const router = express.Router();
const calendarService = new CalendarService();

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
        };

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
            orderBy: {
                scheduled_at: 'asc',
            },
        });

        return res.json({
            success: true,
            appointments,
            count: appointments.length,
        });
    } catch (error: any) {
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
            where: { id },
            include: {
                contact: true,
                property: true,
                assigned_to_agent: true,
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
            appointment,
        });
    } catch (error: any) {
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
        const {
            contact_id,
            title,
            description,
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

        // Calculate end_time
        const scheduledDate = new Date(scheduled_at);
        const endTime = new Date(scheduledDate.getTime() + duration * 60000);

        const appointment = await prisma.appointment.create({
            data: {
                contact_id,
                title,
                description,
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
                assigned_to_agent: true,
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
            appointment,
            message: 'Appointment created successfully',
        });
    } catch (error: any) {
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
        const { id } = req.params;
        const {
            status,
            scheduled_at,
            duration,
            description,
            notes,
            assigned_to_agent_id,
        } = req.body;

        const updateData: any = {};

        if (status) updateData.status = status;
        if (description) updateData.description = description;
        if (notes) updateData.notes = notes;
        if (assigned_to_agent_id) updateData.assigned_to_agent_id = assigned_to_agent_id;

        if (scheduled_at) {
            const scheduledDate = new Date(scheduled_at);
            updateData.scheduled_at = scheduledDate;

            if (duration) {
                updateData.duration = duration;
                updateData.end_time = new Date(scheduledDate.getTime() + duration * 60000);
            }
        }

        const appointment = await prisma.appointment.update({
            where: { id },
            data: updateData,
            include: {
                contact: true,
                property: true,
                assigned_to_agent: true,
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
            appointment,
            message: 'Appointment updated successfully',
        });
    } catch (error: any) {
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
        const { id } = req.params;

        const appointment = await prisma.appointment.update({
            where: { id },
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
        console.error('Get calendar summary error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch calendar summary',
            error: error.message,
        });
    }
});

export default router;
