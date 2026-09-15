/**
 * Social Replier Service
 *
 * Handles AI-powered replies to Instagram/Facebook comments and DMs.
 * All replies are:
 *   - Instant (no delay)
 *   - Casual tone (Panditji style)
 *   - Every comment/message gets a reply
 *   - Inquiries get public reply + private DM with WhatsApp link
 *
 * Supports:
 *   - Instagram comment public reply + private DM
 *   - Facebook Page comment public reply + private Messenger with WhatsApp button
 *   - Instagram DM reply (redirect to WhatsApp)
 *   - Facebook Messenger reply (Generic Template + WhatsApp button)
 */

import axios from 'axios';
import prisma from '../db';
import logger from '../utils/logger';
import { cacheGet, cacheSet } from '../utils/redis';

const GRAPH_API = 'https://graph.facebook.com/v25.0';

/**
 * ⭐ 2026-08-07 — THE FIX. This integration had never successfully sent a single reply:
 * 38 inbound comments/DMs, 0 successful sends, 65 failures, all
 * `Invalid OAuth access token - Cannot parse access token`.
 *
 * Cause: Instagram traffic was sent to `https://graph.instagram.com`, which only accepts
 * INSTAGRAM-scoped tokens (Instagram Login), while `IG_ACCESS_TOKEN` holds a FACEBOOK
 * system-user token. Wrong host AND wrong token type — so Meta could not even parse it.
 *
 * Instagram Messaging for a Page-linked professional account is served by the FACEBOOK
 * Graph API with a PAGE token. Proven on prod before changing anything:
 *   graph.instagram.com/me + system-user token  → Cannot parse access token  (the prod error)
 *   graph.facebook.com/me  + PAGE token         → {"name":"Realty Pandit","id":"905415725999343"}
 *   POST graph.facebook.com/me/messages + PAGE  → reaches endpoint ("recipient is required")
 *
 * `FB_PAGE_ACCESS_TOKEN` must hold a real PAGE token (derive with
 * `GET /{FB_PAGE_ID}?fields=access_token` using the system-user token) — assertPageToken()
 * below fails loudly at boot if it does not.
 */
const IG_GRAPH_API = GRAPH_API;
const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN || '';
const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || ACCESS_TOKEN;
const IG_ACCESS_TOKEN = PAGE_ACCESS_TOKEN;
const IG_ACCOUNT_ID = process.env.IG_BUSINESS_ACCOUNT_ID || '';
const PAGE_ID = process.env.FB_PAGE_ID || '';
const WHATSAPP_LINK = 'https://wa.me/918178491914?text=Hi%20Panditji';
const WHATSAPP_NUMBER = '+91 81784 91914';
const LOGO_URL = (process.env.WEBSITE_URL || 'https://realtypandit.in') + '/logo.png';

/**
 * Boot-time proof that the social send path can actually authenticate.
 *
 * This exists because of how the original bug survived for months: in May the feature was
 * marked "end-to-end verified with a signed test webhook" — which proves a webhook ARRIVES,
 * not that a reply SENDS. Every send failed from day one and nobody noticed, because a
 * failed send only produced a log line nobody was watching.
 *
 * Calls GET /me and asserts it returns OUR Page id. A system-user or user token returns a
 * different id (or errors), which is exactly the misconfiguration that caused this outage.
 * Never throws — a bad token must not stop the server booting, it must SHOUT.
 */
export async function assertPageToken(): Promise<boolean> {
    const pageId = process.env.FB_PAGE_ID || '';
    if (!PAGE_ACCESS_TOKEN) {
        logger.error('[SocialReplier] 🚨 FB_PAGE_ACCESS_TOKEN is empty — every Instagram/Facebook reply will fail.');
        return false;
    }
    try {
        const res = await axios.get(`${GRAPH_API}/me`, {
            params: { access_token: PAGE_ACCESS_TOKEN },
            timeout: 10000,
        });
        const id = String(res.data?.id || '');
        if (pageId && id !== pageId) {
            logger.error(
                `[SocialReplier] 🚨 FB_PAGE_ACCESS_TOKEN is NOT a Page token for this Page — ` +
                `/me returned id=${id} (${res.data?.name}), expected FB_PAGE_ID=${pageId}. ` +
                `Derive one with: GET /${pageId}?fields=access_token`,
            );
            return false;
        }
        logger.info(`[SocialReplier] ✅ Page token OK — /me = ${res.data?.name} (${id}). Social replies can send.`);
        return true;
    } catch (err: any) {
        const meta = err.response?.data?.error?.message || err.message;
        logger.error(`[SocialReplier] 🚨 Page token check FAILED: ${meta} — Instagram/Facebook replies will not send.`);
        return false;
    }
}

