/**
 * One-shot script: submit the 3 pipeline templates pending Meta approval.
 *
 * Run: `npx tsx src/scripts/submit_pipeline_templates.ts`
 *
 * Requires WHATSAPP_TOKEN + WHATSAPP_BUSINESS_ACCOUNT_ID in env.
 *
 * Templates submitted:
 *   - rp_visit_confirmed_customer (Stage 3→4 transition customer message)
 *   - rp_visit_reminder_24hr      (24hr-before customer reminder, with Confirmed button)
 *   - rp_visit_reminder_2hr       (2hr-before customer reminder, with Confirmed button)
 *
 * Idempotency: Meta returns 400 with code 100 / subcode 2388023 if a template
 * with the same name+language already exists. The script logs that as a skip.
 */

import 'dotenv/config';

const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WABA_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;
const GRAPH_VERSION = process.env.WHATSAPP_API_VERSION || 'v25.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

if (!WABA_ID || !TOKEN) {
    console.error('Missing WHATSAPP_BUSINESS_ACCOUNT_ID or WHATSAPP_TOKEN env');
    process.exit(1);
}

interface MetaTemplate {
    name: string;
    language: string;
    category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
    components: any[];
}

const templates: MetaTemplate[] = [
    {
        name: 'rp_visit_confirmed_customer',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: '✅ Visit Confirm Ho Gaya! 📅 {{1}} | 🏠 {{2}} | 📍 Location: {{3}}\n\nTime pe pahunchen — hum wait karenge!',
                example: {
                    body_text: [['27 Apr at 11:00 AM', '3BHK Flat, Sector 150', 'https://maps.google.com/?q=28.5355,77.3910']],
                },
            },
        ],
    },
    {
        name: 'rp_visit_reminder_24hr',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: '⏰ Kal aapka visit hai! 📅 {{1}} | 🏠 {{2}}\n\nReply "Confirmed" if you can attend, ya reschedule karna ho toh batayein.',
                example: { body_text: [['27 Apr at 11:00 AM', '3BHK Flat, Sector 150']] },
            },
            {
                type: 'BUTTONS',
                buttons: [{ type: 'QUICK_REPLY', text: 'Confirmed' }],
            },
        ],
    },
    {
        name: 'rp_visit_reminder_2hr',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: '🔔 2 ghante mein visit! 📅 {{1}} | 🏠 {{2}} | 📍 Maps: {{3}}\n\nTime pe pahunchen — hum wait karenge!',
                example: {
                    body_text: [['11:00 AM', '3BHK Flat, Sector 150', 'https://maps.google.com/?q=28.5355,77.3910']],
                },
            },
            {
                type: 'BUTTONS',
                buttons: [{ type: 'QUICK_REPLY', text: 'Confirmed' }],
            },
        ],
    },
];

async function submit(t: MetaTemplate): Promise<void> {
    const url = `${GRAPH_BASE}/${WABA_ID}/message_templates`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(t),
    });
    const json: any = await res.json();
    if (res.ok) {
        console.log(`✓ ${t.name} → status=${json.status || 'PENDING'} id=${json.id}`);
    } else {
        const errCode = json?.error?.code;
        const errSub = json?.error?.error_subcode;
        const errMsg = json?.error?.message || JSON.stringify(json);
        if (errCode === 100 && (errSub === 2388023 || /exists/i.test(errMsg))) {
            console.log(`• ${t.name} → already exists, skipping`);
        } else {
            console.error(`✗ ${t.name} FAILED: code=${errCode} subcode=${errSub} msg=${errMsg}`);
        }
    }
}

(async () => {
    console.log(`Submitting ${templates.length} templates to WABA ${WABA_ID}...`);
    for (const t of templates) {
        await submit(t);
    }
    console.log('Done. Approval typically takes minutes to hours; check WhatsApp Manager → Message templates.');
})();
