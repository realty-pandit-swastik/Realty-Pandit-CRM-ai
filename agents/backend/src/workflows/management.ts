
import prisma from '../db';
import { LLMService } from '../services/llm';
import logger from '../utils/logger';

export class ManagementCommandWorkflow {
    private llmService: LLMService;

    constructor() {
        this.llmService = new LLMService();
    }

    /**
     * Handles WhatsApp commands from management users.
     * Commands: "leads", "report", "assign", "team", "help"
     */
    public async handle(contact: any, message: string): Promise<any> {
        logger.info(`[Management] Command from ${contact.phone_number}: ${message}`);
        const msg = message.toLowerCase().trim();

        // Command: Show today's leads
        if (msg.includes('lead') || msg.includes('today')) {
            return this.getLeadsSummary();
        }

        // Command: Daily report
        if (msg.includes('report') || msg.includes('stats') || msg.includes('summary')) {
            return this.getDailyReport();
        }

        // Command: Team status
        if (msg.includes('team') || msg.includes('agent') || msg.includes('employee')) {
            return this.getTeamStatus();
        }

        // Command: Help
        if (msg.includes('help') || msg.includes('command')) {
            return {
                action: 'reply',
                reply_script: `*Panditji Management Commands:*\n\n` +
                    `1. "leads" or "today" - Show today's leads\n` +
                    `2. "report" or "stats" - Daily report\n` +
                    `3. "team" - Team status\n` +
                    `4. "help" - Show this menu`
            };
        }

        // Default: Use AI to handle general management queries
        const systemPrompt = `You are Panditji, the AI assistant. The user is a management team member.
        Help them with business queries about leads, properties, and team management.
        Keep responses professional and data-driven.`;

        const reply = await this.llmService.generateResponseWithHistory(
            systemPrompt, message, contact.phone_number
        );
        return { action: 'reply', reply_script: reply };
    }

    private async getLeadsSummary() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [newLeads, hotLeads, totalContacts] = await Promise.all([
            prisma.contact.count({ where: { created_at: { gte: today } } }),
            prisma.contact.count({ where: { lead_status: 'hot' } }),
            prisma.contact.count()
        ]);

        const reply = `*Today's Lead Summary:*\n\n` +
            `New leads today: ${newLeads}\n` +
            `Hot leads: ${hotLeads}\n` +
            `Total contacts: ${totalContacts}`;

        return { action: 'reply', reply_script: reply };
    }

    private async getDailyReport() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [interactions, newContacts, activeInventory] = await Promise.all([
            prisma.interaction.count({ where: { created_at: { gte: today } } }),
            prisma.contact.count({ where: { created_at: { gte: today } } }),
            prisma.inventory.count({ where: { status: 'active' } })
        ]);

        const contactsByType = await prisma.contact.groupBy({
            by: ['contact_type'],
            _count: true
        });

        const typeBreakdown = contactsByType.map(t => `  ${t.contact_type}: ${t._count}`).join('\n');

        const reply = `*Daily Report:*\n\n` +
            `Interactions today: ${interactions}\n` +
            `New contacts: ${newContacts}\n` +
            `Active properties: ${activeInventory}\n\n` +
            `*Contact Types:*\n${typeBreakdown}`;

        return { action: 'reply', reply_script: reply };
    }

    private async getTeamStatus() {
        const agents = await prisma.agent.findMany({
            select: {
                name: true, role: true, status: true,
                _count: { select: { assigned_leads: true } }
            }
        });

        if (agents.length === 0) {
            return { action: 'reply', reply_script: 'No team members registered yet.' };
        }

        const teamList = agents.map(a =>
            `${a.name} (${a.role}) - ${a.status} - ${a._count.assigned_leads} leads`
        ).join('\n');

        return {
            action: 'reply',
            reply_script: `*Team Status:*\n\n${teamList}`
        };
    }
}
