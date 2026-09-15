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

        // Owner/management greeting → daily digest (2026-06-12). admin_agent is only reached by
        // management/owner senders, so a short greeting here means "give me today's snapshot"
        // instead of a bare "good morning to you too".
        if (/^(good\s*(morning|afternoon|evening|day)|morning|gm|namaste|namaskar|hello+|hi+|hey|subah|shubh)\b/i.test(msg) && msg.length < 28) {
            return this.getOwnerDigest(senderName);
        }

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
                    `6. "show 2 BHK flats in Noida" - Search properties\n` +
                    `7. "help" - Show this menu`,
                quality_hint: 'confident',
            };
        }

        // Command: Property search — "show me 2 BHK flats in Vaishali", "find properties", "catalogue"
        if (this.isPropertySearchMessage(msg)) {
            return this.searchPropertiesForAdmin(msg, senderName);
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

        const TYPE_LABELS: Record<string, string> = {
            BUYER: 'Buyers', TENANT: 'Tenants', LANDLORD: 'Landlords',
            PARTNER_AGENT: 'Partner Agents', REAL_ESTATE_BUILDER: 'Builders',
            MANAGEMENT: 'Team Members', UNKNOWN: 'Unclassified'
        };
        const typeBreakdown = contactsByType.map(t => `  ${TYPE_LABELS[t.contact_type] || t.contact_type}: ${t._count}`).join('\n');

        return {
            action: 'reply',
            reply_script: `*${dayLabel}'s Report:*\n\nInteractions: ${interactions}\nNew contacts: ${newContacts}\nActive properties: ${activeInventory}\n\n*Contact Types:*\n${typeBreakdown}`,
            quality_hint: 'confident',
            metadata: { command: 'report', interactions, newContacts, activeInventory },
        };
    }

    /** Owner/management daily digest — today's leads, hot, visits, deals needing action, inventory. */
    private async getOwnerDigest(senderName: string): Promise<AgentResponse> {
        const { start, end } = getISTDayRange(0);
        try {
            const [newLeads, hotLeads, appts, newDeals, qualifiedDeals, activeInv, recycledToday, recycledEver] = await Promise.all([
                prisma.contact.count({ where: { created_at: { gte: start, lt: end }, contact_type: { in: ['BUYER', 'TENANT', 'UNKNOWN'] } } }),
                prisma.contact.count({ where: { lead_status: 'hot' } }),
                prisma.appointment.findMany({
                    where: { scheduled_at: { gte: start, lt: end } },
                    select: { title: true, type: true, status: true, scheduled_at: true, contact_id: true },
                    orderBy: { scheduled_at: 'asc' }, take: 10,
                }),
                prisma.transaction.count({ where: { status: 'NEW', ai_paused: false } }),
                prisma.transaction.count({ where: { status: 'QUALIFIED' } }),
                prisma.inventory.count({ where: { status: 'active' } }),
                prisma.interaction.count({ where: { event_type: 'lead_recycled', created_at: { gte: start, lt: end } } }),
                prisma.interaction.count({ where: { event_type: 'lead_recycled' } }),
            ]);

            const apptLines = appts.length
                ? appts.map((a, i) => {
                    const t = new Date(a.scheduled_at.getTime() + 5.5 * 60 * 60 * 1000);
                    const h = t.getUTCHours() % 12 || 12;
                    const m = t.getUTCMinutes().toString().padStart(2, '0');
                    const ap = t.getUTCHours() >= 12 ? 'PM' : 'AM';
                    return `   ${i + 1}. ${a.title || a.type} — ${h}:${m} ${ap} (${a.status})`;
                }).join('\n')
                : '   None today';

            const script =
                `🌅 *Good morning, ${senderName}!* Aaj ka snapshot:\n\n` +
                `📥 *New leads today:* ${newLeads}\n` +
                `🔥 *Hot leads:* ${hotLeads}\n\n` +
                `📅 *Today's visits (${appts.length}):*\n${apptLines}\n\n` +
                `🤝 *Deals needing action:* ${newDeals} new · ${qualifiedDeals} qualified\n` +
                `🏠 *Active inventory:* ${activeInv}\n` +
                `♻️ *Recycled stock leads:* ${recycledToday} today · ${recycledEver} total\n\n` +
                `_Reply "leads", "appointments", "report" or "team" for details._`;

            return { action: 'reply', reply_script: script, quality_hint: 'confident', metadata: { command: 'owner_digest', newLeads, hotLeads, appts: appts.length, newDeals, qualifiedDeals } };
        } catch (err) {
            logger.error('[AdminAgent] Owner digest failed:', err);
            return { action: 'reply', reply_script: `Good morning, ${senderName}! 🙏 (Digest abhi unavailable — "report" type karein stats ke liye.)`, quality_hint: 'confident' };
        }
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

    private isPropertySearchMessage(msg: string): boolean {
        const propertyWords = ['bhk', 'flat', 'flats', 'villa', 'plot', 'apartment', 'property', 'properties', 'house', 'homes', 'catalogue', 'catalog'];
        const searchWords = ['show', 'search', 'find', 'give', 'send', 'dikh', 'batao', 'chahiye'];
        const hasProperty = propertyWords.some(k => msg.includes(k));
        const hasSearch = searchWords.some(k => msg.includes(k));
        return hasProperty && (hasSearch || msg.includes(' in ') || msg.includes(' me '));
    }

    private extractPropertyFilters(msg: string): { city?: string; bhk?: number; intent?: string } {
        const filters: { city?: string; bhk?: number; intent?: string } = {};
        const bhkMatch = msg.match(/(\d)\s*bhk/i) || msg.match(/(\d)\s*bedroom/i);
        if (bhkMatch) filters.bhk = parseInt(bhkMatch[1], 10);
        if (/\b(buy|purchase|kharid)\b/i.test(msg)) filters.intent = 'buy';
        else if (/\b(rent|lease|kiraye)\b/i.test(msg)) filters.intent = 'rent';
        const cities = ['vaishali', 'delhi', 'noida', 'gurgaon', 'gurugram', 'greater noida', 'faridabad', 'ghaziabad', 'indirapuram', 'dwarka', 'rohini', 'janakpuri'];
        for (const city of cities) {
            if (msg.includes(city)) { filters.city = city; break; }
        }
        return filters;
    }

    private async searchPropertiesForAdmin(msg: string, senderName: string): Promise<AgentResponse> {
        const { city, bhk, intent } = this.extractPropertyFilters(msg);
        try {
            const where: any = { status: 'active' };
            if (city) where.city = { contains: city, mode: 'insensitive' };
            if (intent === 'buy') where.intent = 'sell';
            else if (intent === 'rent') where.intent = { in: ['rent', 'rent_lease', 'lease'] };

            const properties = await prisma.inventory.findMany({
                where,
                take: 10,
                orderBy: { created_at: 'desc' },
                select: { id: true, apartment_name: true, display_price: true, specs: true, type: true, city: true, locality: true },
            });

            const filtered = bhk
                ? properties.filter((p: any) => (p.specs as any)?.bedrooms === bhk)
                : properties;

            if (filtered.length === 0) {
                const desc = [bhk ? `${bhk} BHK` : '', city || ''].filter(Boolean).join(' in ') || 'matching';
                return {
                    action: 'reply',
                    reply_script: `${senderName}, koi ${desc} property nahi mili. Filters change karke dobara try karein.`,
                    quality_hint: 'confident',
                };
            }

            const lines = filtered.slice(0, 5).map((p: any, i: number) => {
                const name = (p.apartment_name as string) || (p.type as string) || 'Property';
                const loc = [p.locality, p.city].filter(Boolean).join(', ');
                const price = p.display_price ? `₹${Number(p.display_price).toLocaleString('en-IN')}` : '';
                const beds = (p.specs as any)?.bedrooms ? `${(p.specs as any).bedrooms} BHK ` : '';
                return `${i + 1}. ${beds}${name} in ${loc} ${price}\nhttps://www.realtypandit.in/properties/${p.id}`;
            });

            return {
                action: 'reply',
                reply_script: `*${filtered.length} Properties Found:*\n\n${lines.join('\n\n')}`,
                quality_hint: 'confident',
                metadata: { command: 'search_properties', count: filtered.length },
            };
        } catch (error) {
            logger.error('[AdminAgent] Property search failed:', error);
            return {
                action: 'reply',
                reply_script: `${senderName}, property search mein error aa gayi. Please try again.`,
                quality_hint: 'confident',
            };
        }
    }
}
