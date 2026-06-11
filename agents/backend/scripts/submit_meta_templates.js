/**
 * Submit/Update WhatsApp Meta templates via Graph API.
 *
 * Usage:
 *   node scripts/submit_meta_templates.js                  # Create all templates
 *   node scripts/submit_meta_templates.js --delete-first   # Delete then re-create (for changed templates)
 *   node scripts/submit_meta_templates.js --only rp_daily_report,rp_visit_agent_notify  # Specific templates only
 *
 * Requires env vars: WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_TOKEN
 */

require('dotenv').config();
const axios = require('axios');

const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;
const API_VERSION = 'v21.0';
const API_URL = `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/message_templates`;

if (!WABA_ID || !TOKEN) {
    console.error('Missing WHATSAPP_BUSINESS_ACCOUNT_ID or WHATSAPP_TOKEN in .env');
    process.exit(1);
}

// CLI args
const args = process.argv.slice(2);
const DELETE_FIRST = args.includes('--delete-first');
const onlyIdx = args.indexOf('--only');
const ONLY_TEMPLATES = onlyIdx >= 0 && args[onlyIdx + 1] ? args[onlyIdx + 1].split(',') : null;

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════
// AUTHENTICATION TEMPLATES (3)
// ═══════════════════════════════════════════════════════════════

const AUTH_TEMPLATES = [
    {
        name: 'rp_user_otp',
        language: 'en',
        category: 'AUTHENTICATION',
        components: [
            {
                type: 'BODY',
                add_security_recommendation: true,
            },
            {
                type: 'FOOTER',
                code_expiration_minutes: 10,
            },
            {
                type: 'BUTTONS',
                buttons: [{ type: 'OTP', otp_type: 'COPY_CODE' }],
            },
        ],
    },
    {
        name: 'rp_password_reset_v2',
        language: 'en',
        category: 'AUTHENTICATION',
        components: [
            {
                type: 'BODY',
                add_security_recommendation: true,
            },
            {
                type: 'FOOTER',
                code_expiration_minutes: 10,
            },
            {
                type: 'BUTTONS',
                buttons: [{ type: 'OTP', otp_type: 'COPY_CODE' }],
            },
        ],
    },
    {
        name: 'rp_agent_otp',
        language: 'en',
        category: 'AUTHENTICATION',
        components: [
            {
                type: 'BODY',
                add_security_recommendation: true,
            },
            {
                type: 'FOOTER',
                code_expiration_minutes: 5,
            },
            {
                type: 'BUTTONS',
                buttons: [{ type: 'OTP', otp_type: 'COPY_CODE' }],
            },
        ],
    },
];

// ═══════════════════════════════════════════════════════════════
// UTILITY TEMPLATES (27)
// Moved TO utility: rp_daily_report, rp_subscription_expiry, rp_executive_reassigned
// Moved FROM utility: rp_whatsapp_invite, rp_tx_followup_won, rp_tx_followup_lost
// ═══════════════════════════════════════════════════════════════

