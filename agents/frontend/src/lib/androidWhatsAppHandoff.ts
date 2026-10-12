import { toDialablePhone, isValidPhoneInput } from './phone.ts';
import { orderedPropertyAttachments, propertyAttachments, type AttachmentSelection } from './personalWhatsAppFiles.ts';

export const ANDROID_HANDOFF_PAGE = 'https://admin.realtypandit.in/my-whatsapp/open.html';
export type AndroidSendingApp = 'com.whatsapp' | 'com.whatsapp.w4b';
export interface AndroidHandoff { launch_token: string; expires_at: number }

export function androidHandoffPayload(phone: string, sendingApp: AndroidSendingApp,
    inventories: Array<{ id: string; media_urls?: string[]; video_urls?: string[] }>,
    selections: Record<string, AttachmentSelection>, apiBase: string) {
    const formatted = phone.trim().replace(/[\s()-]/g, '');
    const recipient = formatted.startsWith('+') ? formatted : isValidPhoneInput(phone) ? toDialablePhone(phone) : null;
    if (!recipient || !/^\+[1-9]\d{7,14}$/.test(recipient)) throw new Error('Enter a valid recipient number with country code, or choose a CRM contact.');
    const properties = inventories.filter(inv => selections[inv.id] && (selections[inv.id].urls.length || selections[inv.id].pdf)).map(inv => {
        const selection = selections[inv.id];
        const ordered = selection.urls.length ? orderedPropertyAttachments(propertyAttachments(inv, apiBase), selection) : [];
        if (ordered.length !== selection.urls.length) throw new Error('The media selection changed. Select attachments again.');
        return { inventory_id: inv.id, media_urls: ordered.map(item => item.url), first_photo: selection.firstPhoto, pdf: selection.pdf };
    });
    if (!properties.length) throw new Error('Choose at least one photo, video, or PDF.');
    return { recipient, sending_app: sendingApp, properties };
}

export function validateAndroidHandoff(value: AndroidHandoff, now = Date.now()): AndroidHandoff {
    if (!value || !/^[a-f0-9]{64}$/.test(value.launch_token) || !Number.isFinite(value.expires_at) || value.expires_at <= now) {
        throw new Error('The prepared share is invalid or expired. Prepare it again.');
    }
    return value;
}

export function androidHandoffLaunch(token: string, userAgent: string): string {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid prepared share. Prepare again.');
    if (/Chrome\//i.test(userAgent) && !/EdgA|OPR|SamsungBrowser/i.test(userAgent)) {
        return `intent://admin.realtypandit.in/my-whatsapp/open.html#Intent;scheme=https;package=com.realtypandit.mywhatsapp;S.handoff_token=${token};S.browser_fallback_url=${encodeURIComponent(ANDROID_HANDOFF_PAGE)};end`;
    }
    return `${ANDROID_HANDOFF_PAGE}#token=${token}`;
}
