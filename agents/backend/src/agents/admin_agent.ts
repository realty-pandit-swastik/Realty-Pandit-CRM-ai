/**
 * Admin Agent — Handles management commands and reporting.
 *
 * Wraps the existing ManagementCommandWorkflow as a BaseAgent.
 * Commands: leads, report, team, appointments, help
 *
 * All date calculations use IST (Indian Standard Time, UTC+5:30).
 */

import { BaseAgent, AgentContext, AgentResponse } from './types';
import { SystemPromptService } from '../services/system_prompt';
import { LLMService } from '../services/llm';
import prisma from '../db';
import logger from '../utils/logger';
import { phoneVariants } from '../utils/phone';

/** Get IST midnight for a given day offset (0=today, -1=yesterday, +1=tomorrow) */
function getISTDayRange(dayOffset: number): { start: Date; end: Date } {
    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);

    // IST midnight of today
    const istMidnight = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
    // Apply offset days
    istMidnight.setUTCDate(istMidnight.getUTCDate() + dayOffset);

    // Convert IST midnight back to UTC (subtract 5:30)
    const startUTC = new Date(istMidnight.getTime() - istOffsetMs);
    const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000);

    return { start: startUTC, end: endUTC };
}

/** Parse "yesterday", "today", "tomorrow", "kal", "aaj" from message */
function parseDayOffset(msg: string): number {
    if (msg.includes('yesterday') || msg.includes('kal') || msg.includes('parso')) return -1;
    if (msg.includes('tomorrow')) return 1;
    return 0; // default to today
}

export class AdminAgent implements BaseAgent {
    readonly name = 'admin' as const;
    private llmService: LLMService;

    constructor() {
        this.llmService = new LLMService();
    }

    /**
     * Look up the sender's Agent profile from the Agent table by phone number.
     * Returns name, role, department so the AI knows WHO is talking.
     */
    private async lookupSenderProfile(phone: string): Promise<{ name: string; role: string; department: string | null } | null> {
        try {
            const agent = await prisma.agent.findFirst({
                where: { phone: { in: phoneVariants(phone) }, status: 'active' },
                select: { name: true, role: true, department: true },
            });
            return agent;
        } catch (err) {
            logger.error('[AdminAgent] Failed to lookup sender profile:', err);
            return null;
        }
    }

    async handle(context: AgentContext): Promise<AgentResponse> {
        const { contact, message } = context;
        logger.info(`[AdminAgent] Command from ${contact.phone_number}: ${message}`);
        const msg = message.toLowerCase().trim();

        // Look up the sender's Agent profile for personalized responses
        const senderProfile = await this.lookupSenderProfile(contact.phone_number);
        const senderName = senderProfile?.name || contact.name || 'Team Member';
        const senderRole = senderProfile?.role || 'employee';

        // Command: Appointments
        if (msg.includes('appointment') || msg.includes('booking') || msg.includes('visit') || msg.includes('schedule')) {
            return this.getAppointmentsSummary(msg);
        }

        // Command: Show today's leads
        if (msg.includes('lead') || (msg.includes('today') && !msg.includes('appointment'))) {
            return this.getLeadsSummary(msg);
        }

        // Command: Daily report
        if (msg.includes('report') || msg.includes('stats') || msg.includes('summary')) {
            return this.getDailyReport(msg);
        }

        // Command: Team status
        if (msg.includes('team') || msg.includes('agent') || msg.includes('employee')) {
            return this.getTeamStatus();
        }

        // Command: Inventory upload — redirect to proper workflow
        if (msg.includes('inventory') || msg.includes('upload') || (msg.includes('add') && msg.includes('property'))) {
            return {
                action: 'reply',
                reply_script: `*${senderName}, to upload inventory please send one of these messages:*\n\n` +
                    `- "upload property"\n` +
                    `- "add property"\n` +
                    `- "new listing"\n` +
                    `- "property list karo"\n\n` +
                    `This will start the step-by-step inventory upload wizard where I'll guide you through each detail one by one. 🏠`,
                quality_hint: 'confident',
            };
        }

        // Command: Help
        if (msg.includes('help') || msg.includes('command')) {
            return {
                action: 'reply',
                reply_script: `*Hi ${senderName}! Panditji Management Commands:*\n\n` +
                    `1. "leads" or "today" - Show today's leads\n` +
                    `2. "appointments" - Show appointments (add "yesterday"/"tomorrow")\n` +
                    `3. "report" or "stats" - Daily report\n` +
                    `4. "team" - Team status\n` +
                    `5. "upload property" - Start inventory upload wizard\n` +
                    `6. "help" - Show this menu`,
                quality_hint: 'confident',
            };
        }

        // Default: AI-powered management query with date context
        const coreBehavior = await SystemPromptService.getCoreBehavior(contact.preferred_language);
        const systemPrompt = `${coreBehavior}

        CONTEXT:
        - Role: Management Assistant
        - You are talking to: ${senderName} (${senderRole}${senderProfile?.department ? ', ' + senderProfile.department : ''})
        - Phone: ${contact.phone_number}
        - You KNOW this person. They are a team member of Realty Pandit.
        - If they ask "do you know me?" or "mera naam kya hai?" — YES, you know them. Greet them by name: "${senderName}".
        - Help them with business queries about leads, properties, appointments, and team management.
        - Keep responses professional and data-driven.
        - If the user asks about data you don't have, say so clearly.
        - CRITICAL: You CANNOT create, upload, or add inventory/property to the database. NEVER claim to have uploaded, saved, or added any property.
        - If the user wants to upload property/inventory, tell them to send "upload property" to start the guided inventory wizard.
        - NEVER fabricate or hallucinate inventory data, property names, or claim actions you cannot perform.`;

        const reply = await this.llmService.generateResponseWithHistory(
            systemPrompt, message, contact.phone_number,
        );
        return {
            action: 'reply',
            reply_script: reply,
            quality_hint: 'confident',
        };
    }

