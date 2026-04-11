
import prisma from '../db';
import { WhatsAppService } from './whatsapp';
import { VoiceService } from './voice';
import { isQuietHours, msUntilQuietEnd } from '../utils/quiet_hours';
import logger from '../utils/logger';

export class DecisionEngine {
    private whatsappService: WhatsAppService;
    private voiceService: VoiceService;

    constructor() {
        this.whatsappService = new WhatsAppService();
        this.voiceService = new VoiceService();
    }

    public async triggerOutboundCall(phoneNumber: string, reason: string) {
        logger.info(`[DecisionEngine] Triggering Call to ${phoneNumber} (Reason: ${reason})`);
        const script = "Hello, main Panditji hoon Realty Pandit se. I saw you were looking for a property.";
        await this.voiceService.makeOutboundCall(phoneNumber, script);
    }

    public async handleMissedCall(contactId: string, phoneNumber: string) {
        logger.info(`[DecisionEngine] Missed call from ${phoneNumber}. Scheduling fallback in 15 mins.`);

        // Schedule Action
        const followUpTime = new Date(Date.now() + 15 * 60 * 1000); // +15 mins

        await prisma.contact.update({
            where: { phone_number: phoneNumber },
            data: {
                next_action_at: followUpTime,
                next_action_type: 'whatsapp_missed_call'
            }
        });
    }

    public async executeNextAction(contact: any) {
        logger.info(`[DecisionEngine] Executing next action for ${contact.phone_number}: ${contact.next_action_type}`);

        // Quiet hours: reschedule to after 8 AM IST instead of sending now
        if (isQuietHours()) {
            const rescheduleAt = new Date(Date.now() + msUntilQuietEnd() + 5 * 60 * 1000);
            await prisma.contact.update({
                where: { phone_number: contact.phone_number },
                data: { next_action_at: rescheduleAt },
            });
            logger.info(`[DecisionEngine] Quiet hours — rescheduled action for ${contact.phone_number} to ${rescheduleAt.toISOString()}`);
            return;
        }

        if (contact.next_action_type === 'whatsapp_missed_call') {
            const message = "Hi! We noticed we missed your call. How can we help you regarding property details? Reply to connect with Panditji, your AI property assistant.";
            await this.whatsappService.sendTemplate(contact.phone_number, 'rp_missed_call', {});

            // Log Interaction
            const tenant = await prisma.tenant.findFirst();
            if (tenant) {
                await prisma.interaction.create({
                    data: {
                        tenant_id: tenant.id,
                        phone_number: contact.phone_number,
                        channel: 'whatsapp',
                        direction: 'outbound',
                        event_type: 'message',
                        content: message,
                        metadata: { trigger: 'missed_call_fallback_delayed' }
                    }
                });
            }
        }
    }
}
