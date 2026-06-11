/**
 * Meta WhatsApp Template Submission Script
 * Submits 8 improved template versions to replace poorly-formatted originals.
 *
 * Run: npx ts-node --project tsconfig.json scripts/submit_improved_templates.ts
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TOKEN = process.env.WHATSAPP_TOKEN;
const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

if (!TOKEN || !WABA_ID) {
    console.error('Missing WHATSAPP_TOKEN or WHATSAPP_BUSINESS_ACCOUNT_ID in .env');
    process.exit(1);
}

const BASE_URL = `https://graph.facebook.com/v25.0/${WABA_ID}/message_templates`;

interface TemplateSubmission {
    registryKey: string;
    oldMetaName: string;
    newMetaName: string;
    payload: object;
}

// ─── 8 improved templates ────────────────────────────────────────────────────

const TEMPLATES: TemplateSubmission[] = [

    // ─── 1. rp_buyer_lead_received_v3 ────────────────────────────────────────
    // Used: lead_notifications.ts — first message to every new buyer lead
    // Fix: break one-paragraph into greeting + intro + CTA lines
    {
        registryKey: 'rp_buyer_lead_received',
        oldMetaName: 'rp_buyer_lead_received_v2',
        newMetaName: 'rp_buyer_lead_received_v3',
        payload: {
            name: 'rp_buyer_lead_received_v3',
            language: 'en',
            category: 'UTILITY',
            components: [
                {
                    type: 'BODY',
                    text:
                        '🏠 Namaste {{1}}!\n\n' +
                        'Realty Pandit par aapki property enquiry mili — shukriya!\n\n' +
                        'Main Panditji hoon — aapka AI property assistant. Seedha is WhatsApp par reply karein aur apni requirement batayein — best options turant dhundh deta hoon.\n\n' +
                        'Ya abhi verified properties bhi dekh sakte hain:\n' +
                        '👉 https://realtypandit.in/properties',
                    example: { body_text: [['Amit']] },
                },
                {
                    type: 'BUTTONS',
                    buttons: [{ type: 'QUICK_REPLY', text: 'Reply' }],
                },
            ],
        },
    },

    // ─── 2. rp_welcome_buyer_v4 ──────────────────────────────────────────────
    // Used: lead_auto_engage.ts — AI opening message when engaging a buyer
    // Fix: break into greeting + intro + bulleted requirement ask
    {
        registryKey: 'rp_welcome_buyer',
        oldMetaName: 'rp_welcome_buyer_v3',
        newMetaName: 'rp_welcome_buyer_v4',
        payload: {
            name: 'rp_welcome_buyer_v4',
            language: 'en',
            category: 'UTILITY',
            components: [
                {
                    type: 'BODY',
                    text:
                        '🏠 Namaste {{1}}! Realty Pandit mein swagat hai. 🙏\n\n' +
                        'Main Panditji hoon — aapka AI property assistant.\n\n' +
                        'Apni requirement batayein:\n' +
                        '📍 Location (jaise: Noida, Indirapuram)\n' +
                        '🏷️ Type (flat / plot / villa)\n' +
                        '💰 Budget range\n\n' +
                        'Aapke liye best options turant dhundh deta hoon!',
                    example: { body_text: [['Amit']] },
                },
                {
                    type: 'BUTTONS',
                    buttons: [{ type: 'QUICK_REPLY', text: 'Reply' }],
                },
            ],
        },
    },

    // ─── 3. rp_welcome_seller_v4 ─────────────────────────────────────────────
    // Used: seller onboarding flow — AI opening message for sellers
    // Fix: break into greeting + intro + bulleted property info ask
    {
        registryKey: 'rp_welcome_seller',
        oldMetaName: 'rp_welcome_seller_v3',
        newMetaName: 'rp_welcome_seller_v4',
        payload: {
            name: 'rp_welcome_seller_v4',
            language: 'en',
            category: 'UTILITY',
            components: [
                {
                    type: 'BODY',
                    text:
                        '🏠 Namaste {{1}}! Realty Pandit mein swagat hai. 🙏\n\n' +
                        'Main Panditji hoon — aapka AI property assistant.\n\n' +
                        'Apni property list karein:\n' +
                        '🏷️ Type (flat / house / plot / villa)\n' +
                        '📍 Location\n' +
                        '💰 Asking price\n\n' +
                        'Best buyer dhundh kar jaldi deal close karenge!',
                    example: { body_text: [['Amit']] },
                },
                {
                    type: 'BUTTONS',
                    buttons: [{ type: 'QUICK_REPLY', text: 'Reply' }],
                },
            ],
        },
    },

    // ─── 4. rp_reopen_session_v4 ─────────────────────────────────────────────
    // Used: session_tracker.ts, scheduled_worker.ts, pending_message_queue.ts
    // Fix: single paragraph — add line breaks between greeting and context
    {
        registryKey: 'rp_reopen_session',
        oldMetaName: 'rp_reopen_session_v3',
        newMetaName: 'rp_reopen_session_v4',
        payload: {
            name: 'rp_reopen_session_v4',
            language: 'en',
            category: 'UTILITY',
            components: [
                {
                    type: 'BODY',
                    text:
                        '🔔 Namaste {{1}}!\n\n' +
                        'Main Panditji hoon — Realty Pandit se.\n\n' +
                        'Aapki property {{2}} ke baare mein ek update hai — reply karein aur conversation continue karte hain.',
                    example: { body_text: [['Amit', 'search']] },
                },
                {
                    type: 'BUTTONS',
                    buttons: [{ type: 'QUICK_REPLY', text: 'Reply' }],
                },
            ],
        },
    },

    // ─── 5. rp_appointment_confirm_v2 ────────────────────────────────────────
    // Used: calendar.ts — appointment confirmation sent to customer
    // Fix: pipe-separated fields → line-break-separated fields
    {
        registryKey: 'rp_appointment_confirm',
        oldMetaName: 'rp_appointment_confirm',
        newMetaName: 'rp_appointment_confirm_v2',
        payload: {
            name: 'rp_appointment_confirm_v2',
            language: 'en',
            category: 'UTILITY',
            components: [
                {
                    type: 'BODY',
                    text:
                        '✅ Appointment Confirm!\n\n' +
                        '🏠 Property: {{1}}, {{2}}\n' +
                        '📅 Date: {{3}}\n' +
                        '⏰ Time: {{4}}\n' +
                        '👤 Contact: {{5}}\n' +
                        '📍 Location: {{6}}\n\n' +
                        'Samay par pahunchein — hum wait karenge!',
                    example: {
                        body_text: [[
                            '2BHK Flat',
                            'Sector 150 Noida',
                            '22 Feb 2026',
                            '11:00 AM',
                            'Raj Kumar (+919876543210)',
                            'https://maps.google.com/?q=28.5355,77.3910',
                        ]],
                    },
                },
                {
                    type: 'BUTTONS',
                    buttons: [
                        { type: 'QUICK_REPLY', text: 'Confirm' },
                        { type: 'QUICK_REPLY', text: 'Reschedule' },
                    ],
                },
            ],
        },
    },

    // ─── 6. rp_visit_agent_notify_v4 ─────────────────────────────────────────
    // Used: chat_handler.ts, webhooks.ts — notify assigned agent of new visit request
    // Fix: pipe-separated fields → line-break-separated fields
    {
        registryKey: 'rp_visit_agent_notify',
        oldMetaName: 'rp_visit_agent_notify_v3',
        newMetaName: 'rp_visit_agent_notify_v4',
        payload: {
            name: 'rp_visit_agent_notify_v4',
            language: 'en',
            category: 'UTILITY',
            components: [
                {
                    type: 'BODY',
                    text:
                        '🔔 Naya Site Visit Request!\n\n' +
                        '👤 Customer: {{1}}\n' +
                        '🏠 Property: {{2}}\n' +
                        '💰 Price: {{3}}\n' +
                        '📍 Location: {{4}}\n' +
                        '📢 Source: {{5}}\n\n' +
                        'CRM mein login karein — visit timing confirm karein aur key holder se coordinate karein.',
                    example: {
                        body_text: [[
                            'Amit Sharma',
                            '3BHK Flat in Sector 150',
                            '75 Lakh',
                            'ATS Greens, Sector 150, Noida',
                            'Website AI Chat',
                        ]],
                    },
                },
            ],
        },
    },

    // ─── 7. rp_tx_lead_assigned_v3 ───────────────────────────────────────────
    // Used: deal_notifications.ts — notify coordinator when a lead is assigned
    // Fix: pipe-separated fields → line-break-separated fields
    {
        registryKey: 'rp_tx_lead_assigned',
        oldMetaName: 'rp_tx_lead_assigned_v2',
        newMetaName: 'rp_tx_lead_assigned_v3',
        payload: {
            name: 'rp_tx_lead_assigned_v3',
            language: 'en',
            category: 'UTILITY',
            components: [
                {
                    type: 'BODY',
                    text:
                        '🔔 Nayi Lead Assign Hui!\n\n' +
                        '👤 Buyer: {{1}}\n' +
                        '🏠 Requirement: {{2}} in {{3}}\n' +
                        '💰 Budget: {{4}}\n' +
                        '🏷️ Type: {{5}}\n' +
                        '📢 Source: {{6}}\n\n' +
                        '24 ghante mein follow-up zaroor karein.',
                    example: {
                        body_text: [[
                            'Amit Sharma',
                            '2BHK Flat',
                            'Sector 150 Noida',
                            '50 Lakh',
                            'Sale',
                            'Website',
                        ]],
                    },
                },
            ],
        },
    },

    // ─── 8. rp_tx_followup_new_v3 ────────────────────────────────────────────
    // Used: scheduled_worker.ts — follow-up for leads that haven't responded
    // Fix: single paragraph → greeting + context + bulleted ask
    {
        registryKey: 'rp_tx_followup_new',
        oldMetaName: 'rp_tx_followup_new_v2',
        newMetaName: 'rp_tx_followup_new_v3',
        payload: {
            name: 'rp_tx_followup_new_v3',
            language: 'en',
            category: 'UTILITY',
            components: [
                {
                    type: 'BODY',
                    text:
                        '🏠 Namaste!\n\n' +
                        'Main Panditji hoon — Realty Pandit se. Aapne haal hi mein {{1}} ke baare mein enquiry ki thi.\n\n' +
                        'Aapke liye best options dhundh sakta hoon — bas yeh batayein:\n' +
                        '📍 Preferred location\n' +
                        '💰 Budget range\n' +
                        '🏷️ Property type',
                    example: { body_text: [['purchasing a property']] },
                },
            ],
        },
    },
];

// ─── Submit ───────────────────────────────────────────────────────────────────

async function submitTemplate(t: TemplateSubmission): Promise<{ ok: boolean; id?: string; error?: string }> {
    try {
        const res = await axios.post(BASE_URL, t.payload, {
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                'Content-Type': 'application/json',
            },
        });
        return { ok: true, id: res.data?.id };
    } catch (err: any) {
        const msg = err.response?.data?.error?.message || err.message;
        return { ok: false, error: msg };
    }
}

async function main() {
    console.log(`\nSubmitting ${TEMPLATES.length} improved templates to Meta WABA ${WABA_ID}\n`);
    console.log('─'.repeat(70));

    const results: Array<{ registryKey: string; newName: string; ok: boolean; id?: string; error?: string }> = [];

    for (const t of TEMPLATES) {
        process.stdout.write(`  ${t.newMetaName.padEnd(40)} → `);
        const result = await submitTemplate(t);
        results.push({ registryKey: t.registryKey, newName: t.newMetaName, ...result });
        if (result.ok) {
            console.log(`✅ submitted (id: ${result.id})`);
        } else {
            console.log(`❌ FAILED: ${result.error}`);
        }
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 300));
    }

    console.log('\n' + '─'.repeat(70));
    const succeeded = results.filter(r => r.ok);
    const failed = results.filter(r => !r.ok);

    console.log(`\nResult: ${succeeded.length}/${TEMPLATES.length} submitted successfully\n`);

    if (succeeded.length > 0) {
        console.log('Registry updates needed (paste into whatsapp_templates.ts):');
        for (const r of succeeded) {
            console.log(`  ${r.registryKey}: name: '${r.newName}'`);
        }
    }

    if (failed.length > 0) {
        console.log('\nFailed submissions:');
        for (const r of failed) {
            console.log(`  ${r.registryKey} → ${r.newName}: ${r.error}`);
        }
    }
}

main().catch(e => { console.error(e); process.exit(1); });
