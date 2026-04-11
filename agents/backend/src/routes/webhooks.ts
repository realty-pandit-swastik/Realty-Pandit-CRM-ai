
import { Router } from 'express';
import { WhatsAppService } from '../services/whatsapp';
import { processInboundMessage } from '../services/webhook_processor';
import { whatsappInboundQueue } from '../queues/index';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';
import { cacheGet, cacheSet } from '../utils/redis';

const router = Router();
const whatsappService = new WhatsAppService();

// ─── Message ID Dedup: Redis-based (survives restarts, works across PM2 cluster) ─
const processedMessageIdsFallback = new Set<string>();
const MESSAGE_ID_TTL = 120; // 2 minutes (Redis seconds)

async function isMessageProcessed(messageId: string): Promise<boolean> {
    const key = `msg_dedup:${messageId}`;
    const cached = await cacheGet(key);
    if (cached) return true;
    if (processedMessageIdsFallback.has(messageId)) {
        logger.warn('[Webhook] Using in-memory dedup fallback — Redis may be unavailable');
        return true;
    }
    return false;
}

async function markMessageProcessed(messageId: string): Promise<void> {
    const key = `msg_dedup:${messageId}`;
    await cacheSet(key, '1', MESSAGE_ID_TTL);
    processedMessageIdsFallback.add(messageId);
    setTimeout(() => processedMessageIdsFallback.delete(messageId), MESSAGE_ID_TTL * 1000);
}

// ─── WhatsApp Webhook (Async Processing via BullMQ) ─────────────────────────
// Responds 200 IMMEDIATELY so Meta never times out (5-second deadline).
// Messages are queued in BullMQ and processed asynchronously by the worker.
// Fallback: if BullMQ/Redis is unavailable, processes synchronously.

router.post('/whatsapp', async (req, res) => {
    // Respond 200 IMMEDIATELY — Meta must not wait for message processing
    res.sendStatus(200);

    try {
        const messages = whatsappService.parseWebhook(req.body);

        for (const msg of messages) {
            // Message ID deduplication (Redis + in-memory fallback)
            const messageId = msg.id;
            if (messageId && await isMessageProcessed(messageId)) {
                logger.info(`[Webhook] Duplicate message ${messageId}, skipping`);
                continue;
            }
            if (messageId) {
                await markMessageProcessed(messageId);
            }

            const from = normalizePhone(msg.from);

            // Extract text from ALL message types: plain text, interactive reply, button
            const text = msg.text?.body
                || msg.interactive?.button_reply?.title
                || msg.interactive?.list_reply?.title
                || msg.button?.text
                || '';

            // Skip empty messages that carry no actionable content
            // (reactions, stickers, contacts, location shares, unsupported types)
            // Only allow: text, interactive replies, images, documents, videos
            const hasContent = text.length > 0
                || msg.type === 'image'
                || msg.type === 'document'
                || msg.type === 'video';
            if (!hasContent) {
                logger.info(`[Webhook] Skipping non-actionable msg from ${from} (type: ${msg.type})`);
                continue;
            }

            const jobData = { from, text, rawMessage: msg };

            try {
                // Queue for async processing (BullMQ → worker)
                await whatsappInboundQueue.add('process-message', jobData, {
                    jobId: messageId || undefined, // Natural BullMQ dedup
                });
                logger.info(`[Webhook] Queued message ${messageId} from ${from}`);
            } catch (queueErr) {
                // BullMQ/Redis unavailable — process synchronously as fallback
                logger.warn(`[Webhook] Queue unavailable, processing synchronously: ${(queueErr as Error).message}`);
                processInboundMessage(jobData).catch(err =>
                    logger.error('[Webhook] Sync fallback error:', err)
                );
            }
        }
    } catch (error) {
        logger.error('[Webhook] Parse/queue error:', error);
    }
});

// ─── WhatsApp Verification (GET) ────────────────────────────────────────────
router.get('/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    logger.info('[WhatsApp] Verification attempt', { mode, hasToken: !!token, hasChallenge: !!challenge });

    if (mode === 'subscribe' && token) {
        if (token === process.env.WHATSAPP_VERIFY_TOKEN) {
            logger.info('[WhatsApp] Webhook verified successfully');
            return res.status(200).type('text/plain').send(String(challenge));
        } else {
            logger.warn('[WhatsApp] Invalid verify token');
            return res.sendStatus(403);
        }
    }

    return res.sendStatus(400);
});

// ─── Voice Webhook (Vapi) ───────────────────────────────────────────────────
import { VoiceService } from '../services/voice';

const voiceService = new VoiceService();

router.post('/voice', async (req, res) => {
    try {
        logger.info('[Voice] Incoming call event type:', req.body.message?.type);
        await voiceService.handleWebhook(req.body);
        res.sendStatus(200);
    } catch (err) {
        logger.error('[Voice] Error processing webhook:', err);
        res.sendStatus(500);
    }
});

export default router;
