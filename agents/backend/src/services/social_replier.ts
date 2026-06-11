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
import { llmService } from './llm';
import prisma from '../db';
import logger from '../utils/logger';

const GRAPH_API = 'https://graph.facebook.com/v25.0';
const IG_GRAPH_API = 'https://graph.instagram.com/v25.0';
const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN || '';
const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || ACCESS_TOKEN;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN || ACCESS_TOKEN;
const IG_ACCOUNT_ID = process.env.IG_BUSINESS_ACCOUNT_ID || '';
const PAGE_ID = process.env.FB_PAGE_ID || '';
const WHATSAPP_LINK = 'https://wa.me/918178491914?text=Hi%20Panditji';
const WHATSAPP_NUMBER = '+91 81784 91914';
const LOGO_URL = (process.env.WEBSITE_URL || 'https://realtypandit.in') + '/logo.png';

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

    const reply = generateCasualReply(commentType, text, 'instagram');
    if (!reply) return;

    // 1. Public reply on the comment (instant — uses graph.instagram.com)
    try {
        await axios.post(
            `${IG_GRAPH_API}/${comment_id}/replies`,
            { message: reply },
            { params: { access_token: IG_ACCESS_TOKEN } }
        );
        logger.info(`[SocialReplier] Public reply sent on Instagram comment ${comment_id}`);
    } catch (err: any) {
        logger.error(`[SocialReplier] Instagram public reply failed: ${err.response?.data?.error?.message || err.message}`);
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
        logger.info(`[SocialReplier] Private DM sent to @${from.username}`);
    } catch (err: any) {
        // Private reply may fail if already sent one for this comment
        logger.warn(`[SocialReplier] Instagram private DM failed: ${err.response?.data?.error?.message || err.message}`);
    }

    await logSocialInteraction('instagram', 'comment', from.id, from.username, text, reply, ad_id);
}

// ─── Instagram DM Handler ───────────────────────────────────────

export async function handleInstagramDM(data: {
    sender_id: string;
    text: string;
    message_id?: string;
}): Promise<void> {
    const { sender_id, text } = data;
    logger.info(`[SocialReplier] Instagram DM from ${sender_id}: "${text}"`);

    // Reply with WhatsApp redirect (instant)
    const reply = `Namaste! 🙏 I'm Panditji, your AI property assistant.\n\nFor the best experience with property search, photos, and instant site visit booking, let's chat on WhatsApp:\n\n👉 ${WHATSAPP_LINK}\n\nPanditji is available 24/7 on WhatsApp! 🏠`;

    try {
        await axios.post(
            `${IG_GRAPH_API}/me/messages`,
            {
                recipient: { id: sender_id },
                message: { text: reply },
            },
            { params: { access_token: IG_ACCESS_TOKEN } }
        );
        logger.info(`[SocialReplier] Instagram DM reply sent to ${sender_id}`);
    } catch (err: any) {
        logger.error(`[SocialReplier] Instagram DM reply failed: ${err.response?.data?.error?.message || err.message}`);
    }

    await logSocialInteraction('instagram', 'dm', sender_id, undefined, text, reply);
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

    const commentType = classifyComment(text);

    if (commentType === 'spam') return;
    if (commentType === 'negative') {
        logger.warn(`[SocialReplier] Negative FB comment from ${from.name} — flagging: "${text}"`);
        await logSocialInteraction('facebook', 'comment', from.id, from.name, text, 'negative_flagged');
        return;
    }

    const reply = generateCasualReply(commentType, text, 'facebook');
    if (!reply) return;

    // 1. Public reply on the comment (instant)
    try {
        await axios.post(
            `${GRAPH_API}/${comment_id}/comments`,
            { message: reply },
            { params: { access_token: PAGE_ACCESS_TOKEN } }
        );
        logger.info(`[SocialReplier] Public reply sent on FB comment ${comment_id}`);
    } catch (err: any) {
        logger.error(`[SocialReplier] FB public reply failed: ${err.response?.data?.error?.message || err.message}`);
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
        logger.info(`[SocialReplier] Messenger reply sent to ${from.name}`);
    } catch (err: any) {
        logger.warn(`[SocialReplier] FB Messenger reply failed: ${err.response?.data?.error?.message || err.message}`);
    }

    await logSocialInteraction('facebook', 'comment', from.id, from.name, text, reply);
}

// ─── Facebook Messenger Handler ─────────────────────────────────

export async function handleMessengerMessage(data: {
    sender_id: string;
    text: string;
    message_id?: string;
}): Promise<void> {
    const { sender_id, text } = data;
    logger.info(`[SocialReplier] Messenger from ${sender_id}: "${text}"`);

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
        logger.info(`[SocialReplier] Messenger template reply sent to ${sender_id}`);
    } catch (err: any) {
        logger.error(`[SocialReplier] Messenger reply failed: ${err.response?.data?.error?.message || err.message}`);
    }

    await logSocialInteraction('facebook', 'messenger', sender_id, undefined, text, 'template_reply');
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