const UTILITY_TEMPLATES = [
    // ─── Onboarding & Welcome (4) ─────────────────────────
    {
        name: 'rp_whatsapp_link',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: "You're about to connect your WhatsApp with Realty Pandit's AI property assistant. Reply *Yes* to sync your conversations across all channels and get property recommendations directly here.",
            },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'QUICK_REPLY', text: 'Yes' },
                    { type: 'QUICK_REPLY', text: 'No thanks' },
                ],
            },
        ],
    },
    {
        name: 'rp_agent_welcome_free',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Welcome to Realty Pandit Partner Network, {{1}}! Your FREE account is active. You can list up to 10 properties and receive enquiry notifications. Upload properties by chatting here or via your dashboard. Type "add property" to get started!',
                example: { body_text: [['Rahul']] },
            },
        ],
    },
    {
        name: 'rp_agent_welcome_paid',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Welcome to Realty Pandit Partner Network, {{1}}! Thank you for choosing {{2}} package. Your account will be activated once payment is confirmed. Dashboard: https://realtypandit.in/agent/login',
                example: { body_text: [['Rahul', 'PRO']] },
            },
        ],
    },
    {
        name: 'rp_team_welcome_v2',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Welcome to Realty Pandit! Your account has been created. Please check your email for login credentials and password setup link. The setup link is valid for 48 hours. After setup, login at admin.realtypandit.in to access your dashboard.',
            },
        ],
    },

    // ─── Appointment Management (2) ───────────────────────
    {
        name: 'rp_appointment_confirm',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Appointment Confirmed! Your property visit for {{1}} in {{2}} is scheduled on {{3}} at {{4}}. Your point of contact is {{5}}. Please arrive on time. Reply Confirm to acknowledge or Reschedule to change the timing.',
                example: { body_text: [['2BHK Flat', 'Sector 150 Noida', '22 Feb 2026', '11:00 AM', 'Raj Kumar']] },
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
    {
        name: 'rp_appointment_reminder',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: "Reminder: Your property visit {{1}} is tomorrow. Date: {{2}}, Time: {{3}}. Reply Confirm if you're coming or Reschedule to change the time.",
                example: { body_text: [['2BHK Flat Visit', '22 Feb 2026', '11:00 AM']] },
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

    // ─── Site Visit Notifications (3) — PII removed ──────
    {
        name: 'rp_visit_agent_notify_v2',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'NEW SITE VISIT REQUEST. Customer: {{1}}. Property: {{2}}, Price: {{3}}, Location: {{4}}. Source: {{5}}. Action: Contact customer via CRM to confirm timing, coordinate with key holder.',
                example: { body_text: [['Amit Sharma', '3BHK Flat in Sector 150', '75 Lakh', 'ATS Greens, Sector 150, Noida', 'Website AI Chat']] },
            },
        ],
    },
    {
        name: 'rp_visit_keyholder_v2',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Site visit scheduled for your property: {{1}} at {{2}}. Visitor: {{3}}. Please keep property accessible. Our agent will contact you to confirm timing.',
                example: { body_text: [['3BHK Flat', 'ATS Greens, Sector 150', 'Amit Sharma']] },
            },
        ],
    },
    {
        name: 'rp_visit_mgmt_alert_v2',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'HIGH-VALUE VISIT REQUEST. Property: {{1}} ({{2}}). Customer: {{3}}. This lead has been assigned to {{4}} for immediate follow-up. Please ensure timely coordination.',
                example: { body_text: [['4BHK Villa', '2.5 Cr', 'Suresh Gupta', 'Raj Kumar']] },
            },
        ],
    },

    // ─── Missed Call & No-Show (2) ────────────────────────
    {
        name: 'rp_missed_call',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Hi! We noticed we missed your call. How can we help you regarding property details? Reply to connect with Panditji, your AI property assistant.',
            },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'QUICK_REPLY', text: 'Reply' },
                ],
            },
        ],
    },
    {
        name: 'rp_noshow_recovery',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'It looks like the property visit was missed. Would you like us to schedule another time? Reply to reschedule.',
            },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'QUICK_REPLY', text: 'Reschedule' },
                ],
            },
        ],
    },

    // ─── Transaction Lifecycle Follow-ups (5 — 3 moved to MARKETING) ──
    {
        name: 'rp_tx_followup_new',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: "Namaste! This is Panditji from Realty Pandit. You recently inquired about {{1}}. Could you share your budget, preferred location, and property type? I'll find the best options for you!",
                example: { body_text: [['purchasing a property']] },
            },
        ],
    },
    {
        name: 'rp_tx_followup_matched',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Hello! We found a {{1}} matching your search in {{2}}. Would you like to schedule a site visit? Reply to get details.',
                example: { body_text: [['2BHK Flat', 'Sector 150 Noida']] },
            },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'QUICK_REPLY', text: 'Schedule Visit' },
                ],
            },
        ],
    },
    {
        name: 'rp_tx_visit_reminder_1d',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: "Reminder: Your property visit is scheduled for tomorrow. Please confirm if you're attending or let us know to reschedule.",
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
    {
        name: 'rp_tx_visit_reminder_2h',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Your property visit is in 2 hours. Ready? If you have any questions, just ask!',
            },
        ],
    },
    {
        name: 'rp_tx_followup_visited',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Namaste! You recently visited a property in {{1}}. How was it? Would you like to proceed or see more options? Your feedback helps us find better matches.',
                example: { body_text: [['Sector 150 Noida']] },
            },
        ],
    },
    {
        name: 'rp_tx_followup_negotiation',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Hello! Any update on the {{1}} deal? If you need help with price negotiation, our Realty Pandit team is ready to assist and get you the best deal.',
                example: { body_text: [['2BHK Flat']] },
            },
        ],
    },

    // ─── Transaction Status Notifications (7) ─────────────
    {
        name: 'rp_tx_created',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: "Namaste {{1}}! Your property search is registered with Realty Pandit. {{2}} from our team is assigned to help you. We'll find the best {{3}}options for you!",
                example: { body_text: [['Amit', 'Raj Kumar', 'rental ']] },
            },
        ],
    },
    {
        name: 'rp_tx_lead_assigned',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'New Lead Assigned. Buyer: {{1}}. Looking for: {{2}} in {{3}}. Budget: {{4}}. Type: {{5}}. Source: {{6}}. Please follow up within 24 hours.',
                example: { body_text: [['Amit Sharma', '2BHK Flat', 'Sector 150 Noida', '50 Lakh', 'Sale', 'Website']] },
            },
        ],
    },
    {
        name: 'rp_tx_match_buyer',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Great news! We found a property matching your requirements: {{1}} in {{2}}, Price: {{3}}. Would you like to schedule a visit? Reply "schedule visit".',
                example: { body_text: [['2BHK Flat', 'Sector 150 Noida', '45 Lakh']] },
            },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'QUICK_REPLY', text: 'Schedule Visit' },
                ],
            },
        ],
    },
    {
        name: 'rp_tx_match_seller',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: "Good news! A potential {{1}} is interested in your property at {{2}}. Our team will coordinate. We'll notify you when a visit is scheduled.",
                example: { body_text: [['buyer', 'Sector 150 Noida']] },
            },
        ],
    },
    {
        name: 'rp_tx_visit_buyer',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Property Visit Scheduled. Property: {{1}} in {{2}}. Date: {{3}}, Time: {{4}}. {{5}}. Reply CONFIRM to confirm attendance.',
                example: { body_text: [['2BHK Flat', 'Sector 150 Noida', '22 Feb 2026', '11:00 AM', 'Your Realty Pandit executive: Raj Kumar']] },
            },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'QUICK_REPLY', text: 'Confirm' },
                ],
            },
        ],
    },
    {
        name: 'rp_tx_visit_seller',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Property Visit Scheduled. Your property at {{1}}. Date: {{2}}, Time: {{3}}. A potential {{4}} will visit. Please ensure the property is ready.',
                example: { body_text: [['Sector 150 Noida', '22 Feb 2026', '11:00 AM', 'buyer']] },
            },
        ],
    },
    {
        name: 'rp_tx_deal_closed_v2',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Congratulations! The deal for {{1}} in {{2}} is closed successfully{{3}}! Thank you for choosing Realty Pandit. We wish you all the best with your new property.',
                example: { body_text: [['2BHK Flat', 'Sector 150 Noida', ' at 45 Lakh']] },
            },
        ],
    },

    // ─── Inventory (1) ────────────────────────────────────
    {
        name: 'rp_inventory_confirmed',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Hi {{1}}, your property has been submitted to Realty Pandit! Property: {{2}} | Location: {{3}} | Price: {{4}}. Property ID: {{5}}. Our team will verify and list it within 24 hours.',
                example: { body_text: [['Sunny', '2BHK Flat', 'Sector 150, Noida', '55 Lakh', 'INV-12345']] },
            },
        ],
    },

    // ─── Moved from MARKETING → UTILITY (3) — using _v2 names (Meta doesn't allow category change on same name) ──
    {
        name: 'rp_daily_report_v2',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Daily Report ({{1}}). New Leads: {{2}}. Interactions: {{3}}. System is active and monitoring.',
                example: { body_text: [['19 Feb 2026', '12', '45']] },
            },
        ],
    },
    {
        name: 'rp_subscription_expiry_v2',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Your Realty Pandit Partner Subscription has expired. Please renew via the dashboard to keep receiving leads and listing properties.',
            },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'QUICK_REPLY', text: 'Renew Now' },
                ],
            },
        ],
    },
    {
        name: 'rp_executive_reassigned_v2',
        language: 'en',
        category: 'UTILITY',
        components: [
            {
                type: 'BODY',
                text: 'Hi {{1}}! Your Realty Pandit contact has been updated. {{2}} will now assist you with your property {{3}}. Feel free to reach out anytime!',
                example: { body_text: [['Amit', 'Raj Kumar', 'purchase']] },
            },
        ],
    },
];