/**
 * Durable "we actually replied to this one" marker.
 *
 * The system has never had this — nothing anywhere recorded that a given comment or DM was
 * answered, which is why 38 unanswered events could accumulate invisibly and why a backlog
 * sweep had nothing to diff against.
 *
 * Stored in Redis rather than as an Interaction row on purpose: `Interaction.phone_number` is
 * a required FK to `contacts`, and most commenters/DM senders have no Contact (they never
 * shared a phone). An Interaction simply cannot be written for them — that is the same
 * constraint that makes logSocialInteraction silently drop first-touch users today.
 * 90 days is well beyond any Meta reply window, so it outlives every case that matters.
 */
const REPLY_MARKER_TTL = 90 * 24 * 3600;
export async function markReplySent(
    platform: string, surface: string, userId: string, eventId?: string,
): Promise<void> {
    try {
        const key = `social_replied:${eventId || `${platform}:${surface}:${userId}`}`;
        await cacheSet(key, JSON.stringify({ platform, surface, userId, at: new Date().toISOString() }), REPLY_MARKER_TTL);
    } catch { /* best-effort — never fail a successful reply over bookkeeping */ }
}

export async function wasReplySent(eventId: string): Promise<boolean> {
    try { return !!(await cacheGet(`social_replied:${eventId}`)); } catch { return false; }
}

// ─── Comment Classification ─────────────────────────────────────

type CommentType = 'property_inquiry' | 'general_positive' | 'general_question' | 'spam' | 'negative';

function classifyComment(text: string): CommentType {
    const lower = text.toLowerCase().trim();

    // Property inquiry signals
    const inquiryPatterns = [
        /price|rate|kya|kitna|kitne|cost|budget|available|bhk|flat|plot|house|villa|rent|buy|kharid|kiraya/i,
        /location|sector|noida|gurgaon|delhi|mumbai|kahan|where|address/i,
        /visit|dekhna|milna|appointment|booking|schedule/i,
        /loan|emi|payment|finance/i,
        /detail|info|jankari|batao|bataiye/i,
    ];
    if (inquiryPatterns.some(p => p.test(lower))) return 'property_inquiry';

    // Negative signals
    if (/fraud|scam|fake|cheater|bekar|bakwas|worst|complaint|report/.test(lower)) return 'negative';

    // Spam signals
    if (/follow me|check.*profile|earn.*money|free.*gift|click.*link|http/.test(lower)) return 'spam';

    // General positive
    if (/nice|beautiful|good|great|awesome|love|amazing|best|❤|🔥|👍|👌|wow/.test(lower)) return 'general_positive';

    return 'general_question';
}

// ─── Casual Reply Generator ─────────────────────────────────────

function generateCasualReply(commentType: CommentType, text: string, platform: 'instagram' | 'facebook'): string {
    switch (commentType) {
        case 'property_inquiry':
            return `Ji bilkul! 🏠 Panditji aapki help karne ke liye ready hai. WhatsApp pe message karo instant property details ke liye 👉 ${WHATSAPP_LINK}`;

        case 'general_positive':
            const positiveReplies = [
                `Shukriya! 🙏 Property dhundh rahe ho? WhatsApp pe Panditji se baat karo 👉 ${WHATSAPP_LINK}`,
                `Thank you! 😊 Agar property chahiye toh Panditji se WhatsApp pe connect karo 👉 ${WHATSAPP_LINK}`,
                `Dhanyavaad! 🙏 Koi bhi property query ho toh WhatsApp karo 👉 ${WHATSAPP_LINK}`,
            ];
            return positiveReplies[Math.floor(Math.random() * positiveReplies.length)];

        case 'general_question':
            return `Ji bataiye! 😊 Best assistance ke liye Panditji se WhatsApp pe baat karo — instant reply milega 👉 ${WHATSAPP_LINK}`;

        case 'negative':
            return ''; // Don't auto-reply to negative comments — flag for human review

        case 'spam':
            return ''; // Ignore spam

        default:
            return `🙏 WhatsApp pe Panditji se connect karo for instant help 👉 ${WHATSAPP_LINK}`;
    }
}

