
import prisma from '../db';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';

export class LeadScoreService {

    /**
     * Initializes a lead score record for a new contact.
     */
    public async initScore(phoneNumber: string, tenantId: string) {
        const phone = normalizePhone(phoneNumber);
        try {
            await prisma.leadScore.create({
                data: {
                    phone_number: phone,
                    tenant_id: tenantId,
                    last_updated_at: new Date()
                }
            });
            logger.info(`[LeadScore] Initialized for ${phone}`);
        } catch (error) {
            // Ignore unique constraint errors (already exists)
            logger.info(`[LeadScore] Record likely exists for ${phone}`);
        }
    }

    /**
     * Updates specific score components and recalculates total.
     */
    public async updateScore(phoneNumber: string, type: 'intent' | 'engagement' | 'reliability' | 'urgency', points: number) {
        const phone = normalizePhone(phoneNumber);
        const record = await prisma.leadScore.findUnique({ where: { phone_number: phone } });
        if (!record) return;

        let data: any = {};

        // Cap the scores based on rules (Max 30, 25, 30, 15)
        // Ideally we accumulate, but for MVP we add directly. 
        // Logic: old_score + points (with max caps)

        switch (type) {
            case 'intent':
                data.intent_score = Math.min(30, record.intent_score + points);
                break;
            case 'engagement':
                data.engagement_score = Math.min(25, record.engagement_score + points);
                break;
            case 'reliability':
                // Reliability can go negative (-20 for no-show)
                data.reliability_score = Math.min(30, record.reliability_score + points);
                break;
            case 'urgency':
                data.urgency_score = Math.min(15, record.urgency_score + points);
                break;
        }

        // Calculate Total
        // Total = Intent + Engagement + Reliability + Urgency
        // We need to use the NEW values where applicable or OLD values
        const intent = data.intent_score !== undefined ? data.intent_score : record.intent_score;
        const engage = data.engagement_score !== undefined ? data.engagement_score : record.engagement_score;
        const reliable = data.reliability_score !== undefined ? data.reliability_score : record.reliability_score;
        const urgent = data.urgency_score !== undefined ? data.urgency_score : record.urgency_score;

        data.total_score = Math.max(0, Math.min(100, intent + engage + reliable + urgent));
        data.last_updated_at = new Date();

        await prisma.leadScore.update({
            where: { phone_number: phone },
            data: data
        });

        logger.info(`[LeadScore] Updated ${phone}: Total=${data.total_score} (Int:${intent} Eng:${engage} Rel:${reliable} Urg:${urgent})`);

        // Trigger Lead Status Update logic here if needed (Hot/Warm/Cold)
        await this.updateLeadStatus(phone, data.total_score);
    }

    private async updateLeadStatus(phoneNumber: string, score: number) {
        const phone = normalizePhone(phoneNumber);
        let status = 'cold';
        if (score >= 80) status = 'hot';
        else if (score >= 60) status = 'warm';

        await prisma.contact.update({
            where: { phone_number: phone },
            data: { lead_status: status }
        });
    }

    /**
     * Handles No-Show Logic
     * -20 Reliability, Updates No-Show Count
     */
    public async handleNoShow(phoneNumber: string) {
        const phone = normalizePhone(phoneNumber);
        logger.info(`[LeadScore] Handling No-Show for ${phone}`);

        const record = await prisma.leadScore.findUnique({ where: { phone_number: phone } });
        if (!record) return;

        const newCount = record.no_show_count + 1;

        // Reliability Penalty: -20
        await this.updateScore(phone, 'reliability', -20);

        await prisma.leadScore.update({
            where: { phone_number: phone },
            data: {
                no_show_count: newCount,
                last_no_show_at: new Date()
            }
        });

        // Trigger Recovery Logic
        if (newCount === 1) {
            logger.info(`[LeadScore] 1st No-Show: Triggering Reschedule Message`);
            const whatsappService = new (require('./whatsapp').WhatsAppService)();
            await whatsappService.sendTemplate(phone, 'rp_noshow_recovery', {});
        } else if (newCount >= 2) {
            logger.info(`[LeadScore] 2nd+ No-Show: Downgrading Priority`);
            await prisma.contact.update({
                where: { phone_number: phone },
                data: { lead_status: 'cold' } // Force cold
            });
        }
    }
}
