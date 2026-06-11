import axios from 'axios';
import logger from '../utils/logger';

const PIPECAT_URL = process.env.PIPECAT_SERVICE_URL || 'http://127.0.0.1:8765';

// Forward a WhatsApp webhook body to Pipecat, preserving the signature so the
// WhatsAppClient on the Pipecat side can verify HMAC against Meta's App Secret.
// Pipecat owns the entire call flow (pre_accept, accept, WebRTC, media) — this
// module's only job is to hand off the raw request.
export async function forwardCallWebhookToPipecat(
    rawBody: Buffer,
    sha256Signature: string | undefined,
): Promise<void> {
    try {
        await axios.post(`${PIPECAT_URL}/wa/webhook`, rawBody, {
            headers: {
                'content-type': 'application/json',
                ...(sha256Signature ? { 'x-hub-signature-256': sha256Signature } : {}),
            },
            timeout: 10000,
        });
        logger.info('[PipecatBridge] Forwarded call webhook to Pipecat');
    } catch (err) {
        logger.error('[PipecatBridge] Failed to forward webhook to Pipecat:', (err as Error).message);
        throw err;
    }
}
