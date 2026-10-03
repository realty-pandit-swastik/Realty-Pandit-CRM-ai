
import cron from 'node-cron';
import prisma from '../db';
import { DecisionEngine } from './decision_engine';
import { WhatsAppService } from './whatsapp';
import { isQuietHours } from '../utils/quiet_hours';
import logger from '../utils/logger';

const decisionEngine = new DecisionEngine();
const whatsappService = new WhatsAppService();

export const initScheduler = () => {
    logger.info('[Scheduler] Initializing cron jobs...');
    cron.schedule('30 8 * * *', async () => {
        try {
            const { createDailySurveyTasks } = await import('./shortage_book');
            await createDailySurveyTasks();
        } catch (error) { logger.error('[ShortageBook] fallback survey failed', error); }
    }, { timezone: 'Asia/Kolkata' });
    cron.schedule('* * * * *', async () => {
        try {
            const { processPendingShortageRefreshes } = await import('./shortage_book');
            await processPendingShortageRefreshes();
        } catch (error) { logger.error('[ShortageBook] fallback recovery failed', error); }
    }, { timezone: 'Asia/Kolkata' });

    // Run every minute
    cron.schedule('* * * * *', async () => {
        logger.info('[Scheduler] Checking for pending actions...');

        try {
            const now = new Date();
            const pendingContacts = await prisma.contact.findMany({
                where: {
                    next_action_at: {
                        lte: now
                    }
                }
            });

            for (const contact of pendingContacts) {
                await decisionEngine.executeNextAction(contact);

                // Clear next_action_at to prevent loops (or reschedule)
                await prisma.contact.update({
                    where: { phone_number: contact.phone_number },
                    data: { next_action_at: null }
                });
            }
        } catch (error) {
            logger.error('[Scheduler] Error running job:', error);
        }
    });

    // Run Daily Report at 9 PM (21:00)
    cron.schedule('0 21 * * *', async () => {
        logger.info('[Scheduler] Generating Daily Summary Report...');

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const newLeads = await prisma.contact.count({
                where: { created_at: { gte: today } }
            });

            const interactions = await prisma.interaction.count({
                where: { created_at: { gte: today } }
            });

            // Send daily report via Meta-approved template
            const tenant = await prisma.tenant.findFirst();
            if (tenant) {
                await whatsappService.sendTemplate(tenant.primary_phone, 'rp_daily_report_v3', {
                    date: today.toLocaleDateString(),
                    leads: String(newLeads),
                    interactions: String(interactions),
                });
                logger.info('[Scheduler] Daily Report sent.');
            }
        } catch (error) {
            logger.error('[Scheduler] Failed to generate Daily Report:', error);
        }
    });

    // Run Subscription Expiry Check Daily at Midnight
    cron.schedule('0 0 * * *', async () => {
        logger.info('[Scheduler] Checking for expired subscriptions...');
        try {
            const now = new Date();
            const expiredAgents = await prisma.partnerAgent.findMany({
                where: {
                    subscription_end: { lt: now },
                    status: 'ACTIVE'
                }
            });

            logger.info(`[Scheduler] Found ${expiredAgents.length} expired agents.`);

            for (const agent of expiredAgents) {
                await prisma.partnerAgent.update({
                    where: { id: agent.id },
                    data: { status: 'EXPIRED' }
                });

                // Only send notification outside quiet hours (9PM-8AM IST)
                if (!isQuietHours()) {
                    await whatsappService.sendTemplate(agent.phone_number, 'rp_subscription_expiry_v2', {});
                }
            }
        } catch (error) {
            logger.error('[Scheduler] Subscription expiry check failed:', error);
        }
    });

    logger.info('[Scheduler] Cron job started.');
};
