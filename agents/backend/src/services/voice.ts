
import prisma from '../db';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';

interface VapiPayload {
    message: {
        type: string;
        call?: {
            id: string;
            status: string;
            startedAt: string;
            endedAt: string;
            durationSeconds?: number;
        };
        customer?: {
            number: string;
        };
        transcript?: string;
        analysis?: {
            summary?: string;
        };
        recordingUrl?: string;
    };
}

import axios from 'axios';
import { DecisionEngine } from './decision_engine';

export class VoiceService {
    // Removed circular dependency from constructor

    public async makeOutboundCall(to: string, firstMessage: string) {
        logger.info(`[VoiceService] Initiating Outbound Call to ${to}...`);

        // SPAM PREVENTION: Check for calls in last 24h
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentCall = await prisma.voiceCall.findFirst({
            where: {
                phone_number: to,
                started_at: { gte: yesterday }
            }
        });

        if (recentCall) {
            logger.info(`[VoiceService] 🛑 Spam Prevention: Skipping call to ${to} (Called recently at ${recentCall.started_at})`);
            return;
        }

        // MOCK MODE CHECK
        if (!process.env.VAPI_PRIVATE_KEY || process.env.VAPI_PRIVATE_KEY === 'your_vapi_key') {
            logger.info(`[VoiceService] ⚠️ MOCK MODE: Simulated Call to ${to}`);
            logger.info(`[VoiceService] 🗣️ AI would say: "${firstMessage}"`);

            // Simulate Log
            await this.logMockCall(to, firstMessage);
            return;
        }

        // REAL API CALL
        try {
            const response = await axios.post(
                'https://api.vapi.ai/call',
                {
                    phoneNumberId: process.env.VAPI_PHONE_ID, // Ensure this exists in env or use placeholder
                    customer: { number: to },
                    assistant: {
                        firstMessage: firstMessage,
                        // Add assistantId if you have a predefined one, or transient model config
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            logger.info(`[VoiceService] Call initiated. ID: ${response.data.id}`);
        } catch (error) {
            logger.error(`[VoiceService] Failed to make call:`, (error as Error).message);
        }
    }

    private async logMockCall(to: string, message: string) {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return;

        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: to,
                channel: 'voice',
                direction: 'outbound',
                event_type: 'call_initiate',
                content: `Mock Outbound Call. Msg: ${message}`,
                metadata: { status: 'simulated' }
            }
        });
    }

    public async handleWebhook(payload: VapiPayload) {
        const { message } = payload;

        if (message.type !== 'end-of-call-report') {
            return;
        }

        const customerNumber = message.customer?.number;
        if (!customerNumber) {
            logger.error('[VoiceService] No customer number in payload');
            return;
        }

        const transcript = message.transcript || '';
        const summary = message.analysis?.summary || '';
        const recordingUrl = message.recordingUrl || '';
        const callId = message.call?.id || '';
        const status = message.call?.status || 'completed';
        const startedAt = message.call?.startedAt ? new Date(message.call.startedAt) : new Date();
        const endedAt = message.call?.endedAt ? new Date(message.call.endedAt) : new Date();
        const duration = message.call?.durationSeconds || 0;

        logger.info(`[VoiceService] Processing call report for ${customerNumber}`);

        // 1. Find or Create Tenant
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) throw new Error('No tenant found');

        // 2. Find or Create Contact
        let contact = await prisma.contact.findUnique({
            where: { phone_number: customerNumber }
        });

        if (!contact) {
            contact = await prisma.contact.create({
                data: {
                    phone_number: customerNumber,
                    tenant_id: tenant.id,
                    source: 'voice',
                    lead_status: 'cold',
                    contact_type: 'UNKNOWN'
                }
            });
            logger.info(`[VoiceService] Created new contact: ${customerNumber}`);
        }

