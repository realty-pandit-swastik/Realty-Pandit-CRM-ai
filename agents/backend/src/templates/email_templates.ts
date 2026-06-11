/**
 * Realty Pandit — HTML Email Templates
 *
 * Blue-themed (matching website: primary #3b82f6, dark #1e3a5f)
 * - Panditji logo at top
 * - WhatsApp direct link (wa.me)
 * - Social links footer (Instagram @airealtypandit, Facebook Realty Pandit)
 * - Privacy + Data Deletion links
 *
 * Templates:
 *   1. Welcome Email
 *   2. Property Sharing Email
 *   3. Appointment Confirmation Email
 *   4. Re-engagement Email (dead/cold leads)
 */

const WEBSITE_URL = process.env.WEBSITE_URL || 'https://realtypandit.in';
const LOGO_URL = `${WEBSITE_URL}/logo.png`;
const INSTAGRAM_URL = 'https://www.instagram.com/airealtypandit';
const FACEBOOK_URL = 'https://www.facebook.com/realtypandit';
const WHATSAPP_NUMBER = '+91 81784 91914';
const WHATSAPP_LINK = 'https://wa.me/918178491914?text=Hi%20Panditji';

// Brand colors (from website globals.css)
const BLUE = '#3b82f6';
const BLUE_DARK = '#1e3a5f';
const BLUE_LIGHT = '#eff6ff'; // blue-50
const BLUE_BORDER = '#bfdbfe'; // blue-200
const SLATE_900 = '#0f172a';

// ─── Shared Layout ──────────────────────────────────────────────

