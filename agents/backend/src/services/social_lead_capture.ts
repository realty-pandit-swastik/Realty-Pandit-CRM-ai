/**
 * Capture a CRM lead when someone leaves their phone number in an Instagram/Facebook
 * comment or DM.
 *
 * People routinely drop "9876543210" or "call me +91 98765 43210" under a reel. Until now
 * that went nowhere: the social handlers only tried to post a reply, and even that has been
 * failing since the IG token expired. So this runs FIRST and INDEPENDENTLY of the reply —
 * a lead must be captured even when the public reply cannot be sent.
 *
 * Deliberately conservative: we only accept something that is unambiguously an Indian
 * mobile number. Prices ("4500000"), pincodes ("201010"), years and sector numbers must
 * never become contacts.
 */

import prisma from '../db';
import logger from '../utils/logger';
import { normalizePhone } from '../utils/phone';
import { captureBackgroundError } from '../utils/capture';

/** Runs of digits with common separators — candidates, not yet validated. */
const CANDIDATE_RE = /\+?\d[\d\s().\-]{7,}\d/g;

/** Obvious junk: all one digit, or a strict run like 1234567890. */
function isImplausible(d: string): boolean {
    if (/^(\d)\1+$/.test(d)) return true;
    if (d === '1234567890' || d === '0123456789' || d === '9876543210') return true;
    return false;
}

/**
 * Normalise a digit run to +91XXXXXXXXXX, or null if it isn't an Indian mobile.
 * Indian mobiles are 10 digits starting 6-9; we also accept 91/0091/leading-0 prefixes.
 */
export function toIndianMobile(raw: string): string | null {
    let d = String(raw).replace(/\D/g, '');
    if (d.startsWith('0091')) d = d.slice(4);
    else if (d.startsWith('091')) d = d.slice(3);
    else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    if (d.length !== 10) return null;
    if (!/^[6-9]/.test(d)) return null;
    if (isImplausible(d)) return null;
    return '+91' + d;
}

/** First plausible Indian mobile in free text, or null. */
export function extractPhoneFromText(text: string | null | undefined): string | null {
    if (!text) return null;
    const matches = String(text).match(CANDIDATE_RE);
    if (!matches) return null;
    for (const m of matches) {
        const phone = toIndianMobile(m);
        if (phone) return phone;
    }
    return null;
}

/**
 * Best-effort name from the message itself ("my name is Raj", "Raj here, 98765…").
 * Falls back to the social profile name, which the caller supplies.
 */
export function extractNameFromText(text: string | null | undefined): string | null {
    if (!text) return null;
    const m = String(text).match(/(?:my name is|name is|i am|this is|mera naam)\s+([A-Za-z][A-Za-z .]{1,40})/i);
    if (!m) return null;
    const name = m[1].trim().replace(/\s+/g, ' ');
    return name.length >= 2 ? name : null;
}

export interface SocialLeadInput {
    platform: 'instagram' | 'facebook';
    surface: 'comment' | 'dm';
    text: string;
    /** Display name / @handle from the social profile. */
    profileName?: string | null;
    /** IG/FB user id — stored for traceability, never used as a phone. */
    externalUserId?: string | null;
    permalink?: string | null;
    mediaId?: string | null;
    adId?: string | null;
}

/**
 * Create (or enrich) a CRM lead from a social message containing a phone number.
 * Returns the captured phone, or null when there was nothing to capture.
 * Never throws — social handling must not break on CRM failures.
 */
export async function captureSocialLead(input: SocialLeadInput): Promise<string | null> {
    try {
        const rawPhone = extractPhoneFromText(input.text);
        if (!rawPhone) return null;

        const phone = normalizePhone(rawPhone) || rawPhone;
        const name = extractNameFromText(input.text) || input.profileName || null;
        const source = input.platform; // 'instagram' | 'facebook'

        const tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            logger.error('[SocialLead] No tenant found — cannot capture');
            return null;
        }

        const existing = await prisma.contact.findUnique({
            where: { phone_number: phone },
            select: {
                phone_number: true, name: true,
                // Needed by the "fill only when blank" scoped-id guard below.
                instagram_scoped_id: true, facebook_scoped_id: true,
            },
        });

        // Link the social identity to the Contact. Until 2026-08-07 nothing ever wrote these
        // columns — ZERO contacts had one — so logSocialInteraction's lookup by scoped id
        // always missed, every commenter logged as an "unlinked instagram user", and a
        // follow-up DM that did not repeat the phone number could not be tied to anyone.
        const scopedIdField = input.platform === 'instagram' ? 'instagram_scoped_id' : 'facebook_scoped_id';
        const scopedId = input.externalUserId || null;

        if (!existing) {
            // contact.create goes through the db.ts $extends hook, which auto-assigns an
            // owner and fires the new-lead alerts — the same treatment every other inbound
            // channel gets. That is intentional: this IS a real inbound lead.
            // ('instagram'/'facebook' were added to AUTO_ASSIGN_SOURCES on 2026-08-07; before
            // that the auto-assign half of the hook silently skipped social leads.)
            await prisma.contact.create({
                data: {
                    phone_number: phone,
                    tenant_id: tenant.id,
                    name,
                    source,
                    contact_type: 'UNKNOWN',
                    lead_status: 'warm',
                    last_channel: source,
                    last_interaction: new Date(),
                    ...(scopedId ? { [scopedIdField]: scopedId } : {}),
                },
            });
            logger.info(`[SocialLead] NEW lead ${phone} from ${input.platform} ${input.surface}${name ? ' (' + name + ')' : ''}`);
        } else {
            // Never overwrite a known name with a social handle; only fill a blank.
            if (!existing.name && name) {
                await prisma.contact.update({ where: { phone_number: phone }, data: { name } });
            }
            await prisma.contact.update({
                where: { phone_number: phone },
                data: {
                    last_channel: source,
                    last_interaction: new Date(),
                    // Fill only when blank — never repoint an existing link to a different
                    // account, which would silently reattribute someone else's identity.
                    ...(scopedId && !(existing as any)[scopedIdField] ? { [scopedIdField]: scopedId } : {}),
                },
            });
            logger.info(`[SocialLead] Existing contact ${phone} re-engaged via ${input.platform} ${input.surface}`);
        }

        // Timeline entry — keeps the original wording, which is what the agent needs to see.
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: phone,
                channel: input.platform,
                direction: 'inbound',
                event_type: `social_${input.surface}_lead`,
                content: `${input.platform} ${input.surface}${input.profileName ? ' from ' + input.profileName : ''}: ${String(input.text).slice(0, 400)}`,
                metadata: {
                    source: 'social_lead_capture',
                    platform: input.platform,
                    surface: input.surface,
                    profile_name: input.profileName || null,
                    external_user_id: input.externalUserId || null,
                    permalink: input.permalink || null,
                    media_id: input.mediaId || null,
                    ad_id: input.adId || null,
                    captured_phone: phone,
                },
            },
        });

        // Deal so the normal qualification cadence picks it up, exactly like other channels.
        try {
            const { ensureDealForLead } = await import('./ensure_deal');
            await ensureDealForLead({ contactPhone: phone, source });
        } catch (err) {
            logger.warn(`[SocialLead] ensureDealForLead failed for ${phone}: ${(err as Error).message}`);
        }

        return phone;
    } catch (err) {
        captureBackgroundError(err, {
            source: 'social_lead_capture',
            platform: input.platform,
            surface: input.surface,
        });
        return null;
    }
}
