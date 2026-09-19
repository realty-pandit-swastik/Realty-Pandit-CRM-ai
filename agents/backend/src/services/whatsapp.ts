
import axios from 'axios';
import logger from '../utils/logger';
import { buildTemplatePayload } from '../config/whatsapp_templates';
import { whatsappCircuit } from '../utils/circuit_breaker';
import { classifyMetaError, throughputBackoffMs, WhatsAppSendError, MetaErrorInfo } from './whatsapp_errors';
import { gateTemplateSend, suppressRecipient } from './wa_compliance';
import { recordOutbound } from './wa_message_log';

/** Outcome of a send — `waMessageId` feeds delivery-status persistence. */
export interface SendResult {
    waMessageId: string | null;
    error?: MetaErrorInfo | null;
}

export class WhatsAppService {
    private readonly apiUrl = 'https://graph.facebook.com/v25.0';
    private readonly phoneNumberId = process.env.WHATSAPP_PHONE_ID;
    private readonly token = process.env.WHATSAPP_TOKEN;

    /**
     * Parse incoming webhook payload to extract messages
     */
    public parseWebhook(body: any): any[] {
        const messages: any[] = [];

        if (body.object && body.entry) {
            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    if (change.value && change.value.messages) {
                        messages.push(...change.value.messages);
                    }
                }
            }
        }

        return messages;
    }

    /**
     * Internal: execute WhatsApp API call with circuit breaker + retry
     */
    private async callWhatsAppAPI(payload: any): Promise<SendResult | undefined> {
        // Mock sending for development
        if (process.env.NODE_ENV === 'development') {
            return;
        }

        return await whatsappCircuit.call(
            async () => {
                try {
                    return await this.sendWithRetry(payload, 3);
                } catch (err) {
                    // ⚠ Business rejections must NOT open the circuit. whatsappCircuit trips
                    // after 3 failures; on 2026-08-04 there were 369 × 131049 in one day, which
                    // would have opened it in seconds and silently killed every WhatsApp send —
                    // including customer-initiated replies, which are legal and never the
                    // problem. Resolving normally here keeps the breaker a measure of TRANSPORT
                    // health only. The error is still logged, classified and returned.
                    const info = (err as WhatsAppSendError)?.info;
                    if (info && !info.countsAsCircuitFailure) {
                        return { waMessageId: null, error: info } as SendResult;
                    }
                    throw err;
                }
            },
            undefined // fallback: silent failure (logged inside)
        );
    }

    /**
     * Retry with exponential backoff: 1s, 2s, 4s
     */
    private async sendWithRetry(payload: any, maxRetries: number): Promise<SendResult> {
        let lastError: Error | null = null;
        let lastInfo: MetaErrorInfo | null = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const res = await axios.post(
                    `${this.apiUrl}/${this.phoneNumberId}/messages`,
                    payload,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.token}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 10000, // 10 second timeout
                    }
                );
                // Meta returns the message id here; it is the join key for delivery-status
                // callbacks (`value.statuses[].id`).
                return { waMessageId: res?.data?.messages?.[0]?.id ?? null };
            } catch (error) {
                lastError = error as Error;
                const info = classifyMetaError(error);
                lastInfo = info;

                // Meta told us to back off from this recipient (131049/131048/131026).
                // Honour it — repeatedly hammering a throttled recipient is precisely what
                // escalates into an account-level "Sending spam" restriction.
                if (info.suppressRecipientSec > 0 && payload?.to) {
                    suppressRecipient(String(payload.to), info.suppressRecipientSec, info.code).catch(() => {});
                }

                if (info.alertCritical) {
                    logger.error(`[WhatsAppService] 🚨 ACCOUNT-LEVEL WhatsApp failure (code ${info.code}): ${info.message} — every send will fail until this is resolved.`);
                }

                if (!info.retryable) {
                    logger.error(`[WhatsAppService] Not retrying (code ${info.code ?? 'n/a'}, http ${info.httpStatus ?? 'n/a'}): ${info.message}`);
                    throw new WhatsAppSendError(info, error);
                }

                if (attempt < maxRetries - 1) {
                    // 130429/429 are throughput caps and need a longer wait than a network blip.
                    const delay = info.code === 130429 || info.httpStatus === 429
                        ? throughputBackoffMs(attempt)
                        : Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
                    logger.warn(`[WhatsAppService] Attempt ${attempt + 1}/${maxRetries} failed (code ${info.code ?? 'n/a'}), retrying in ${delay}ms`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // All retries exhausted
        const info = lastInfo ?? classifyMetaError(lastError);
        logger.error(`[WhatsAppService] All ${maxRetries} retries failed (code ${info.code ?? 'n/a'}): ${info.message}`);
        throw new WhatsAppSendError(info, lastError);
    }

    /**
     * Send a text message via WhatsApp Cloud API
     */
    public async sendText(to: string, body: string, sentBy?: string): Promise<void> {
        logger.info(`[WhatsAppService] Sending to ${to}: ${body.substring(0, 80)}...`);

        try {
            const res = await this.callWhatsAppAPI({
                messaging_product: 'whatsapp',
                to: to,
                text: { body: body }
            });
            // Fire-and-forget: delivery bookkeeping must never fail or delay a send.
            recordOutbound({
                to, messageType: 'text', body, sentBy,
                waMessageId: res?.waMessageId ?? null, error: res?.error ?? null,
            }).catch(() => {});
        } catch (error) {
            logger.error('[WhatsAppService] Send failed:', (error as Error).message);
            recordOutbound({
                to, messageType: 'text', body, sentBy,
                error: (error as WhatsAppSendError)?.info ?? classifyMetaError(error),
            }).catch(() => {});
        }
    }

    /**
     * Send text message — throws on failure (for OTP and critical messages).
     * Unlike sendText(), this does NOT swallow errors via circuit breaker.
     */
    public async sendTextStrict(to: string, body: string): Promise<void> {
        logger.info(`[WhatsAppService] Sending (strict) to ${to}: ${body.substring(0, 80)}...`);

        if (process.env.NODE_ENV === 'development') {
            return;
        }

        await this.sendWithRetry({
            messaging_product: 'whatsapp',
            to,
            text: { body }
        }, 3);
    }

    /**
     * Send an image message via WhatsApp Cloud API
     */
    public async sendImage(to: string, imageUrl: string, caption?: string): Promise<void> {
        logger.info(`[WhatsAppService] Sending Image to ${to}: ${imageUrl}`);

        if (process.env.NODE_ENV === 'development') {
            logger.info(`[WhatsAppService] Mock Image Sent: ${imageUrl}`);
            return;
        }

        try {
            await this.callWhatsAppAPI({
                messaging_product: 'whatsapp',
                to: to,
                type: "image",
                image: {
                    link: imageUrl,
                    caption: caption
                }
            });
        } catch (error) {
            logger.error('[WhatsAppService] Send Image failed:', (error as Error).message);
        }
    }

    /** Send a direct image/video attachment and throw when Meta rejects it. */
    public async sendMediaStrict(
        to: string,
        type: 'image' | 'video',
        mediaUrl: string,
        caption?: string,
    ): Promise<void> {
        logger.info(`[WhatsAppService] Sending ${type} (strict) to ${to}: ${mediaUrl}`);

        if (process.env.NODE_ENV === 'development') {
            logger.info(`[WhatsAppService] Mock ${type} sent: ${mediaUrl}`);
            return;
        }

        try {
            const res = await this.callWhatsAppAPIStrict({
                messaging_product: 'whatsapp',
                to,
                type,
                [type]: { link: mediaUrl, ...(caption ? { caption } : {}) },
            });
            recordOutbound({
                to,
                messageType: type,
                body: caption,
                mediaUrl,
                sentBy: 'property_sharing',
                waMessageId: res?.waMessageId ?? null,
                error: res?.error ?? null,
            }).catch(() => {});
        } catch (error) {
            recordOutbound({
                to,
                messageType: type,
                body: caption,
                mediaUrl,
                sentBy: 'property_sharing',
                error: (error as WhatsAppSendError)?.info ?? classifyMetaError(error),
            }).catch(() => {});
            throw error;
        }
    }

    /**
     * Download media from WhatsApp Cloud API by media ID.
     */
    public async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
        try {
            // Step 1: Get media URL from WhatsApp
            const metaRes = await axios.get(
                `${this.apiUrl}/${mediaId}`,
                {
                    headers: { 'Authorization': `Bearer ${this.token}` },
                    timeout: 10000,
                }
            );

            const mediaUrl = metaRes.data.url;
            const mimeType = metaRes.data.mime_type || 'image/jpeg';

            // Step 2: Download the actual file
            const fileRes = await axios.get(mediaUrl, {
                headers: { 'Authorization': `Bearer ${this.token}` },
                responseType: 'arraybuffer',
                timeout: 30000,
            });

            logger.info(`[WhatsAppService] Downloaded media ${mediaId} (${mimeType}, ${fileRes.data.length} bytes)`);
            return {
                buffer: Buffer.from(fileRes.data),
                mimeType
            };
        } catch (error) {
            logger.error('[WhatsAppService] Download media failed:', (error as Error).message);
            return null;
        }
    }

    /**
     * Send a Meta-approved template message via WhatsApp Cloud API.
     */
    public async sendTemplate(
        to: string,
        templateName: string,
        paramValues: Record<string, string> = {},
        imageUrl?: string,
        sentBy?: string,
    ): Promise<void> {
        const payload = buildTemplatePayload(templateName, paramValues, imageUrl);
        logger.info(`[WhatsAppService] Sending template "${templateName}" (meta: ${payload.name}) to ${to}`);

        if (process.env.NODE_ENV === 'development') {
            logger.info(`[WhatsAppService] Mock template sent: ${templateName} to ${to}`, paramValues);
            return;
        }

        // Central compliance gate — the one choke point every template send passes through.
        // Returns (does NOT throw) when blocked: throwing would make sendTemplateOrText fall
        // back to plaintext and defeat the gate entirely.
        const blocked = await gateTemplateSend(to, templateName);
        if (blocked) {
            logger.warn(`[WhatsAppService] BLOCKED template "${templateName}" to ${to} — reason: ${blocked}`);
            return;
        }

        try {
            const res = await this.callWhatsAppAPIStrict({
                messaging_product: 'whatsapp',
                to,
                type: 'template',
                template: {
                    name: payload.name,
                    language: { code: payload.language },
                    components: payload.components,
                },
            });
            recordOutbound({
                to, messageType: 'template', templateName, sentBy,
                waMessageId: res?.waMessageId ?? null, error: res?.error ?? null,
            }).catch(() => {});
        } catch (error) {
            // sendTemplate is strict by contract (sendTemplateOrText relies on the throw to
            // fall back to plaintext), so record the failure and re-throw unchanged.
            recordOutbound({
                to, messageType: 'template', templateName, sentBy,
                error: (error as WhatsAppSendError)?.info ?? classifyMetaError(error),
            }).catch(() => {});
            throw error;
        }
    }

    /**
     * Send a Meta DOCUMENT-header template — delivers a PDF as a real attachment
     * card in the chat (the MakeMyTrip-style "direct PDF"). Meta fetches the file
     * from `pdfUrl` at send time and labels the card with `filename`. Body params
     * fill {{1}}, {{2}}, … in order. Throws strictly on failure (like sendTemplate),
     * so callers get an accurate sent/not-sent result.
     */
    public async sendDocumentTemplate(
        to: string,
        templateName: string,
        opts: { pdfUrl: string; filename: string; bodyParams: string[] },
    ): Promise<void> {
        logger.info(`[WhatsAppService] Sending document template "${templateName}" to ${to} (${opts.filename})`);

        if (process.env.NODE_ENV === 'development') {
            logger.info(`[WhatsAppService] Mock document template sent: ${templateName} to ${to}`, opts);
            return;
        }

        const components = [
            { type: 'header', parameters: [{ type: 'document', document: { link: opts.pdfUrl, filename: opts.filename } }] },
            { type: 'body', parameters: opts.bodyParams.map((t) => ({ type: 'text', text: t })) },
        ];

        await this.callWhatsAppAPIStrict({
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: { name: templateName, language: { code: 'en' }, components },
        });
    }

    /**
     * Try to send a Meta template. If the template send fails (commonly: template
     * not yet approved by Meta), fall back to a plaintext message. Plaintext only
     * works inside the 24h customer-initiated session window — outside that window
     * the message will be silently dropped, which is the correct behaviour for an
     * unapproved template.
     *
     * Use this for templates pending Meta approval (rp_visit_confirmed_customer,
     * rp_visit_reminder_24hr, rp_visit_reminder_2hr) so the system degrades
     * gracefully instead of throwing.
     */
    public async sendTemplateOrText(
        to: string,
        templateName: string,
        paramValues: Record<string, string>,
        fallbackText: string,
        imageUrl?: string,
    ): Promise<void> {
        try {
            await this.sendTemplate(to, templateName, paramValues, imageUrl);
        } catch (err) {
            logger.warn(`[WhatsAppService] Template "${templateName}" failed for ${to}, attempting plaintext fallback: ${(err as Error).message}`);
            try {
                await this.sendText(to, fallbackText);
            } catch (err2) {
                logger.warn(`[WhatsAppService] Plaintext fallback also failed for ${to}: ${(err2 as Error).message}`);
            }
        }
    }

    /**
     * Like callWhatsAppAPI but throws on failure instead of using circuit breaker fallback.
     * Used by sendTemplate so callers can fall back to plain text on template errors.
     */
    private async callWhatsAppAPIStrict(payload: any): Promise<SendResult | undefined> {
        if (process.env.NODE_ENV === 'development') {
            return;
        }

        return await this.sendWithRetry(payload, 3);
    }

    public async sendMultiProductMessage(
        to: string,
        headerText: string,
        bodyText: string,
        footerText: string,
        sections: Array<{ title: string; productRetailerIds: string[] }>,
    ): Promise<void> {
        await this.callWhatsAppAPIStrict({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'interactive',
            interactive: {
                type: 'product_list',
                header: { type: 'text', text: headerText },
                body: { text: bodyText },
                footer: { text: footerText },
                action: {
                    catalog_id: process.env.META_CATALOG_ID,
                    sections: sections.map(s => ({
                        title: s.title,
                        product_items: s.productRetailerIds.map(id => ({ product_retailer_id: id })),
                    })),
                },
            },
        });
    }

    public async sendSingleProductMessage(
        to: string,
        bodyText: string,
        footerText: string,
        productRetailerId: string,
    ): Promise<void> {
        await this.callWhatsAppAPIStrict({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'interactive',
            interactive: {
                type: 'product',
                body: { text: bodyText },
                footer: { text: footerText },
                action: {
                    catalog_id: process.env.META_CATALOG_ID,
                    product_retailer_id: productRetailerId,
                },
            },
        });
    }

    /**
     * Send an interactive reply-buttons message (max 3 buttons). Phase 3 (2026-07-28)
     * disambiguation prompt. Uses the strict sender so a send failure throws (caller then
     * falls through to the normal router rather than going silent).
     */
    public async sendReplyButtons(
        to: string,
        bodyText: string,
        buttons: Array<{ id: string; title: string }>,
    ): Promise<void> {
        await this.callWhatsAppAPIStrict({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'interactive',
            interactive: {
                type: 'button',
                body: { text: bodyText.substring(0, 1024) },
                action: {
                    buttons: buttons.slice(0, 3).map(b => ({
                        type: 'reply',
                        reply: { id: b.id, title: b.title.substring(0, 20) },
                    })),
                },
            },
        });
    }

    public async sendFlow(
        to: string,
        flowId: string,
        bodyText: string,
        initialScreenId: string = 'SEARCH_SCREEN',
        screenData: Record<string, any> = {},
        mode: 'draft' | 'published' = 'published',
    ): Promise<void> {
        await this.callWhatsAppAPIStrict({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'interactive',
            interactive: {
                type: 'flow',
                body: { text: bodyText },
                action: {
                    name: 'flow',
                    parameters: {
                        flow_message_version: '3',
                        flow_token: 'unused',
                        flow_id: flowId,
                        flow_cta: 'Open',
                        flow_action: 'navigate',
                        flow_action_payload: { screen: initialScreenId, data: screenData },
                        mode,
                    },
                },
            },
        });
    }
}