// ═══════════════════════════════════════════════════════════════
// MARKETING TEMPLATES (8)
// All MARKETING templates include opt-out footer per Meta policy
// Moved TO marketing: rp_whatsapp_invite, rp_tx_followup_won, rp_tx_followup_lost
// ═══════════════════════════════════════════════════════════════

const MARKETING_TEMPLATES = [
    {
        name: 'rp_welcome_buyer_v2',
        language: 'en',
        category: 'MARKETING',
        components: [
            {
                type: 'BODY',
                text: "Namaste {{1}}! Welcome to Realty Pandit. I'm Panditji, your AI property assistant. Tell me what you're looking for - type, budget, location - and I'll find the best options for you.",
                example: { body_text: [['Amit']] },
            },
            {
                type: 'FOOTER',
                text: 'Reply STOP to opt out',
            },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'QUICK_REPLY', text: 'Reply' },
                ],
            },
        ],
    },
    {
        name: 'rp_welcome_seller_v2',
        language: 'en',
        category: 'MARKETING',
        components: [
            {
                type: 'BODY',
                text: "Namaste {{1}}! Welcome to Realty Pandit. I'm Panditji. Ready to list your property? Just tell me the type (flat/house/plot), location, and asking price.",
                example: { body_text: [['Amit']] },
            },
            {
                type: 'FOOTER',
                text: 'Reply STOP to opt out',
            },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'QUICK_REPLY', text: 'Reply' },
                ],
            },
        ],
    },
    {
        name: 'rp_new_listing_v2',
        language: 'en',
        category: 'MARKETING',
        components: [
            {
                type: 'BODY',
                text: 'New listing alert! A {{1}} is now available in {{2}} for {{3}}. Reply "details" to know more.',
                example: { body_text: [['3BHK Flat', 'Sector 150 Noida', '75 Lakh']] },
            },
            {
                type: 'FOOTER',
                text: 'Reply STOP to opt out',
            },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'QUICK_REPLY', text: 'View Details' },
                ],
            },
        ],
    },
    {
        name: 'rp_generic_followup_v2',
        language: 'en',
        category: 'MARKETING',
        components: [
            {
                type: 'BODY',
                text: "Hi {{1}}! Just checking in - are you still looking for a {{2}} in {{3}}? Reply and I'll show you the latest options.",
                example: { body_text: [['Amit', '2BHK Flat', 'Sector 150 Noida']] },
            },
            {
                type: 'FOOTER',
                text: 'Reply STOP to opt out',
            },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'QUICK_REPLY', text: 'Yes, Show Options' },
                ],
            },
        ],
    },
    {
        name: 'rp_reopen_session_v2',
        language: 'en',
        category: 'MARKETING',
        components: [
            {
                type: 'BODY',
                text: 'Hi {{1}}! This is Panditji from Realty Pandit. We have an update for you regarding your property {{2}}. Reply to this message to continue our conversation.',
                example: { body_text: [['Amit', 'search']] },
            },
            {
                type: 'FOOTER',
                text: 'Reply STOP to opt out',
            },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'QUICK_REPLY', text: 'Reply' },
                ],
            },
        ],
    },

    // ─── Moved from UTILITY → MARKETING (3) ──────────────
    {
        name: 'rp_whatsapp_invite_v2',
        language: 'en',
        category: 'MARKETING',
        components: [
            {
                type: 'BODY',
                text: 'Hi! This is Panditji, your AI Property Assistant from Realty Pandit. I see you were browsing properties on our website. Would you like to continue our conversation here on WhatsApp? Just reply to get started!',
            },
            {
                type: 'FOOTER',
                text: 'Reply STOP to opt out',
            },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'QUICK_REPLY', text: "Yes, let's chat!" },
                ],
            },
        ],
    },
    {
        name: 'rp_tx_followup_won_v2',
        language: 'en',
        category: 'MARKETING',
        components: [
            {
                type: 'BODY',
                text: 'Congratulations on your new property! If you need help with paperwork or registration, Panditji is here. And if friends or family need property help, recommend Realty Pandit!',
            },
            {
                type: 'FOOTER',
                text: 'Reply STOP to opt out',
            },
        ],
    },
    {
        name: 'rp_tx_followup_lost_v2',
        language: 'en',
        category: 'MARKETING',
        components: [
            {
                type: 'BODY',
                text: 'Namaste! You had inquired about {{1}} in {{2}} a while ago. We have new properties available in your preferred area. Would you like to take a look?',
                example: { body_text: [['2BHK Flat', 'Sector 150 Noida']] },
            },
            {
                type: 'FOOTER',
                text: 'Reply STOP to opt out',
            },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'QUICK_REPLY', text: 'Yes, show me' },
                ],
            },
        ],
    },
];