function wrapLayout(content: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Realty Pandit</title>
</head>
<body style="margin: 0; padding: 0; background: #f1f5f9; font-family: 'Segoe UI', Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f1f5f9;">
        <tr>
            <td align="center" style="padding: 24px 16px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, ${SLATE_900} 0%, ${BLUE_DARK} 100%); padding: 28px 32px; text-align: center;">
                            <img src="${LOGO_URL}" alt="Realty Pandit" width="48" height="48" style="border-radius: 8px; margin-bottom: 8px;" />
                            <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 700; letter-spacing: 0.5px;">Realty Pandit</h1>
                            <p style="color: ${BLUE}; font-size: 13px; margin: 4px 0 0;">AI-Powered Real Estate Partner</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 32px;">
                            ${content}
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background: #f8fafc; padding: 24px 32px; border-top: 1px solid #e2e8f0;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center" style="padding-bottom: 16px;">
                                        <a href="${INSTAGRAM_URL}" style="display: inline-block; margin: 0 8px; text-decoration: none; color: ${BLUE}; font-size: 13px; font-weight: 600;">Instagram</a>
                                        <span style="color: #cbd5e1;">|</span>
                                        <a href="${FACEBOOK_URL}" style="display: inline-block; margin: 0 8px; text-decoration: none; color: ${BLUE}; font-size: 13px; font-weight: 600;">Facebook</a>
                                        <span style="color: #cbd5e1;">|</span>
                                        <a href="${WHATSAPP_LINK}" style="display: inline-block; margin: 0 8px; text-decoration: none; color: ${BLUE}; font-size: 13px; font-weight: 600;">WhatsApp</a>
                                        <span style="color: #cbd5e1;">|</span>
                                        <a href="${WEBSITE_URL}" style="display: inline-block; margin: 0 8px; text-decoration: none; color: ${BLUE}; font-size: 13px; font-weight: 600;">Website</a>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center" style="color: #94a3b8; font-size: 12px; line-height: 1.5;">
                                        <p style="margin: 0;">Realty Pandit Technologies Pvt. Ltd.</p>
                                        <p style="margin: 4px 0 0;">WhatsApp: ${WHATSAPP_NUMBER} | ${WEBSITE_URL}</p>
                                        <p style="margin: 8px 0 0;">
                                            <a href="${WEBSITE_URL}/privacy" style="color: #94a3b8; text-decoration: underline;">Privacy Policy</a>
                                            &nbsp;|&nbsp;
                                            <a href="${WEBSITE_URL}/data-deletion" style="color: #94a3b8; text-decoration: underline;">Data Deletion</a>
                                            &nbsp;|&nbsp;
                                            <a href="${WEBSITE_URL}/terms" style="color: #94a3b8; text-decoration: underline;">Terms</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

// ─── 1. Welcome Email ───────────────────────────────────────────

export function welcomeEmail(name: string): { subject: string; html: string } {
    const displayName = name || 'there';
    const content = `
        <h2 style="color: ${SLATE_900}; font-size: 20px; margin: 0 0 16px;">Namaste, ${displayName}!</h2>

        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
            Welcome to <strong>Realty Pandit</strong>! We're excited to help you find your perfect property.
        </p>

        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
            Our AI assistant <strong>Panditji</strong> is ready to help you 24/7 on WhatsApp. Just tell him what you're looking for — type, budget, location — and he'll find the best options for you.
        </p>

        <!-- WhatsApp Direct Link CTA -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
            <tr>
                <td align="center">
                    <a href="${WHATSAPP_LINK}" style="display: inline-block; background: #25D366; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 0 6px 8px;">
                        Chat with Panditji on WhatsApp
                    </a>
                </td>
            </tr>
        </table>

        <!-- Secondary CTAs -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 16px 0;">
            <tr>
                <td align="center">
                    <a href="${WEBSITE_URL}/properties" style="display: inline-block; background: ${BLUE}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; margin: 0 6px 8px;">
                        Browse Properties
                    </a>
                    <a href="${WEBSITE_URL}/schedule-visit" style="display: inline-block; background: #ffffff; color: ${BLUE}; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; border: 2px solid ${BLUE}; margin: 0 6px 8px;">
                        Schedule a Visit
                    </a>
                </td>
            </tr>
        </table>

        <!-- WhatsApp info box -->
        <div style="background: ${BLUE_LIGHT}; border-radius: 8px; padding: 16px 20px; margin: 20px 0; border-left: 4px solid ${BLUE};">
            <p style="color: ${BLUE_DARK}; font-size: 14px; margin: 0;">
                <strong>Panditji is available 24/7</strong> for property search, site visits, and expert guidance.
            </p>
            <p style="color: #64748b; font-size: 13px; margin: 6px 0 0;">
                <a href="${WHATSAPP_LINK}" style="color: ${BLUE}; text-decoration: underline;">Click here to start chatting on WhatsApp</a> or save our number: ${WHATSAPP_NUMBER}
            </p>
        </div>

        <p style="color: #64748b; font-size: 14px; line-height: 1.6; margin: 16px 0 0;">
            If you have any questions, simply reply to this email or reach out on WhatsApp. We're here to help!
        </p>

        <p style="color: #334155; font-size: 14px; margin: 20px 0 0;">
            Warm regards,<br/>
            <strong>Team Realty Pandit</strong>
        </p>
    `;
    return {
        subject: 'Welcome to Realty Pandit — Your AI Property Assistant',
        html: wrapLayout(content),
    };
}

// ─── 2. Property Sharing Email ──────────────────────────────────

export interface PropertyEmailData {
    type: string;
    location: string;
    price: string;
    bhk?: string;
    area?: string;
    image_url?: string;
    maps_link?: string;
    property_url?: string;
}

export function propertyEmail(name: string, properties: PropertyEmailData[]): { subject: string; html: string } {
    const displayName = name || 'there';
    const count = properties.length;

    const propertyCards = properties.map((p) => {
        const title = [p.bhk, p.type].filter(Boolean).join(' ');
        const details = [p.area, p.location].filter(Boolean).join(' | ');
        return `
            <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin: 12px 0; border: 1px solid #e2e8f0;">
                ${p.image_url ? `<img src="${p.image_url}" alt="${title}" width="100%" style="border-radius: 6px; margin-bottom: 12px; max-height: 200px; object-fit: cover;" />` : ''}
                <h3 style="color: ${SLATE_900}; font-size: 16px; margin: 0 0 6px;">${title}</h3>
                <p style="color: ${BLUE}; font-size: 18px; font-weight: 700; margin: 0 0 4px;">${p.price}</p>
                <p style="color: #64748b; font-size: 13px; margin: 0 0 12px;">${details}</p>
                <table role="presentation" cellspacing="0" cellpadding="0">
                    <tr>
                        ${p.property_url ? `<td style="padding-right: 8px;"><a href="${p.property_url}" style="display: inline-block; background: ${BLUE}; color: #fff; text-decoration: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600;">View Details</a></td>` : ''}
                        ${p.maps_link ? `<td style="padding-right: 8px;"><a href="${p.maps_link}" style="display: inline-block; background: #ffffff; color: #334155; text-decoration: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; border: 1px solid #cbd5e1;">View on Map</a></td>` : ''}
                        <td><a href="${WHATSAPP_LINK}" style="display: inline-block; background: #25D366; color: #fff; text-decoration: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600;">Ask Panditji</a></td>
                    </tr>
                </table>
            </div>
        `;
    }).join('');

    const content = `
        <h2 style="color: ${SLATE_900}; font-size: 20px; margin: 0 0 8px;">Hi ${displayName},</h2>
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
            Here ${count === 1 ? 'is a property' : `are ${count} properties`} that match your requirements:
        </p>

        ${propertyCards}

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
            <tr>
                <td align="center">
                    <a href="${WEBSITE_URL}/properties" style="display: inline-block; background: ${BLUE}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">
                        See All Properties
                    </a>
                </td>
            </tr>
        </table>

        <p style="color: #64748b; font-size: 13px; margin: 16px 0 0;">
            Interested? <a href="${WHATSAPP_LINK}" style="color: ${BLUE}; text-decoration: underline;">Chat with Panditji on WhatsApp</a> or reply to this email.
        </p>
    `;
    return {
        subject: `${count} ${count === 1 ? 'Property' : 'Properties'} Matching Your Requirements — Realty Pandit`,
        html: wrapLayout(content),
    };
}

// ─── 3. Appointment Confirmation Email ──────────────────────────

export function appointmentEmail(
    name: string,
    date: string,
    time: string,
    propertyInfo: string,
    agentName?: string,
): { subject: string; html: string } {
    const displayName = name || 'there';
    const content = `
        <h2 style="color: ${SLATE_900}; font-size: 20px; margin: 0 0 16px;">Visit Confirmed!</h2>

        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
            Hi ${displayName}, your property visit has been scheduled. Here are the details:
        </p>

        <div style="background: ${BLUE_LIGHT}; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid ${BLUE_BORDER};">
            <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
                <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 14px; width: 100px;">Property:</td>
                    <td style="padding: 6px 0; color: ${SLATE_900}; font-size: 14px; font-weight: 600;">${propertyInfo}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Date:</td>
                    <td style="padding: 6px 0; color: ${SLATE_900}; font-size: 14px; font-weight: 600;">${date}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Time:</td>
                    <td style="padding: 6px 0; color: ${SLATE_900}; font-size: 14px; font-weight: 600;">${time}</td>
                </tr>
                ${agentName ? `
                <tr>
                    <td style="padding: 6px 0; color: #64748b; font-size: 14px;">Executive:</td>
                    <td style="padding: 6px 0; color: ${SLATE_900}; font-size: 14px; font-weight: 600;">${agentName}</td>
                </tr>
                ` : ''}
            </table>
        </div>

        <div style="background: #fffbeb; border-radius: 8px; padding: 14px 20px; margin: 16px 0; border-left: 4px solid #f59e0b;">
            <p style="color: #92400e; font-size: 13px; margin: 0;">
                <strong>Reminder:</strong> You'll receive a WhatsApp reminder before the visit. Need to reschedule? <a href="${WHATSAPP_LINK}" style="color: #92400e; text-decoration: underline;">Message Panditji</a> or reply to this email.
            </p>
        </div>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
            <tr>
                <td align="center">
                    <a href="${WEBSITE_URL}/properties" style="display: inline-block; background: ${BLUE}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px;">
                        Browse More Properties
                    </a>
                </td>
            </tr>
        </table>

        <p style="color: #334155; font-size: 14px; margin: 20px 0 0;">
            See you there!<br/>
            <strong>Team Realty Pandit</strong>
        </p>
    `;
    return {
        subject: `Visit Confirmed — ${propertyInfo} on ${date}`,
        html: wrapLayout(content),
    };
}

// ─── 4. Re-engagement Email (Dead/Cold Leads) ──────────────────

export function reEngagementEmail(name: string, lastIntent?: string): { subject: string; html: string } {
    const displayName = name || 'there';
    const intentLine = lastIntent
        ? `We noticed you were looking to <strong>${lastIntent === 'rent' ? 'rent' : 'buy'}</strong> a property.`
        : `We noticed you were exploring properties with us.`;

    const content = `
        <h2 style="color: ${SLATE_900}; font-size: 20px; margin: 0 0 16px;">Still looking for the perfect property?</h2>

        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
            Hi ${displayName}, ${intentLine} We wanted to check in and see if you're still searching.
        </p>

        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
            Since your last visit, we've added <strong>new properties</strong> that might be a great fit for you. Our AI assistant Panditji can show you the latest options instantly.
        </p>

        <!-- WhatsApp CTA - Primary -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
            <tr>
                <td align="center">
                    <a href="${WHATSAPP_LINK}" style="display: inline-block; background: #25D366; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 0 6px 8px;">
                        Yes, Show Me New Properties
                    </a>
                </td>
            </tr>
        </table>

        <!-- Secondary CTA -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 8px 0;">
            <tr>
                <td align="center">
                    <a href="${WEBSITE_URL}/properties" style="display: inline-block; background: ${BLUE}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; margin: 0 6px 8px;">
                        Browse on Website
                    </a>
                    <a href="${WEBSITE_URL}/schedule-visit" style="display: inline-block; background: #ffffff; color: ${BLUE}; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; border: 2px solid ${BLUE}; margin: 0 6px 8px;">
                        Schedule a Visit
                    </a>
                </td>
            </tr>
        </table>

        <!-- What's New Box -->
        <div style="background: ${BLUE_LIGHT}; border-radius: 8px; padding: 16px 20px; margin: 24px 0; border-left: 4px solid ${BLUE};">
            <p style="color: ${BLUE_DARK}; font-size: 14px; font-weight: 600; margin: 0 0 6px;">What's new at Realty Pandit:</p>
            <ul style="color: #334155; font-size: 13px; margin: 0; padding-left: 18px; line-height: 1.8;">
                <li>New verified properties added daily</li>
                <li>AI-powered property matching — tell Panditji your budget and location</li>
                <li>Instant site visit booking on WhatsApp</li>
            </ul>
        </div>

        <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 16px 0 0;">
            Not interested anymore? No worries — just ignore this email and we won't bother you again. Or reply STOP to unsubscribe from future emails.
        </p>
    `;
    return {
        subject: 'Still looking for a property? New listings just for you — Realty Pandit',
        html: wrapLayout(content),
    };
}
