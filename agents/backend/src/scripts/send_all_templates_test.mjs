/**
 * Test script: send all 60 approved WhatsApp templates to a test number.
 * Run: node src/scripts/send_all_templates_test.mjs
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const TOKEN = process.env.WHATSAPP_TOKEN;
const WABA = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v25.0'}`;
const TO = '919958860411';

async function getPhoneId() {
    const r = await fetch(`${GRAPH}/${WABA}/phone_numbers?access_token=${TOKEN}`);
    const j = await r.json();
    return j.data?.[0]?.id;
}

async function send(phoneId, template) {
    const r = await fetch(`${GRAPH}/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: TO, type: 'template', template }),
    });
    return r.json();
}

function t(name, lang, components) {
    return { name, lang, components };
}

const B = (params) => ({ type: 'body', parameters: params.map(text => ({ type: 'text', text })) });
const QR = (i, payload) => ({ type: 'button', sub_type: 'quick_reply', index: String(i), parameters: [{ type: 'payload', payload }] });
const AUTH_BTN = (code) => ({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] });

const templates = [
    // ── AUTHENTICATION (4) ──────────────────────────────────────────
    t('rp_user_otp', 'en', [B(['123456']), AUTH_BTN('123456')]),
    t('rp_password_reset_v2', 'en', [B(['654321']), AUTH_BTN('654321')]),
    t('rp_agent_otp', 'en', [B(['789012']), AUTH_BTN('789012')]),
    t('rp_partner_login_otp_v2', 'en', [B(['111222']), AUTH_BTN('111222')]),

    // ── ONBOARDING / WELCOME (7) ─────────────────────────────────────
    t('rp_whatsapp_link_v2', 'en', [QR(0, 'yes'), QR(1, 'no')]),
    t('rp_partner_registered_v2', 'en', [B(['Sunny Sharma', 'Raj Kumar'])]),
    t('rp_partner_welcome_v2', 'en', [B(['Sunny Sharma', 'Raj Kumar']), QR(0, 'open_portal')]),
    t('rp_partner_upload_nudge', 'en', [B(['Sunny']), QR(0, 'open_portal')]),
    t('rp_partner_upload_reminder', 'en', [B(['Sunny', 'Raj Kumar']), QR(0, 'upload'), QR(1, 'talk_coord')]),
    t('rp_partner_share_lead', 'en', [B(['Sunny'])]),
    t('rp_team_welcome_v4', 'en', [B(['Sunny Sharma', 'Raj Kumar'])]),

    // ── APPOINTMENT (2) ───────────────────────────────────────────────
    t('rp_appointment_confirm', 'en', [
        B(['3BHK Flat', 'Sector 150 Noida', '27 Apr 2026', '11:00 AM', 'Raj Kumar (+919876543210)', 'https://maps.google.com/?q=28.5355,77.3910']),
        QR(0, 'confirm'), QR(1, 'reschedule'),
    ]),
    t('rp_appointment_reminder', 'en', [B(['3BHK Flat Visit', '27 Apr 2026', '11:00 AM']), QR(0, 'confirm'), QR(1, 'reschedule')]),

    // ── SITE VISIT NOTIFICATIONS (3) ─────────────────────────────────
    t('rp_visit_agent_notify_v3', 'en', [B(['Sunny Sharma', '3BHK in Sector 150', '75 Lakh', 'ATS Greens Sector 150 Noida', 'Website AI Chat'])]),
    t('rp_visit_keyholder_v2', 'en', [
        B(['3BHK Flat', 'ATS Greens Sector 150', 'Sunny Sharma', '27 Apr 2026', '11:00 AM']),
        QR(0, 'ill_be_there'), QR(1, 'sending_keys'), QR(2, 'reschedule'),
    ]),
    t('rp_visit_mgmt_alert_v2', 'en', [B(['4BHK Villa', '2.5 Cr', 'Sunny Sharma', 'Raj Kumar'])]),

    // ── MISSED CALL / NO-SHOW (2) ─────────────────────────────────────
    t('rp_missed_call_v2', 'en', [QR(0, 'reply')]),
    t('rp_noshow_recovery', 'en', [QR(0, 'reschedule')]),

    // ── TX FOLLOWUPS (6) ──────────────────────────────────────────────
    t('rp_tx_followup_new_v2', 'en', [B(['purchasing a property'])]),
    t('rp_tx_followup_matched_v2', 'en', [B(['2BHK Flat', 'Sector 150 Noida']), QR(0, 'schedule_visit')]),
    t('rp_tx_visit_reminder_1d', 'en', [QR(0, 'confirm'), QR(1, 'reschedule')]),
    t('rp_tx_visit_reminder_2h', 'en', [B(['https://maps.google.com/?q=28.5355,77.3910']), QR(0, 'confirmed')]),
    t('rp_tx_followup_visited_v2', 'en', [B(['Sector 150 Noida'])]),
    t('rp_tx_followup_negotiation_v3', 'en', []),

    // ── TX STATUS (7) ─────────────────────────────────────────────────
    t('rp_tx_created_v2', 'en', [B(['Sunny', 'Raj Kumar', ''])]),
    t('rp_tx_lead_assigned_v2', 'en', [B(['Sunny Sharma', '3BHK Flat', 'Sector 150', '75 Lakh', 'Sale', 'Website'])]),
    t('rp_tx_match_buyer_v2', 'en', [B(['3BHK Flat', 'Sector 150 Noida', '75 Lakh']), QR(0, 'schedule_visit')]),
    t('rp_tx_match_seller', 'en', [B(['buyer', 'Sector 150 Noida'])]),
    t('rp_tx_visit_buyer', 'en', [B(['3BHK Flat', 'Sector 150 Noida', '27 Apr 2026', '11:00 AM', 'Aapke exec: Raj Kumar']), QR(0, 'confirm')]),
    t('rp_tx_visit_seller', 'en', [B(['Sector 150 Noida', '27 Apr 2026', '11:00 AM', 'buyer'])]),
    t('rp_tx_deal_closed_v2', 'en', [B(['3BHK Flat', 'Sector 150 Noida', ' — 75 Lakh mein'])]),

    // ── MISC UTILITY (4) ──────────────────────────────────────────────
    t('rp_daily_report_v3', 'en', [B(['25 Apr 2026', '12', '45'])]),
    t('rp_executive_reassigned_v2', 'en', [B(['Sunny', 'Raj Kumar', 'purchase'])]),
    t('rp_inventory_confirmed', 'en', [B(['Sunny', '3BHK Flat', 'Sector 150 Noida', '75 Lakh', 'INV-12345'])]),
    t('rp_partner_inventory_matched', 'en', [B(['Sunny', '3BHK Flat', 'Sector 150 Noida', '75 Lakh', 'Raj Kumar'])]),
    t('rp_partner_client_matched', 'en', [B(['Sunny', '3BHK Flat', 'Sector 150 Noida', '75 Lakh', 'Raj Kumar'])]),

    // ── WELCOME / SESSION OPENERS (4) ────────────────────────────────
    t('rp_buyer_lead_received_v2', 'en', [B(['Sunny']), QR(0, 'reply')]),
    t('rp_welcome_buyer_v3', 'en', [B(['Sunny']), QR(0, 'reply')]),
    t('rp_welcome_seller_v3', 'en', [B(['Sunny']), QR(0, 'reply')]),
    t('rp_reopen_session_v3', 'en', [B(['Sunny', 'property search']), QR(0, 'reply')]),

    // ── MARKETING (5) ─────────────────────────────────────────────────
    t('rp_whatsapp_invite_v2', 'en', [QR(0, 'haan_batao')]),
    t('rp_tx_followup_won_v2', 'en', []),
    t('rp_tx_followup_lost_v2', 'en', [B(['2BHK Flat', 'Sector 150 Noida']), QR(0, 'haan_dikhao')]),
    t('rp_new_listing_v2', 'en', [B(['3BHK Flat', 'Sector 150 Noida', '75 Lakh']), QR(0, 'view_details')]),
    t('rp_generic_followup_v2', 'en', [B(['Sunny', '3BHK Flat', 'Sector 150 Noida']), QR(0, 'haan_dikhao')]),

    // ── DEAL MANAGEMENT (6) ───────────────────────────────────────────
    t('rp_deal_created', 'en', [B(['Sunny Sharma', '3BHK Flat', 'Sector 150 Noida', '75L - 1Cr'])]),
    t('rp_deal_matched', 'en', [B(['3BHK Flat', 'Sector 150 Noida', '75 Lakh', 'Raj Kumar'])]),
    t('rp_deal_status_update', 'en', [B(['3BHK Flat', 'Sector 150 Noida', 'Visit Scheduled', 'Visit on 27 Apr at 11 AM.'])]),
    t('rp_deal_query', 'en', [B(['3BHK Flat', 'Sector 150 Noida', 'Property kab available hogi'])]),
    t('rp_deal_query_answered', 'en', [B(['Property kab available hogi', '3BHK Flat', 'Agla mahine se available hai.'])]),
    t('rp_deal_closed_lost', 'en', [B(['3BHK Flat', 'Sector 150 Noida', 'Budget mismatch'])]),

    // ── PIPELINE STAGE 1 — NEW (2) ────────────────────────────────────
    t('rp_call_attempted', 'en', [B(['Sunny']), QR(0, 'reply')]),
    t('rp_callback_manager_alert', 'en', [B(['Sunny Sharma', '25 Apr at 5:00 PM', '3BHK in Sector 150 Budget 75L'])]),

    // ── PIPELINE STAGE 2 — QUALIFIED (5) ─────────────────────────────
    t('rp_property_card', 'en', [
        { type: 'header', parameters: [{ type: 'image', image: { link: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800' } }] },
        B(['3BHK Flat', 'ATS Greens', 'Sector 150 Noida', '75 Lakh', 'Newly renovated 3rd floor east facing. Gated society with pool and gym.']),
        QR(0, 'call_back'), QR(1, 'schedule_visit'), QR(2, 'next_option'),
    ]),
    t('rp_visit_availability', 'en', [QR(0, 'reply')]),
    t('rp_cold_rent_nudge', 'en', [B(['Sunny']), QR(0, 'haan_dikhao')]),
    t('rp_cold_buy_nudge', 'en', [B(['Sunny', 'Sector 150 Noida', '3BHK Flat']), QR(0, 'haan_dikhao')]),
    t('rp_all_properties_shared', 'en', [QR(0, 'reply')]),

    // ── PIPELINE STAGE 3 — MATCHING_APPOINTMENT (3) ───────────────────
    t('rp_appt_pending_customer', 'en', []),
    t('rp_appt_confirm_reminder', 'en', [B(['Sunny Sharma', '27 Apr at 11:00 AM', '3BHK Flat', 'Sector 150 Noida'])]),
    t('rp_appt_escalation', 'en', [B(['Sunny Sharma', '27 Apr at 11:00 AM', '3'])]),

    // ── PIPELINE STAGE 4 — VISIT_SCHEDULED (4) ───────────────────────
    t('rp_visit_customer_confirmed', 'en', [B(['Sunny Sharma', '3BHK Flat Sector 150', '11:00 AM'])]),
    t('rp_visit_manager_1hr', 'en', [B(['Sunny Sharma', '3BHK Flat', 'Sector 150 Noida', '11:00 AM'])]),
    t('rp_visit_daily_schedule', 'en', [B(['25 Apr 2026', '1. Sunny Sharma — 3BHK Sector 150 — 10:00 AM\n2. Priya Singh — 2BHK Sector 62 — 2:00 PM'])]),
    t('rp_manager_noshow_alert', 'en', [B(['Raj Kumar'])]),

    // ── PIPELINE STAGE 6 — NEGOTIATION (3) ───────────────────────────
    t('rp_negotiation_availability', 'en', [QR(0, 'reply')]),
    t('rp_negotiation_nudge', 'en', [B(['Sunny Sharma'])]),
    t('rp_negotiation_inactive', 'en', [B(['Sunny Sharma'])]),

    // ── ON_HOLD (1) ───────────────────────────────────────────────────
    t('rp_deal_onhold', 'en', [B(['Sunny Sharma', '3BHK Flat', 'Sector 150 Noida', '14 din se koi progress nahi'])]),

    // ── VISIT REMINDERS (3) ───────────────────────────────────────────
    t('rp_visit_reminder_24hr', 'en', [B(['27 Apr at 11:00 AM', '3BHK Flat Sector 150']), QR(0, 'confirmed')]),
    t('rp_visit_reminder_2hr', 'en', [B(['11:00 AM', '3BHK Flat Sector 150', 'https://maps.google.com/?q=28.5355,77.3910']), QR(0, 'confirmed')]),
    t('rp_visit_confirmed_customer', 'en', [B(['27 Apr at 11:00 AM', '3BHK Flat Sector 150', 'https://maps.google.com/?q=28.5355,77.3910'])]),
];

async function main() {
    if (!TOKEN || !WABA) { console.error('Missing WHATSAPP_TOKEN or WHATSAPP_BUSINESS_ACCOUNT_ID'); process.exit(1); }

    const phoneId = await getPhoneId();
    console.log(`Phone ID: ${phoneId}`);
    console.log(`Sending ${templates.length} templates to +${TO}`);
    console.log('─'.repeat(60));

    let ok = 0, fail = 0;
    for (const tmpl of templates) {
        const payload = { name: tmpl.name, language: { code: tmpl.lang }, components: tmpl.components };
        const res = await send(phoneId, payload);
        if (res.messages?.[0]?.id) {
            console.log(`OK    ${tmpl.name}`);
            ok++;
        } else {
            const err = res.error?.message || res.error?.error_data?.details || JSON.stringify(res);
            console.log(`FAIL  ${tmpl.name}  →  ${err}`);
            fail++;
        }
        await new Promise(r => setTimeout(r, 2500));
    }

    console.log('─'.repeat(60));
    console.log(`Done: ${ok} sent  |  ${fail} failed`);
}

main().catch(console.error);