    private async getAppointmentsSummary(msg: string): Promise<AgentResponse> {
        const dayOffset = parseDayOffset(msg);
        const { start, end } = getISTDayRange(dayOffset);
        const dayLabel = dayOffset === -1 ? 'Yesterday' : dayOffset === 1 ? 'Tomorrow' : 'Today';

        try {
            const appointments = await prisma.appointment.findMany({
                where: {
                    scheduled_at: { gte: start, lt: end },
                },
                select: {
                    id: true,
                    title: true,
                    type: true,
                    status: true,
                    scheduled_at: true,
                    contact_id: true,
                },
                orderBy: { scheduled_at: 'asc' },
            });

            if (appointments.length === 0) {
                return {
                    action: 'reply',
                    reply_script: `*${dayLabel}'s Appointments:*\n\nNo appointments found for ${dayLabel.toLowerCase()}.`,
                    quality_hint: 'confident',
                    metadata: { command: 'appointments', count: 0, day: dayLabel },
                };
            }

            const lines = appointments.map((a, i) => {
                const time = new Date(a.scheduled_at.getTime() + 5.5 * 60 * 60 * 1000);
                const h = time.getUTCHours() % 12 || 12;
                const m = time.getUTCMinutes().toString().padStart(2, '0');
                const ampm = time.getUTCHours() >= 12 ? 'PM' : 'AM';
                return `${i + 1}. ${a.title || a.type} - ${h}:${m} ${ampm} - ${a.status} (${a.contact_id})`;
            });

            return {
                action: 'reply',
                reply_script: `*${dayLabel}'s Appointments (${appointments.length}):*\n\n${lines.join('\n')}`,
                quality_hint: 'confident',
                metadata: { command: 'appointments', count: appointments.length, day: dayLabel },
            };
        } catch (error) {
            logger.error('[AdminAgent] Appointments query failed:', error);
            return {
                action: 'reply',
                reply_script: `*${dayLabel}'s Appointments:*\n\nNo appointments found for ${dayLabel.toLowerCase()}.`,
                quality_hint: 'confident',
            };
        }
    }

    private async getLeadsSummary(msg: string): Promise<AgentResponse> {
        const dayOffset = parseDayOffset(msg);
        const { start, end } = getISTDayRange(dayOffset);
        const dayLabel = dayOffset === -1 ? 'Yesterday' : dayOffset === 1 ? 'Tomorrow' : 'Today';

        const [newLeads, hotLeads, totalContacts] = await Promise.all([
            prisma.contact.count({ where: { created_at: { gte: start, lt: end } } }),
            prisma.contact.count({ where: { lead_status: 'hot' } }),
            prisma.contact.count(),
        ]);

        return {
            action: 'reply',
            reply_script: `*${dayLabel}'s Lead Summary:*\n\nNew leads ${dayLabel.toLowerCase()}: ${newLeads}\nHot leads (total): ${hotLeads}\nTotal contacts: ${totalContacts}`,
            quality_hint: 'confident',
            metadata: { command: 'leads', newLeads, hotLeads, totalContacts },
        };
    }

    private async getDailyReport(msg: string): Promise<AgentResponse> {
        const dayOffset = parseDayOffset(msg);
        const { start, end } = getISTDayRange(dayOffset);
        const dayLabel = dayOffset === -1 ? 'Yesterday' : dayOffset === 1 ? 'Tomorrow' : 'Today';

        const [interactions, newContacts, activeInventory] = await Promise.all([
            prisma.interaction.count({ where: { created_at: { gte: start, lt: end } } }),
            prisma.contact.count({ where: { created_at: { gte: start, lt: end } } }),
            prisma.inventory.count({ where: { status: 'active' } }),
        ]);

        const contactsByType = await prisma.contact.groupBy({
            by: ['contact_type'],
            _count: true,
        });

        const typeBreakdown = contactsByType.map(t => `  ${t.contact_type}: ${t._count}`).join('\n');

        return {
            action: 'reply',
            reply_script: `*${dayLabel}'s Report:*\n\nInteractions: ${interactions}\nNew contacts: ${newContacts}\nActive properties: ${activeInventory}\n\n*Contact Types:*\n${typeBreakdown}`,
            quality_hint: 'confident',
            metadata: { command: 'report', interactions, newContacts, activeInventory },
        };
    }

    private async getTeamStatus(): Promise<AgentResponse> {
        const agents = await prisma.agent.findMany({
            select: {
                name: true, role: true, status: true,
                _count: { select: { assigned_leads: true } },
            },
        });

        if (agents.length === 0) {
            return {
                action: 'reply',
                reply_script: 'No team members registered yet.',
                quality_hint: 'confident',
            };
        }

        const teamList = agents.map(a =>
            `${a.name} (${a.role}) - ${a.status} - ${a._count.assigned_leads} leads`,
        ).join('\n');

        return {
            action: 'reply',
            reply_script: `*Team Status:*\n\n${teamList}`,
            quality_hint: 'confident',
            metadata: { command: 'team', agent_count: agents.length },
        };
    }
}