// ═══════════════════════════════════════════════════════════════
// SUBMISSION LOGIC
// ═══════════════════════════════════════════════════════════════

const ALL_TEMPLATES = [...AUTH_TEMPLATES, ...UTILITY_TEMPLATES, ...MARKETING_TEMPLATES];

async function deleteTemplate(name) {
    try {
        const response = await axios.delete(
            `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/message_templates`,
            {
                params: { name },
                headers: { 'Authorization': `Bearer ${TOKEN}` },
            }
        );
        return { name, status: 'DELETED', success: response.data.success };
    } catch (error) {
        const errData = error.response?.data?.error || error.message;
        return { name, status: 'DELETE_FAILED', error: errData };
    }
}

async function submitTemplate(template) {
    try {
        const response = await axios.post(API_URL, template, {
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json',
            },
        });
        return { name: template.name, status: 'SUCCESS', id: response.data.id, meta_status: response.data.status };
    } catch (error) {
        const errData = error.response?.data?.error || error.message;
        return { name: template.name, status: 'FAILED', error: errData };
    }
}

async function main() {
    let templates = ALL_TEMPLATES;

    // Filter to specific templates if --only flag is used
    if (ONLY_TEMPLATES) {
        templates = ALL_TEMPLATES.filter(t => ONLY_TEMPLATES.includes(t.name));
        if (templates.length === 0) {
            console.error(`No templates matched: ${ONLY_TEMPLATES.join(', ')}`);
            process.exit(1);
        }
    }

    console.log('='.repeat(60));
    console.log('  WhatsApp Meta Template Submission');
    console.log(`  WABA ID: ${WABA_ID}`);
    console.log(`  API Version: ${API_VERSION}`);
    console.log(`  Total templates: ${templates.length}`);
    console.log(`  Mode: ${DELETE_FIRST ? 'DELETE + RE-CREATE' : 'CREATE'}`);
    if (ONLY_TEMPLATES) console.log(`  Filter: ${ONLY_TEMPLATES.join(', ')}`);
    console.log('='.repeat(60));
    console.log('');

    const results = { success: [], failed: [], deleted: [] };

    for (let i = 0; i < templates.length; i++) {
        const template = templates[i];
        const progress = `[${i + 1}/${templates.length}]`;

        // Delete first if requested
        if (DELETE_FIRST) {
            process.stdout.write(`${progress} Deleting ${template.name}... `);
            const delResult = await deleteTemplate(template.name);
            if (delResult.status === 'DELETED') {
                console.log('DELETED');
                results.deleted.push(delResult);
            } else {
                console.log(`DELETE SKIPPED (${JSON.stringify(delResult.error).substring(0, 80)})`);
            }
            await delay(2000); // Wait after delete before re-create
        }

        // Submit template
        process.stdout.write(`${progress} Submitting ${template.name} (${template.category})... `);
        const result = await submitTemplate(template);

        if (result.status === 'SUCCESS') {
            console.log(`OK (id: ${result.id}, status: ${result.meta_status})`);
            results.success.push(result);
        } else {
            console.log(`FAILED`);
            console.log(`   Error: ${JSON.stringify(result.error).substring(0, 200)}`);
            results.failed.push(result);
        }

        // Rate limit: wait 1.5s between calls
        if (i < templates.length - 1) {
            await delay(1500);
        }
    }

    // Summary
    console.log('');
    console.log('='.repeat(60));
    console.log('  SUBMISSION SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Total:    ${templates.length}`);
    if (DELETE_FIRST) console.log(`  Deleted:  ${results.deleted.length}`);
    console.log(`  Success:  ${results.success.length}`);
    console.log(`  Failed:   ${results.failed.length}`);
    console.log('');

    if (results.failed.length > 0) {
        console.log('  FAILED TEMPLATES:');
        results.failed.forEach(f => {
            console.log(`    - ${f.name}: ${JSON.stringify(f.error).substring(0, 150)}`);
        });
    }

    if (results.success.length > 0) {
        console.log('');
        console.log('  APPROVED/PENDING TEMPLATES:');
        results.success.forEach(s => {
            console.log(`    - ${s.name} (${s.meta_status})`);
        });
    }

    console.log('');
    console.log('  Note: Authentication templates are usually auto-approved.');
    console.log('  Utility/Marketing templates take 24-48h for Meta review.');
    console.log('='.repeat(60));
}

main().catch(console.error);
