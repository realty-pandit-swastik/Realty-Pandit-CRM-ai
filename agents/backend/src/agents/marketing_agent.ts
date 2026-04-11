/**
 * Marketing Agent — Campaign Management & Audience Targeting
 *
 * Handles:
 * - Creating and managing broadcast campaigns
 * - Audience segmentation (by city, budget, contact_type, property_type)
 * - Builder launch promotions (new project → notify interested contacts)
 * - Campaign analytics (sent, delivered, responded)
 *
 * Uses NotificationAgent for actual delivery.
 * Stores campaign data in Campaign table.
 */

import { NotificationAgent, NotificationChannel } from './notification_agent';
import prisma from '../db';
import { isQuietHours } from '../utils/quiet_hours';
import logger from '../utils/logger';

export interface CampaignConfig {
    name: string;
    type: 'broadcast' | 'drip' | 'launch_promo' | 'follow_up';
    channel: NotificationChannel;
    message: string;
    subject?: string;             // For email campaigns
    audience: AudienceFilter;
    scheduled_at?: Date;
    created_by?: string;
}

export interface AudienceFilter {
    contact_type?: string | { in: string[] };  // BUYER, TENANT, LANDLORD, etc.
    city?: string;                 // Location contains city
    property_type?: string;        // flat, house, plot
    budget_min?: number;
    budget_max?: number;
    lead_status?: string;          // cold, warm, hot
    lifecycle_stage?: string;      // NEW, QUALIFIED, MATCHED, etc.
    days_inactive?: number;        // No interaction in N days
}

export interface CampaignResult {
    campaign_id: string;
    name: string;
    total_audience: number;
    sent: number;
    failed: number;
    status: string;
}

export class MarketingAgent {
    private notificationAgent: NotificationAgent;

    constructor() {
        this.notificationAgent = new NotificationAgent();
    }

    /**
     * Create a new campaign (saved as draft).
     */
    async createCampaign(config: CampaignConfig): Promise<string> {
        const campaign = await prisma.campaign.create({
            data: {
                name: config.name,
                type: config.type,
                channel: config.channel,
                message: config.message,
                subject: config.subject,
                audience: config.audience as any,
                status: config.scheduled_at ? 'scheduled' : 'draft',
                scheduled_at: config.scheduled_at,
                created_by: config.created_by,
            },
        });

        logger.info(`[MarketingAgent] Campaign created: ${campaign.id} — "${config.name}" (${config.type})`);
        return campaign.id;
    }