        // 3. Create VoiceCall Record
        await prisma.voiceCall.create({
            data: {
                tenant_id: tenant.id,
                phone_number: customerNumber,
                call_sid: callId,
                direction: 'inbound',
                call_status: status,
                duration: Math.round(duration),
                recording_url: recordingUrl,
                transcript: transcript,
                ai_call_summary: summary,
                started_at: startedAt,
                ended_at: endedAt
            }
        });

        // 3.1. LEAD SCORING: Integration
        // +10 Engagement for answered calls > 30s
        if (status === 'completed' || (duration && duration > 30)) {
            logger.info(`[VoiceService] Scoring +10 Engagement for ${customerNumber}`);
            // Lazy load to avoid circular dependency issues if any
            const { LeadScoreService } = require('./lead_score');
            const leadScoreService = new LeadScoreService();
            await leadScoreService.initScore(customerNumber, tenant.id);
            await leadScoreService.updateScore(customerNumber, 'engagement', 10);
        }

        // 4. Create Interaction Record
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: customerNumber,
                channel: 'voice',
                direction: 'inbound',
                event_type: 'call',
                content: `Summary: ${summary}`,
                metadata: { call_id: callId, duration }
            }
        });

        // 5. Update Contact Context
        await prisma.contact.update({
            where: { phone_number: customerNumber },
            data: {
                last_channel: 'voice',
                last_interaction: endedAt,
                ai_summary: summary
            }
        });

        logger.info(`[VoiceService] SSOT updated for ${customerNumber}`);

        // 6. Decision Engine: Handle Missed Call Fallback
        if (status !== 'completed') {
            logger.info(`[VoiceService] Call status is '${status}'. Triggering Decision Engine fallback.`);
            // Lazy instantiate to avoid circular dependency
            const decisionEngine = new DecisionEngine();
            await decisionEngine.handleMissedCall(contact.phone_number, contact.phone_number);
        }
    }

    // ─── Pipecat (WhatsApp Calling API) ────────────────────────────────────────
    public async savePipecatCallRecord(params: {
        call_id: string;
        caller_number: string;
        transcript: string;
        started_at?: string;
        duration?: number;
    }): Promise<void> {
        const { call_id, transcript, started_at, duration } = params;
        // Meta's webhook sends numbers without the "+" prefix (e.g. "919958860411"),
        // but DB records are stored in E.164 form (+91...). Without normalizing,
        // findUnique misses existing contacts and creates duplicate rows with
        // contact_type UNKNOWN, losing team-member / client classifications.
        const caller_number = normalizePhone(params.caller_number) || params.caller_number;
        const now = new Date();
        // started_at/duration come from the pipecat service's own call-start timestamp;
        // fall back to today's behavior (both stamps = now, duration 0) if a payload is missing them.
        const parsedStartedAt = started_at ? new Date(started_at) : now;
        const safeDuration = typeof duration === 'number' && Number.isFinite(duration) ? duration : 0;

        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return;

        let contact = await prisma.contact.findUnique({
            where: { phone_number: caller_number }
        });

        if (!contact) {
            contact = await prisma.contact.create({
                data: {
                    phone_number: caller_number,
                    tenant_id: tenant.id,
                    source: 'voice',
                    lead_status: 'warm',
                    contact_type: 'UNKNOWN',
                }
            });
        }

        await prisma.voiceCall.create({
            data: {
                tenant_id: tenant.id,
                phone_number: caller_number,
                call_sid: call_id,
                direction: 'inbound',
                call_status: 'completed',
                duration: safeDuration,
                transcript: transcript,
                ai_call_summary: transcript.split('\n').slice(-3).join(' '),
                started_at: parsedStartedAt,
                ended_at: now,
            }
        });

        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: caller_number,
                channel: 'voice',
                direction: 'inbound',
                event_type: 'whatsapp_call',
                content: 'WhatsApp voice call via Panditji AI',
                metadata: { call_id, source: 'pipecat' },
            }
        });

        await prisma.contact.update({
            where: { phone_number: caller_number },
            data: {
                last_channel: 'voice',
                last_interaction: now,
            }
        });

        logger.info(`[VoiceService] Pipecat call saved for ${caller_number}`);
    }
}