// ─── LLM-Contextual Reply ───────────────────────────────────────

/**
 * Answer what the person actually asked, then carry the WhatsApp CTA.
 *
 * Static replies meant "Location" and "Kya demand hai is ki" both got the same canned
 * paragraph. This answers the question and still routes them to WhatsApp — the link is the
 * POINT of the reply, not an optional extra, so ensureWhatsAppCta() enforces it even if the
 * model forgets.
 *
 * Runs inside the social-inbound WORKER, never on the webhook request path, so LLM latency
 * can never delay Meta's 200.
 *
 * Behind SOCIAL_LLM_REPLIES_ENABLED (default OFF, `!== 'true'` idiom). Any failure falls back
 * to the proven static template — a reply must ALWAYS go out.
 */
const SOCIAL_LLM_SYSTEM_PROMPT = `You are Panditji, a warm Indian real-estate assistant for Realty Pandit (Delhi NCR: Vaishali, Ghaziabad, Noida, Indirapuram, East Delhi).

Reply to this Instagram/Facebook message in ONE or TWO short sentences.

Rules:
- Mirror the sender's language exactly: Hinglish gets Hinglish, English gets English, Hindi gets Hindi.
- NEVER invent a price, address, availability, size or project name. You do not have listing data here. If they ask for specifics, say the team will share exact details on WhatsApp.
- Be warm and human, not corporate. No emoji spam — at most one.
- Do NOT include a URL or phone number; a WhatsApp link is appended automatically after your reply.
- Never claim to be a human, and never promise a callback time.`;

/** The model's own internal fallback text — treat it as a failure, never send it to a customer. */
const LLM_FAILURE_MARKERS = ['experiencing high traffic', 'try again'];

function ensureWhatsAppCta(reply: string): string {
    if (reply.includes('wa.me') || reply.includes(WHATSAPP_LINK)) return reply;
    return `${reply.trim()}\n\n👉 ${WHATSAPP_LINK}`;
}

async function buildReply(
    text: string,
    commentType: CommentType,
    platform: 'instagram' | 'facebook',
): Promise<string> {
    const staticReply = generateCasualReply(commentType, text, platform);
    if (process.env.SOCIAL_LLM_REPLIES_ENABLED !== 'true') return staticReply;
    if (!staticReply) return staticReply;   // spam/negative — stay silent, don't spend an LLM call

    try {
        // `./llm` exports the CLASS. The old `import { llmService }` was undefined at runtime
        // under ts-node --transpile-only, which is why it was never actually called.
        const { LLMService } = await import('./llm');
        const out = (await new LLMService().generateResponse(SOCIAL_LLM_SYSTEM_PROMPT, text) || '').trim();

        if (!out || out.length < 3 || LLM_FAILURE_MARKERS.some(m => out.toLowerCase().includes(m))) {
            logger.warn('[SocialReplier] LLM reply unusable, using static template');
            return staticReply;
        }
        return ensureWhatsAppCta(out);
    } catch (err) {
        logger.warn(`[SocialReplier] LLM reply failed, using static template: ${(err as Error).message}`);
        return staticReply;
    }
}

// ─── Instagram Comment Handler ──────────────────────────────────

