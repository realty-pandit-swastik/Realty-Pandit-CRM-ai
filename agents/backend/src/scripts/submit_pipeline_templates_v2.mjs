/**
 * Submit 18 missing pipeline templates (Stage 1–6) to Meta for approval.
 * Run: node src/scripts/submit_pipeline_templates_v2.mjs
 * Idempotent — skips templates that already exist on Meta.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const TOKEN = process.env.WHATSAPP_TOKEN;
const WABA = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v25.0'}`;

if (!TOKEN || !WABA) { console.error('Missing WHATSAPP_TOKEN or WHATSAPP_BUSINESS_ACCOUNT_ID'); process.exit(1); }

async function submit(t) {
    const url = `${GRAPH}/${WABA}/message_templates`;
    const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(t),
    });
    const j = await r.json();
    if (r.ok) {
        console.log(`OK    ${t.name}  =>  status=${j.status || 'PENDING'}  id=${j.id}`);
    } else {
        const code = j?.error?.code;
        const sub = j?.error?.error_subcode;
        const msg = j?.error?.message || JSON.stringify(j);
        if (code === 100 && (sub === 2388023 || /exists/i.test(msg))) {
            console.log(`SKIP  ${t.name}  =>  already exists`);
        } else {
            console.log(`FAIL  ${t.name}  =>  code=${code} sub=${sub} msg=${msg}`);
        }
    }
    await new Promise(r => setTimeout(r, 1000));
}

const templates = [

    // ── Stage 1 — NEW ──────────────────────────────────────────────

    {
        name: 'rp_call_attempted',
        language: 'en',
        category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Namaste {{1}}! Aapko call karne ki koshish ki — connect nahi ho saka. Kab free hain, please date aur time batayein — usi waqt call karenge.',
            example: { body_text: [['Amit']] },
        }, {
            type: 'BUTTONS',
            buttons: [{ type: 'QUICK_REPLY', text: 'Reply' }],
        }],
    },

    {
        name: 'rp_callback_manager_alert',
        language: 'en',
        category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Callback Request! Customer: {{1}} | Requested Time: {{2}} | Requirement: {{3}}. CRM update ho gaya hai — please call on time.',
            example: { body_text: [['Amit Sharma', '25 Apr at 4:00 PM', '2BHK in Sector 150, Budget 50L']] },
        }],
    },

    // ── Stage 2 — QUALIFIED ────────────────────────────────────────

    {
        name: 'rp_property_card',
        language: 'en',
        category: 'UTILITY',
        components: [{
            type: 'HEADER',
            format: 'IMAGE',
            example: { header_handle: ['https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800'] },
        }, {
            type: 'BODY',
            text: '{{1}} — {{2}}\n\n{{3}}\n{{4}}\n\n{{5}}',
            example: { body_text: [['3BHK Flat', 'ATS Greens', 'Sector 150, Noida', '75 Lakh', 'Newly renovated, 3rd floor, east facing. Gated society with pool and gym.']] },
        }, {
            type: 'BUTTONS',
            buttons: [
                { type: 'QUICK_REPLY', text: 'Call Back' },
                { type: 'QUICK_REPLY', text: 'Schedule Visit' },
                { type: 'QUICK_REPLY', text: 'Next Option' },
            ],
        }],
    },

    {
        name: 'rp_visit_availability',
        language: 'en',
        category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Visit ke liye aap kab available hain — please preferred date aur time share karein. Aapki convenience ke hisaab se arrange karenge.',
            example: { body_text: [[]] },
        }, {
            type: 'BUTTONS',
            buttons: [{ type: 'QUICK_REPLY', text: 'Reply' }],
        }],
    },

    {
        name: 'rp_cold_rent_nudge',
        language: 'en',
        category: 'MARKETING',
        components: [{
            type: 'BODY',
            text: 'Namaste {{1}}! Aapke area mein rental ke nayi options aa gayi hain — aapki requirement se match karti hain. Dekhna chahenge toh reply karein.',
            example: { body_text: [['Amit']] },
        }, {
            type: 'BUTTONS',
            buttons: [{ type: 'QUICK_REPLY', text: 'Haan, dikhao' }],
        }, {
            type: 'FOOTER',
            text: 'Reply STOP to opt out',
        }],
    },

    {
        name: 'rp_cold_buy_nudge',
        language: 'en',
        category: 'MARKETING',
        components: [{
            type: 'BODY',
            text: 'Namaste {{1}}! {{2}} mein {{3}} ki aapki talash ke liye ek accha update hai — aapke budget mein ek nayi property available hui hai. Interested hain toh reply karein.',
            example: { body_text: [['Amit', 'Sector 150 Noida', '2BHK Flat']] },
        }, {
            type: 'BUTTONS',
            buttons: [{ type: 'QUICK_REPLY', text: 'Haan, dikhao' }],
        }, {
            type: 'FOOTER',
            text: 'Reply STOP to opt out',
        }],
    },

    {
        name: 'rp_all_properties_shared',
        language: 'en',
        category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Filhaal aapki requirement se match karne wali saari properties share kar di hain. Jaise hi nayi option milegi — turant aapko batayenge. Koi aur help chahiye toh reply karein.',
            example: { body_text: [[]] },
        }, {
            type: 'BUTTONS',
            buttons: [{ type: 'QUICK_REPLY', text: 'Reply' }],
        }],
    },

    // ── Stage 3 — MATCHING_APPOINTMENT ────────────────────────────

    {
        name: 'rp_appt_pending_customer',
        language: 'en',
        category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Aapka appointment request hamare paas pahunch gaya hai — hum abhi confirm kar rahe hain. Thodi der mein aapko update mil jaayega.',
            example: { body_text: [[]] },
        }],
    },

    {
        name: 'rp_appt_confirm_reminder',
        language: 'en',
        category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Action Required! {{1}} ne {{2}} ke liye appointment request ki hai — {{3}}, {{4}}. Kripya CRM mein confirm karein.',
            example: { body_text: [['Amit Sharma', '26 Apr at 11:00 AM', '3BHK Flat', 'Sector 150, Noida']] },
        }],
    },

    {
        name: 'rp_appt_escalation',
        language: 'en',
        category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Escalation Alert! {{1}} ka appointment request {{2}} se pending hai — {{3}} ghante ho gaye, Lead Manager ne respond nahi kiya. Immediate action required.',
            example: { body_text: [['Amit Sharma', '26 Apr at 11:00 AM', '3']] },
        }],
    },

    // ── Stage 4 — VISIT_SCHEDULED ──────────────────────────────────

    {
        name: 'rp_visit_customer_confirmed',
        language: 'en',
        category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Attendance Confirmed! {{1}} ne aaj ki visit confirm kar di. {{2}} | {{3}}. Please ensure timely arrival.',
            example: { body_text: [['Amit Sharma', '3BHK Flat, Sector 150', '11:00 AM']] },
        }],
    },

    {
        name: 'rp_visit_manager_1hr',
        language: 'en',
        category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: '1 Ghante Mein Visit! {{1}} | {{2}} | {{3}} | {{4}}. Taiyaar ho jaayein.',
            example: { body_text: [['Amit Sharma', '3BHK Flat', 'Sector 150, Noida', '11:00 AM']] },
        }],
    },

    {
        name: 'rp_visit_daily_schedule',
        language: 'en',
        category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Aaj Ka Visit Schedule ({{1}})\n\n{{2}}\n\nSabhi visits ke liye taiyaar rahein. Koi change ho toh CRM update karein.',
            example: { body_text: [['25 Apr 2026', '1. Amit Sharma — 3BHK Sector 150 — 10:00 AM\n2. Priya Singh — 2BHK Sector 62 — 2:00 PM']] },
        }],
    },

    {
        name: 'rp_manager_noshow_alert',
        language: 'en',
        category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'No-Show Alert! Lead Manager {{1}} ke 3 consecutive visits no-show ho chuke hain. Immediate review required — please CRM check karein.',
            example: { body_text: [['Raj Kumar']] },
        }],
    },

    // ── Stage 6 — NEGOTIATION ──────────────────────────────────────

    {
        name: 'rp_negotiation_availability',
        language: 'en',
        category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Badhaai! Aapki deal negotiation stage mein hai. Aage badhne ke liye hamaari team aapse ek chhoti meeting karna chahti hai. Aap kab available hain — please preferred date aur time share karein.',
            example: { body_text: [[]] },
        }, {
            type: 'BUTTONS',
            buttons: [{ type: 'QUICK_REPLY', text: 'Reply' }],
        }],
    },

    {
        name: 'rp_negotiation_nudge',
        language: 'en',
        category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Meeting Pending! {{1}} ke saath negotiation meeting abhi tak schedule nahi hui — 48 ghante ho gaye. Please jald se jald meeting book karein.',
            example: { body_text: [['Amit Sharma']] },
        }],
    },

    {
        name: 'rp_negotiation_inactive',
        language: 'en',
        category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Inactivity Alert! {{1}} ki deal mein 14 din se koi progress nahi — deal ON_HOLD mein move ho gayi. Please follow-up karein ya deal close karein.',
            example: { body_text: [['Amit Sharma']] },
        }],
    },

    // ── ON_HOLD ────────────────────────────────────────────────────

    {
        name: 'rp_deal_onhold',
        language: 'en',
        category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Deal On Hold! {{1}} — {{2}}, {{3}}. Reason: {{4}}. CRM mein review karein — Revive ya Close karein.',
            example: { body_text: [['Amit Sharma', '2BHK Flat', 'Sector 150 Noida', '14 din se koi progress nahi']] },
        }],
    },
];

(async () => {
    console.log(`Submitting ${templates.length} pipeline templates to WABA ${WABA}...`);
    console.log('─'.repeat(60));
    for (const t of templates) await submit(t);
    console.log('─'.repeat(60));
    console.log('Done. Meta approval typically takes a few minutes to a few hours.');
    console.log('Check: WhatsApp Business Manager → Account Tools → Message Templates');
})();