    /**
     * Execute a campaign — find audience, send messages.
     */
    async executeCampaign(campaignId: string): Promise<CampaignResult> {
        // Block campaign execution during quiet hours (9 PM – 8 AM IST)
        if (isQuietHours()) {
            logger.warn('[MarketingAgent] Cannot send campaigns during quiet hours (9PM-8AM IST)');
            return { campaign_id: campaignId, name: 'deferred', total_audience: 0, sent: 0, failed: 0, status: 'deferred_quiet_hours' };
        }

        const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });

        if (!campaign) {
            throw new Error(`Campaign ${campaignId} not found`);
        }

        if (campaign.status === 'completed' || campaign.status === 'sending') {
            throw new Error(`Campaign ${campaignId} is already ${campaign.status}`);
        }

        // Mark as sending
        await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'sending' },
        });

        logger.info(`[MarketingAgent] Executing campaign: ${campaign.name}`);

        try {
            // Build audience
            const audience = await this.buildAudience(campaign.audience as AudienceFilter);
            logger.info(`[MarketingAgent] Audience size: ${audience.length}`);

            if (audience.length === 0) {
                await prisma.campaign.update({
                    where: { id: campaignId },
                    data: { status: 'completed', completed_at: new Date() },
                });
                return {
                    campaign_id: campaignId,
                    name: campaign.name,
                    total_audience: 0,
                    sent: 0,
                    failed: 0,
                    status: 'completed',
                };
            }

            // Extract recipient identifiers
            const recipients = campaign.channel === 'email'
                ? audience.filter(c => c.email).map(c => c.email!)
                : audience.map(c => c.phone_number);

            // Send via NotificationAgent bulk
            const result = await this.notificationAgent.sendBulk({
                recipients,
                message: campaign.message,
                channel: campaign.channel as NotificationChannel,
                subject: campaign.subject || undefined,
                campaign_id: campaignId,
                batch_size: 10,
                delay_ms: 2000, // 2s between batches for WhatsApp rate limits
            });

            // Update campaign
            await prisma.campaign.update({
                where: { id: campaignId },
                data: {
                    status: 'completed',
                    sent_count: result.sent,
                    delivered: result.sent,
                    failed_count: result.failed,
                    completed_at: new Date(),
                },
            });

            logger.info(`[MarketingAgent] Campaign "${campaign.name}" complete: ${result.sent}/${result.total} sent`);

            return {
                campaign_id: campaignId,
                name: campaign.name,
                total_audience: audience.length,
                sent: result.sent,
                failed: result.failed,
                status: 'completed',
            };

        } catch (error: any) {
            logger.error(`[MarketingAgent] Campaign "${campaign.name}" failed:`, error);

            await prisma.campaign.update({
                where: { id: campaignId },
                data: { status: 'draft' }, // Reset to draft so it can be retried
            });

            throw error;
        }
    }

    /**
     * Build audience list based on filter criteria.
     */
    async buildAudience(filter: AudienceFilter): Promise<Array<{ phone_number: string; email: string | null; name: string | null }>> {
        const where: any = {};

        if (filter.contact_type) {
            where.contact_type = filter.contact_type;
        }

        if (filter.city) {
            where.preferred_location = { contains: filter.city, mode: 'insensitive' };
        }

        if (filter.property_type) {
            where.property_type = { contains: filter.property_type, mode: 'insensitive' };
        }

        if (filter.budget_min) {
            where.budget_max = { gte: filter.budget_min };
        }

        if (filter.budget_max) {
            where.budget_min = { lte: filter.budget_max };
        }

        if (filter.lead_status) {
            where.lead_status = filter.lead_status;
        }

        if (filter.lifecycle_stage) {
            where.lifecycle_stage = filter.lifecycle_stage;
        }

        if (filter.days_inactive) {
            const inactiveSince = new Date(Date.now() - filter.days_inactive * 24 * 60 * 60 * 1000);
            where.last_interaction = { lt: inactiveSince };
        }

        const contacts = await prisma.contact.findMany({
            where,
            select: { phone_number: true, email: true, name: true },
            take: 1000, // Safety limit
        });

        return contacts;
    }

    /**
     * Get campaign by ID.
     */
    async getCampaign(campaignId: string): Promise<any> {
        return prisma.campaign.findUnique({ where: { id: campaignId } });
    }

    /**
     * List campaigns with optional filters.
     */
    async listCampaigns(status?: string, limit: number = 20): Promise<any[]> {
        return prisma.campaign.findMany({
            where: status ? { status } : undefined,
            orderBy: { created_at: 'desc' },
            take: limit,
        });
    }

    /**
     * Cancel a scheduled/draft campaign.
     */
    async cancelCampaign(campaignId: string): Promise<void> {
        await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'cancelled' },
        });
        logger.info(`[MarketingAgent] Campaign ${campaignId} cancelled`);
    }

    /**
     * Quick broadcast: Create and immediately execute a campaign.
     */
    async quickBroadcast(
        message: string,
        audience: AudienceFilter,
        channel: NotificationChannel = 'whatsapp',
        name?: string,
    ): Promise<CampaignResult> {
        const campaignId = await this.createCampaign({
            name: name || `Quick broadcast ${new Date().toLocaleDateString('en-IN')}`,
            type: 'broadcast',
            channel,
            message,
            audience,
        });

        return this.executeCampaign(campaignId);
    }

    /**
     * Builder launch promotion: Notify interested buyers about a new project.
     */
    async sendLaunchPromo(projectId: string): Promise<CampaignResult> {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { units: true },
        });

        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        // Build price range from units
        const prices = project.units
            .filter(u => u.price_min)
            .map(u => u.price_min!);
        const minPrice = prices.length > 0 ? Math.min(...prices) : null;

        const configs = project.units.map(u => u.configuration).join(', ');

        const message = `*New Project Launch!*\n\n` +
            `*${project.name}*\n` +
            `${project.city}, ${project.locality}\n` +
            `${configs}\n` +
            `${minPrice ? `Starting from ₹${(minPrice / 100000).toFixed(0)} Lakh` : ''}\n` +
            `Status: ${project.project_status.replace(/_/g, ' ')}\n` +
            `${project.rera_number ? `RERA: ${project.rera_number}` : ''}\n\n` +
            `Reply "interested" to get full details and schedule a visit.`;

        return this.quickBroadcast(
            message,
            {
                contact_type: { in: ['BUYER', 'TENANT'] },
                city: project.city,
            },
            'whatsapp',
            `Launch: ${project.name}`,
        );
    }

    /**
     * Get campaign analytics summary.
     */
    async getAnalytics(): Promise<{
        total_campaigns: number;
        total_sent: number;
        total_responded: number;
        response_rate: number;
        by_type: Array<{ type: string; count: number; sent: number }>;
    }> {
        const [total, sentSum, respondedSum, byType] = await Promise.all([
            prisma.campaign.count(),
            prisma.campaign.aggregate({ _sum: { sent_count: true } }),
            prisma.campaign.aggregate({ _sum: { responded: true } }),
            prisma.campaign.groupBy({
                by: ['type'],
                _count: true,
                _sum: { sent_count: true },
            }),
        ]);

        const totalSent = sentSum._sum.sent_count || 0;
        const totalResponded = respondedSum._sum.responded || 0;

        return {
            total_campaigns: total,
            total_sent: totalSent,
            total_responded: totalResponded,
            response_rate: totalSent > 0 ? (totalResponded / totalSent) * 100 : 0,
            by_type: byType.map(t => ({
                type: t.type,
                count: t._count,
                sent: t._sum.sent_count || 0,
            })),
        };
    }
}