export async function handleInstagramComment(data: {
    comment_id: string;
    text: string;
    from: { id: string; username: string };
    media_id: string;
    ad_id?: string;
    ad_title?: string;
}): Promise<void> {
    const { comment_id, text, from, media_id, ad_id } = data;
    logger.info(`[SocialReplier] Instagram comment from @${from.username}: "${text}"`);

    // Capture a CRM lead if they left a phone number. Independent of the reply below:
    // a public reply can fail (token/permission) but the lead must still be recorded.
    try {
        const { captureSocialLead } = await import('./social_lead_capture');
        await captureSocialLead({ platform: 'instagram', surface: 'comment', text, profileName: from.username, externalUserId: from.id, mediaId: data.media_id, adId: data.ad_id || null });
    } catch (e) { logger.warn('[SocialReplier] lead capture failed:', (e as Error).message); }

    const commentType = classifyComment(text);

    // Skip spam and negative (flag negative for review)
    if (commentType === 'spam') {
        logger.info(`[SocialReplier] Skipping spam comment from @${from.username}`);
        return;
    }
    if (commentType === 'negative') {
        logger.warn(`[SocialReplier] Negative comment from @${from.username} — flagging for review: "${text}"`);
        await logSocialInteraction('instagram', 'comment', from.id, from.username, text, 'negative_flagged', ad_id);
        return;
    }

    const reply = await buildReply(text, commentType, 'instagram');
    if (!reply) return;

    let publicOk = false, dmOk = false, lastErr = '';

    // 1. Public reply on the comment (instant — uses graph.instagram.com)
    try {
        await axios.post(
            `${IG_GRAPH_API}/${comment_id}/replies`,
            { message: reply },
            { params: { access_token: IG_ACCESS_TOKEN } }
        );
        publicOk = true;
        logger.info(`[SocialReplier] Public reply sent on Instagram comment ${comment_id}`);
    } catch (err: any) {
        lastErr = err.response?.data?.error?.message || err.message;
        logger.error(`[SocialReplier] Instagram public reply failed: ${lastErr}`);
    }

    // 2. Private DM with WhatsApp link (instant, 1 per comment, within 7 days)
    try {
        await axios.post(
            `${IG_GRAPH_API}/me/messages`,
            {
                recipient: { comment_id },
                message: { text: `Hey @${from.username}! 👋 Thanks for your interest. For instant property search & site visit booking, chat with Panditji on WhatsApp: ${WHATSAPP_LINK}\n\nPanditji is available 24/7! 🏠` },
            },
            { params: { access_token: IG_ACCESS_TOKEN } }
        );
        dmOk = true;
        logger.info(`[SocialReplier] Private DM sent to @${from.username}`);
    } catch (err: any) {
        // Private reply may fail if already sent one for this comment
        lastErr = err.response?.data?.error?.message || err.message;
        logger.warn(`[SocialReplier] Instagram private DM failed: ${lastErr}`);
    }

    await logSocialInteraction('instagram', 'comment', from.id, from.username, text, reply, ad_id);
    if (publicOk || dmOk) await markReplySent('instagram', 'comment', from.id, comment_id);
    // Retry only when NOTHING reached the user. A partial success must not retry — that would
    // post the public reply a second time.
    if (!publicOk && !dmOk) throw new Error(`IG comment reply failed for ${comment_id}: ${lastErr}`);
}

// ─── Instagram DM Handler ───────────────────────────────────────

export async function handleInstagramDM(data: {
    sender_id: string;
    text: string;
    message_id?: string;
}): Promise<void> {
    const { sender_id, text, message_id } = data;
    logger.info(`[SocialReplier] Instagram DM from ${sender_id}: "${text}"`);

    // Capture a CRM lead if they left a phone number. Independent of the reply below:
    // a public reply can fail (token/permission) but the lead must still be recorded.
    try {
        const { captureSocialLead } = await import('./social_lead_capture');
        await captureSocialLead({ platform: 'instagram', surface: 'dm', text, externalUserId: sender_id });
    } catch (e) { logger.warn('[SocialReplier] lead capture failed:', (e as Error).message); }

    // DMs previously bypassed classification entirely — every DM got the identical paragraph,
    // including obvious spam and abuse. Same gate the comment path has always had. (2026-08-07)
    const commentType = classifyComment(text);
    if (commentType === 'spam') {
        logger.info(`[SocialReplier] Skipping spam IG DM from ${sender_id}`);
        return;
    }
    if (commentType === 'negative') {
        logger.warn(`[SocialReplier] Negative IG DM from ${sender_id} — flagged for a human, no auto-reply: "${text}"`);
        await logSocialInteraction('instagram', 'dm', sender_id, undefined, text, 'negative_flagged');
        return;
    }

    // Contextual when SOCIAL_LLM_REPLIES_ENABLED=true, else the proven static template.
    // Either way the WhatsApp CTA is guaranteed present.
    const reply = await buildReply(text, commentType, 'instagram');
    if (!reply) return;

    let sent = false;
    let lastErr = '';
    try {
        await axios.post(
            `${IG_GRAPH_API}/me/messages`,
            {
                recipient: { id: sender_id },
                message: { text: reply },
            },
            { params: { access_token: IG_ACCESS_TOKEN } }
        );
        sent = true;
        logger.info(`[SocialReplier] Instagram DM reply sent to ${sender_id}`);
    } catch (err: any) {
        lastErr = err.response?.data?.error?.message || err.message;
        logger.error(`[SocialReplier] Instagram DM reply failed: ${lastErr}`);
    }

    await logSocialInteraction('instagram', 'dm', sender_id, undefined, text, reply);
    if (sent) await markReplySent('instagram', 'dm', sender_id, message_id);
    // Throw so the BullMQ worker retries. Before 2026-08-07 this was swallowed, which is how
    // 65 consecutive failures produced nothing but log lines.
    if (!sent) throw new Error(`Instagram DM reply failed for ${sender_id}: ${lastErr}`);
}

