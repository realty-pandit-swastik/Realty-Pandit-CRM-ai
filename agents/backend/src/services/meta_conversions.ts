/**
 * Meta Conversions API Service
 *
 * Sends conversion events back to Meta so it can optimize ad delivery.
 * Events: Lead (qualified), Schedule (visit booked), Purchase (deal closed)
 *
 * Endpoint: POST /v25.0/{PIXEL_ID}/events
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api/
 */

import axios from 'axios';
import crypto from 'crypto';
import logger from '../utils/logger';

const GRAPH_API = 'https://graph.facebook.com/v25.0';
const PIXEL_ID = process.env.FB_PIXEL_ID || '';
const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN || '';

function hashSHA256(value: string): string {
    return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

interface ConversionEventData {
    eventName: 'Lead' | 'Schedule' | 'Purchase' | 'ViewContent';
    phone?: string;
    email?: string;
    externalId?: string; // contact phone or lead ID
    value?: number;
    currency?: string;
    contentName?: string; // e.g., "2BHK Flat Sector 150 Noida"
}

/**
 * Send a conversion event to Meta.
 * Fire-and-forget — never throws.
 */
export async function sendConversionEvent(data: ConversionEventData): Promise<void> {
    if (!PIXEL_ID || !ACCESS_TOKEN) {
        logger.debug('[MetaConversions] Pixel ID or token not configured — skipping');
        return;
    }

    try {
        const userData: Record<string, any> = {};
        if (data.phone) userData.ph = [hashSHA256(data.phone.replace(/\D/g, ''))];
        if (data.email) userData.em = [hashSHA256(data.email)];
        if (data.externalId) userData.external_id = [hashSHA256(data.externalId)];

        const event: Record<string, any> = {
            event_name: data.eventName,
            event_time: Math.floor(Date.now() / 1000),
            action_source: 'website',
            event_id: `${data.eventName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            user_data: userData,
        };

        if (data.value || data.contentName) {
            event.custom_data = {};
            if (data.value) {
                event.custom_data.value = data.value;
                event.custom_data.currency = data.currency || 'INR';
            }
            if (data.contentName) {
                event.custom_data.content_name = data.contentName;
            }
        }

        await axios.post(
            `${GRAPH_API}/${PIXEL_ID}/events`,
            { data: [event] },
            { params: { access_token: ACCESS_TOKEN } }
        );

        logger.info(`[MetaConversions] Sent ${data.eventName} event for ${data.phone || data.email || 'unknown'}`);
    } catch (err: any) {
        logger.warn(`[MetaConversions] Failed to send ${data.eventName}: ${err.response?.data?.error?.message || err.message}`);
    }
}

// ─── WhatsApp Click-to-WhatsApp (CTWA) lead events ───────────────────────────
// CTWA conversions go to the WhatsApp messaging DATASET (not the website pixel)
// with action_source 'business_messaging' + the ad-click id (ctwa_clid). This is
// what lets Meta attribute the lead to the ad and optimise delivery toward real
// leads instead of "conversations started". Dataset: "WhatsApp Marketing Message
// Event Sharing" (business 782804307620931). Override via FB_MESSAGING_DATASET_ID.
const MESSAGING_DATASET_ID = process.env.FB_MESSAGING_DATASET_ID || '760915983366996';
// business_messaging events MUST carry the originating page or WABA, or Meta 400s with
// "missing a page_id or whatsapp_business_account_id parameter". This is the bot's WABA.
const MESSAGING_WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '2124684824933246';

/**
 * Send a CTWA lead/qualification event for a WhatsApp ad-sourced contact.
 * Fire-and-forget — never throws. No-op if ctwa_clid is missing (non-ad lead).
 */
export async function trackWhatsAppLead(params: {
    ctwaClid: string;
    phone: string;
    // Only these two are valid for action_source 'business_messaging' — Meta rejects
    // 'Lead'/'Contact'/'Schedule'/'Contacted' outright (verified 2026-08-02).
    eventName?: 'LeadSubmitted' | 'Purchase';
    value?: number;
    contentName?: string;
}): Promise<void> {
    const { ctwaClid, phone, eventName = 'LeadSubmitted', value, contentName } = params;
    if (!ctwaClid || !ACCESS_TOKEN || !MESSAGING_DATASET_ID) {
        logger.debug('[MetaConversions] WA lead skipped — missing ctwa_clid/token/dataset');
        return;
    }
    try {
        const event: Record<string, any> = {
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            action_source: 'business_messaging',
            messaging_channel: 'whatsapp',
            event_id: `wa_${eventName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            user_data: {
                whatsapp_business_account_id: MESSAGING_WABA_ID,
                ctwa_clid: ctwaClid,
                ph: [hashSHA256(phone.replace(/\D/g, ''))],
                external_id: [hashSHA256(phone.replace(/\D/g, ''))],
            },
        };
        if (value || contentName) {
            event.custom_data = {};
            if (value) { event.custom_data.value = value; event.custom_data.currency = 'INR'; }
            if (contentName) event.custom_data.content_name = contentName;
        }
        await axios.post(
            `${GRAPH_API}/${MESSAGING_DATASET_ID}/events`,
            { data: [event] },
            { params: { access_token: ACCESS_TOKEN } }
        );
        logger.info(`[MetaConversions] Sent WA ${eventName} (ctwa) for ${phone}`);
    } catch (err: any) {
        logger.warn(`[MetaConversions] WA ${eventName} failed: ${err.response?.data?.error?.message || err.message}`);
    }
}

/**
 * Track lead qualification.
 */
export async function trackLeadQualified(phone: string, email?: string): Promise<void> {
    await sendConversionEvent({ eventName: 'Lead', phone, email, externalId: phone });
}

/**
 * Track visit scheduled.
 */
export async function trackVisitScheduled(phone: string, propertyInfo: string, email?: string): Promise<void> {
    await sendConversionEvent({ eventName: 'Schedule', phone, email, externalId: phone, contentName: propertyInfo });
}

/**
 * Track deal closed.
 */
export async function trackDealClosed(phone: string, dealValue: number, propertyInfo: string, email?: string): Promise<void> {
    await sendConversionEvent({ eventName: 'Purchase', phone, email, externalId: phone, value: dealValue, currency: 'INR', contentName: propertyInfo });
}
