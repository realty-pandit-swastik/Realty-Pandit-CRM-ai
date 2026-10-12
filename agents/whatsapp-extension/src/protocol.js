export const CHANNEL = 'rp-personal-whatsapp-v1';
export const CAPABILITIES = ['video-first'];
// ponytail: 40 MB bounds Chrome's 64 MB JSON message transport; use chunks for larger shares.
export const MAX_BYTES = 40 * 1024 * 1024;
export const EXPIRY_MS = 10 * 60 * 1000;

const ORIGINS = new Set(['https://admin.realtypandit.in', 'https://www.realtypandit.in',
    'https://agents.realtypandit.in', 'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:7575', 'http://127.0.0.1:7575']);

export function allowedCrmUrl(url) {
    try { return ORIGINS.has(new URL(url).origin); } catch { return false; }
}

export function validatePayload(payload) {
    if (!payload || typeof payload !== 'object' || !/^\+[1-9]\d{7,14}$/.test(payload.recipient || '')) {
        throw new Error('A valid recipient with country code is required.');
    }
    if (!Array.isArray(payload.files) || !payload.files.length || payload.files.length > 100) {
        throw new Error('Choose between 1 and 100 attachments.');
    }
    let size = 0;
    const properties = new Map();
    let currentProperty;
    const keys = new Set();
    for (const file of payload.files) {
        if (!file || !['image', 'video', 'document'].includes(file.kind)
            || typeof file.key !== 'string' || !file.key || keys.has(file.key)
            || typeof file.propertyId !== 'string' || !file.propertyId || file.propertyId.length > 100
            || typeof file.filename !== 'string' || !file.filename || file.filename.length > 200
            || typeof file.caption !== 'string' || file.caption.length > 1024
            || typeof file.data !== 'string') throw new Error('Invalid attachment.');
        keys.add(file.key);
        const match = /^data:(image\/(?:jpeg|png|webp|gif|avif)|video\/(?:mp4|webm|quicktime)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(file.data);
        if (!match || match[2].length % 4 || (file.kind === 'image' && !match[1].startsWith('image/'))
            || (file.kind === 'video' && !match[1].startsWith('video/'))
            || (file.kind === 'document' && match[1] !== 'application/pdf')) throw new Error('Unsupported attachment type.');
        size += match[2].length / 4 * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
        if (size > MAX_BYTES) throw new Error('Selected attachments exceed 40 MB. Share a smaller selection.');
        if (file.propertyId !== currentProperty && properties.has(file.propertyId)) throw new Error('Keep each property’s attachments together.');
        currentProperty = file.propertyId;
        const previous = properties.get(file.propertyId);
        const rank = { image: 0, video: 1, document: 2 }[file.kind];
        if (!previous) {
            if (rank > 1 || !file.caption.trim()) throw new Error('Each property needs a first photo or video with its caption.');
        } else if (file.caption || rank < previous.rank || (rank === 2 && previous.rank === 2)) {
            throw new Error('Attachments must be photos, then videos, then one optional PDF.');
        }
        properties.set(file.propertyId, { rank });
    }
    return payload;
}

/** Runs in WhatsApp's MAIN world. No closure dependencies: Chrome serializes this function. */
export async function sendPreparedFiles(payload, expectedAccount) {
    const wpp = window.WPP;
    const results = [];
    try {
        if (!wpp?.isReady || !wpp.conn.isAuthenticated()
            || wpp.conn.getMyUserId()?.toString() !== expectedAccount) {
            throw new Error('The WhatsApp account changed or disconnected. Nothing was sent.');
        }
        // A page-wide lock also fences requests from multiple CRM tabs/extensions reviews.
        if (window.__rpPersonalWaSending) throw new Error('Another property share is still sending.');
        window.__rpPersonalWaSending = true;
    } catch (error) {
        return { status: 'failed', results, error: error.message };
    }
    try {
        for (const file of payload.files) {
            if (wpp.conn.getMyUserId()?.toString() !== expectedAccount) throw new Error('WhatsApp account changed.');
            try {
                const response = await wpp.chat.sendFileMessage(`${payload.recipient.slice(1)}@c.us`, file.data, {
                    type: file.kind, filename: file.filename, caption: file.caption || undefined,
                    waitForAck: true, markIsRead: false, detectMentioned: false,
                });
                if (!response?.id || !(response.ack >= 1)) throw new Error('No send acknowledgement.');
                results.push({ key: file.key, propertyId: file.propertyId, filename: file.filename,
                    status: 'sent', messageId: String(response.id) });
            } catch {
                results.push({ key: file.key, propertyId: file.propertyId, filename: file.filename, status: 'uncertain' });
                return { status: 'partial', results,
                    error: `${file.filename} was not confirmed. Check WhatsApp before sending again; remaining files were not attempted.` };
            }
        }
        return { status: 'sent', results };
    } catch {
        return { status: 'partial', results, error: 'Sending stopped. Check WhatsApp before sending again.' };
    } finally {
        window.__rpPersonalWaSending = false;
    }
}