// ─── Facebook Page Comment Handler ──────────────────────────────

export async function handleFacebookComment(data: {
    comment_id: string;
    post_id: string;
    text: string;
    from: { id: string; name: string };
}): Promise<void> {
    const { comment_id, post_id, text, from } = data;
    logger.info(`[SocialReplier] Facebook comment from ${from.name}: "${text}"`);

    // Capture a CRM lead if they left a phone number. Independent of the reply below:
    // a public reply can fail (token/permission) but the lead must still be recorded.
    try {
        const { captureSocialLead } = await import('./social_lead_capture');
        await captureSocialLead({ platform: 'facebook', surface: 'comment', text, profileName: from.name, externalUserId: from.id, mediaId: post_id });
    } catch (e) { logger.warn('[SocialReplier] lead capture failed:', (e as Error).message); }

    const commentType = classifyComment(text);

    if (commentType === 'spam') return;
    if (commentType === 'negative') {
        logger.warn(`[SocialReplier] Negative FB comment from ${from.name} — flagging: "${text}"`);
        await logSocialInteraction('facebook', 'comment', from.id, from.name, text, 'negative_flagged');
        return;
    }

    const reply = await buildReply(text, commentType, 'facebook');
    if (!reply) return;

    let publicOk = false, dmOk = false, lastErr = '';

    // 1. Public reply on the comment (instant)
    try {
        await axios.post(
            `${GRAPH_API}/${comment_id}/comments`,
            { message: reply },
            { params: { access_token: PAGE_ACCESS_TOKEN } }
        );
        publicOk = true;
        logger.info(`[SocialReplier] Public reply sent on FB comment ${comment_id}`);
    } catch (err: any) {
        lastErr = err.response?.data?.error?.message || err.message;
        logger.error(`[SocialReplier] FB public reply failed: ${lastErr}`);
    }

    // 2. Private Messenger reply with WhatsApp button (Generic Template)
    try {
        await axios.post(
            `${GRAPH_API}/me/messages`,
            {
                recipient: { id: from.id },
                message: {
                    attachment: {
                        type: 'template',
                        payload: {
                            template_type: 'generic',
                            elements: [{
                                title: 'Chat with Panditji 🏠',
                                subtitle: 'Get instant property recommendations, photos & site visit booking on WhatsApp',
                                image_url: LOGO_URL,
                                buttons: [{
                                    type: 'web_url',
                                    url: WHATSAPP_LINK,
                                    title: 'Open WhatsApp',
                                }],
                            }],
                        },
                    },
                },
            },
            { params: { access_token: PAGE_ACCESS_TOKEN } }
        );
        dmOk = true;
        logger.info(`[SocialReplier] Messenger reply sent to ${from.name}`);
    } catch (err: any) {
        lastErr = err.response?.data?.error?.message || err.message;
        logger.warn(`[SocialReplier] FB Messenger reply failed: ${lastErr}`);
    }

    await logSocialInteraction('facebook', 'comment', from.id, from.name, text, reply);
    if (publicOk || dmOk) await markReplySent('facebook', 'comment', from.id, comment_id);
    if (!publicOk && !dmOk) throw new Error(`FB comment reply failed for ${comment_id}: ${lastErr}`);
}

// ─── Facebook Messenger Handler ─────────────────────────────────

export async function handleMessengerMessage(data: {
    sender_id: string;
    text: string;
    message_id?: string;
}): Promise<void> {
    const { sender_id, text, message_id } = data;
    logger.info(`[SocialReplier] Messenger from ${sender_id}: "${text}"`);

    let sent = false, lastErr = '';

    // Capture a CRM lead if they left a phone number. Independent of the reply below:
    // a public reply can fail (token/permission) but the lead must still be recorded.
    try {
        const { captureSocialLead } = await import('./social_lead_capture');
        await captureSocialLead({ platform: 'facebook', surface: 'dm', text, externalUserId: sender_id });
    } catch (e) { logger.warn('[SocialReplier] lead capture failed:', (e as Error).message); }

    // Same spam/negative gate as every other surface (Messenger bypassed it entirely before).
    // The reply below stays a Generic Template card — it already carries the WhatsApp CTA as a
    // tappable button, which converts better than a link in text, so it is NOT routed through
    // buildReply(). Contextual Messenger replies would need a text+card pair; not in scope here.
    const messengerType = classifyComment(text);
    if (messengerType === 'spam') {
        logger.info(`[SocialReplier] Skipping spam Messenger DM from ${sender_id}`);
        return;
    }
    if (messengerType === 'negative') {
        logger.warn(`[SocialReplier] Negative Messenger DM from ${sender_id} — flagged for a human, no auto-reply: "${text}"`);
        await logSocialInteraction('facebook', 'messenger', sender_id, undefined, text, 'negative_flagged');
        return;
    }

    // Reply with Generic Template + WhatsApp button (instant)
    try {
        await axios.post(
            `${GRAPH_API}/me/messages`,
            {
                recipient: { id: sender_id },
                message: {
                    attachment: {
                        type: 'template',
                        payload: {
                            template_type: 'generic',
                            elements: [{
                                title: 'Namaste! I\'m Panditji 🙏',
                                subtitle: 'Your AI property assistant. For instant property search, photos & site visit booking — let\'s chat on WhatsApp!',
                                image_url: LOGO_URL,
                                buttons: [
                                    {
                                        type: 'web_url',
                                        url: WHATSAPP_LINK,
                                        title: 'Chat on WhatsApp',
                                    },
                                    {
                                        type: 'web_url',
                                        url: process.env.WEBSITE_URL || 'https://realtypandit.in',
                                        title: 'Browse Properties',
                                    },
                                ],
                            }],
                        },
                    },
                },
            },
            { params: { access_token: PAGE_ACCESS_TOKEN } }
        );
        sent = true;
        logger.info(`[SocialReplier] Messenger template reply sent to ${sender_id}`);
    } catch (err: any) {
        lastErr = err.response?.data?.error?.message || err.message;
        logger.error(`[SocialReplier] Messenger reply failed: ${lastErr}`);
    }

    await logSocialInteraction('facebook', 'messenger', sender_id, undefined, text, 'template_reply');
    if (sent) await markReplySent('facebook', 'messenger', sender_id, message_id);
    if (!sent) throw new Error(`Messenger reply failed for ${sender_id}: ${lastErr}`);
}

// ─── Interaction Logger ─────────────────────────────────────────

async function logSocialInteraction(
    platform: string,
    type: string,
    userId: string,
    username: string | undefined,
    incomingText: string,
    replyText: string,
    adId?: string,
): Promise<void> {
    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return;

        // Try to find a contact linked to this social ID
        const socialField = platform === 'instagram' ? 'instagram_scoped_id' : 'facebook_scoped_id';
        let contact = await prisma.contact.findFirst({
            where: { [socialField]: userId },
            select: { phone_number: true },
        });

        // If no linked contact, log without phone_number FK (use raw SQL to bypass FK)
        if (contact) {
            await prisma.interaction.create({
                data: {
                    tenant_id: tenant.id,
                    phone_number: contact.phone_number,
                    channel: platform,
                    direction: 'inbound',
                    event_type: `social_${type}`,
                    content: incomingText,
                    metadata: {
                        platform, type, user_id: userId, username,
                        reply: replyText, ad_id: adId || undefined,
                    },
                },
            });
        } else {
            // No linked contact — log to a generic system log instead of interaction table
            logger.info(`[SocialReplier] Interaction from unlinked ${platform} user ${userId} (${username || 'unknown'}): "${incomingText}" → reply: "${replyText}"`);
        }
    } catch (err) {
        logger.warn(`[SocialReplier] Failed to log interaction: ${(err as Error).message}`);
    }
}
