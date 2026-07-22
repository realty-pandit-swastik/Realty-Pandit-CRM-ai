/**
 * WhatsApp Meta Template Registry
 *
 * Central registry of all 50 Meta-approved WhatsApp Business API templates.
 * These templates are required for business-initiated messages sent outside
 * the 24-hour session window.
 *
 * Categories:
 * - AUTHENTICATION (3): OTP / login codes
 * - UTILITY (54): Transactional updates (appointments, visits, deals, reports, partner flow, pipeline stages)
 * - MARKETING (7): Promotional, re-engagement, campaigns, cold lead nudges
 *
 * Partner agent model (2026-04-19):
 *   Platform is FREE for all partner agents — no subscription, no paid tiers.
 *   Partner flow: Welcome → Upload inventory OR Share a client → Match → Earn together.
 *   No subscription or payment templates are sent to partners.
 *
 * Reclassified MARKETING → UTILITY (2026-04-19):
 *   rp_buyer_lead_received, rp_welcome_buyer, rp_welcome_seller, rp_reopen_session
 *
 * Pipeline stage templates (2026-04-24):
 *   Added 18 new templates for the unified deal pipeline (DEC-003):
 *   Stage 1 NEW, Stage 2 QUALIFIED, Stage 3 MATCHING_APPOINTMENT,
 *   Stage 4 VISIT_SCHEDULED, Stage 6 NEGOTIATION, ON_HOLD.
 *   rp_property_card uses headerType IMAGE — requires image header at send time.
 *
 * Language: Hinglish (Hindi + English hybrid).
 * All templates have at least one emoji. No question marks (?).
 *
 * Usage:
 *   import { buildTemplatePayload, TEMPLATE_REGISTRY } from '../config/whatsapp_templates';
 *   const payload = buildTemplatePayload('rp_user_otp', { otp: '123456' });
 *   await whatsappService.sendTemplate(phone, payload.name, payload.language, payload.components);
 */

// ─── Types ──────────────────────────────────────────────────────

export type TemplateCategory = 'AUTHENTICATION' | 'UTILITY' | 'MARKETING';

export interface TemplateParam {
    /** Parameter key used in buildTemplatePayload (e.g., "otp", "name") */
    key: string;
    /** Example value for Meta submission */
    example: string;
}

export interface TemplateDefinition {
    /** Meta template name (lowercase, underscores only) */
    name: string;
    /** Meta category */
    category: TemplateCategory;
    /** Language code */
    language: string;
    /** Template body text with {{1}}, {{2}} placeholders */
    body: string;
    /** Parameter definitions (ordered — {{1}} is params[0], {{2}} is params[1], etc.) */
    params: TemplateParam[];
    /** Quick reply button labels (if any) */
    buttons?: string[];
    /** Header text for TEXT headers (if any) */
    header?: string;
    /** Header type — TEXT uses header string; IMAGE requires imageUrl at send time */
    headerType?: 'TEXT' | 'IMAGE';
    /** Footer text (if any) */
    footer?: string;
}

export interface TemplatePayload {
    name: string;
    language: string;
    components: any[];
}

/**
 * Dealer/partner brochure template — DOCUMENT header (a single-property PDF as a
 * chat attachment). Sent via WhatsAppService.sendDocumentTemplate (NOT
 * buildTemplatePayload), so it lives here as a name constant rather than a
 * TEMPLATE_REGISTRY entry (the registry's TemplateDefinition only models
 * TEXT/IMAGE headers). Body params: {{1}} = property summary, {{2}} = "1 of N".
 * Submitted via scripts/submit_brochure_template.js (UTILITY).
 */
export const BROCHURE_TEMPLATE_NAME = 'rp_property_brochure_v2';

// ─── Template Registry ──────────────────────────────────────────

export const TEMPLATE_REGISTRY: Record<string, TemplateDefinition> = {

    // ═══════════════════════════════════════════════════════════════
    // AUTHENTICATION TEMPLATES (3)
    // ═══════════════════════════════════════════════════════════════

    rp_user_otp: {
        name: 'rp_user_otp',
        category: 'AUTHENTICATION',
        language: 'en',
        body: '🔐 Aapka Realty Pandit verification code hai: *{{1}}*. Yeh 10 minute mein expire hoga. Yeh code kisi se share na karein.',
        params: [{ key: 'otp', example: '123456' }],
        buttons: ['Copy Code'],
    },

    rp_password_reset: {
        name: 'rp_password_reset_v2',
        category: 'AUTHENTICATION',
        language: 'en',
        body: '🔑 Aapka Realty Pandit password reset code hai: *{{1}}*. Yeh 10 minute mein expire hoga. Yeh code kisi se share na karein.',
        params: [
            { key: 'otp', example: '654321' },
        ],
        buttons: ['Copy Code'],
    },

    rp_agent_otp: {
        name: 'rp_agent_otp',
        category: 'AUTHENTICATION',
        language: 'en',
        body: '🔐 Aapka Realty Pandit Agent login code hai: *{{1}}*. Yeh 5 minute mein expire hoga. Kisi se share na karein.',
        params: [{ key: 'otp', example: '789012' }],
        buttons: ['Copy Code'],
    },

    rp_partner_login_otp: {
        name: 'rp_partner_login_otp_v2',
        category: 'AUTHENTICATION',
        language: 'en',
        body: '*{{1}}* is your verification code. For your security, do not share this code.',
        params: [{ key: 'otp', example: '123456' }],
        buttons: ['Copy Code'],
    },

    // ═══════════════════════════════════════════════════════════════
    // UTILITY TEMPLATES (40)
    // ═══════════════════════════════════════════════════════════════

    // ─── Onboarding & Welcome — Partner Agents (7) ──────────────
    // Partner agents get the platform FREE — no paid plans, no subscriptions.
    // Goal: join, share inventory OR share clients, match, earn together.

    rp_whatsapp_link: {
        name: 'rp_whatsapp_link_v2',
        category: 'UTILITY',
        language: 'en',
        body: '🏠 Namaste! Realty Pandit ka AI Property Assistant — Panditji — ab aapke WhatsApp par available hai. *Yes* reply karein aur seedha yahaan property search shuru karein.',
        params: [],
        buttons: ['Yes', 'No thanks'],
    },

    rp_partner_registered: {
        name: 'rp_partner_registered_v2',
        category: 'UTILITY',
        language: 'en',
        body: '🎊 Namaste {{1}}! Realty Pandit Partner Network mein aapka swagat hai — bilkul free.\n\n👤 Aapke coordinator: {{2}}\n\nYahan aap do tarah se earn kar sakte hain:\n🏠 Apni properties upload karein — hum buyer dhundh kar deal close karenge\n👥 Apna buyer share karein — hum unke liye property dhundh karenge\n\n🔗 Portal: https://realtypandit.in/agent/login\nIs WhatsApp number se OTP receive karein.',
        params: [
            { key: 'name', example: 'Rahul Sharma' },
            { key: 'coordinator', example: 'Sunny Kumar' },
        ],
    },

    rp_partner_welcome_confirmed: {
        name: 'rp_partner_welcome_v2',
        category: 'UTILITY',
        language: 'en',
        header: 'Welcome to Realty Pandit!',
        body: '✅ Namaste {{1}}! Realty Pandit Partner Network mein aapka swagat hai.\n\n👤 Aapke Coordinator: {{2}}\n\nAagle Steps:\n1️⃣ Partner Portal par login karein\n2️⃣ Apni properties upload karein — ya koi buyer requirement share karein\n3️⃣ Hum match karenge aur saath milkar earn karenge\n\n🔗 Portal: https://realtypandit.in/agent/login\nLogin ke liye is WhatsApp number par OTP aayega.',
        params: [
            { key: 'name', example: 'Meenakshi Sharma' },
            { key: 'coordinator', example: 'Sunny Kumar' },
        ],
        buttons: ['Open Portal'],
    },

    rp_partner_upload_nudge: {
        name: 'rp_partner_upload_nudge',
        category: 'UTILITY',
        language: 'en',
        body: '🏠 Namaste {{1}}! Aapki profile bilkul ready hai — bas pehli property add karna baaki hai.\n\nYahan type kar saktein hain:\n📍 Location\n🏷️ Type (flat/plot/villa)\n💰 Price\n\nYa portal use karein: https://realtypandit.in/agent/login\n\nProperty list hote hi hum buyer matching shuru kar denge!',
        params: [{ key: 'name', example: 'Rahul' }],
        buttons: ['Open Portal'],
    },

    rp_partner_upload_reminder: {
        name: 'rp_partner_upload_reminder',
        category: 'UTILITY',
        language: 'en',
        body: '⏰ Namaste {{1}}! Aapki profile ready hai par abhi tak koi property upload nahi hui.\n\nAaj pehli property add karo — sirf location, type aur price chahiye. Hum baaki ka kaam karenge.\n\nKoi help chahiye toh {{2}} se baat karo — woh assist karenge.',
        params: [
            { key: 'name', example: 'Rahul' },
            { key: 'coordinator', example: 'Sunny Kumar' },
        ],
        buttons: ['Upload Now', 'Talk to Coordinator'],
    },

    rp_partner_share_lead: {
        name: 'rp_partner_share_lead',
        category: 'UTILITY',
        language: 'en',
        body: '👥 Namaste {{1}}! Agar aapke paas koi buyer hai jise property ki zaroorat hai — unki requirement hum par chhod dein.\n\nBas yeh share karein:\n📍 Preferred location\n🏷️ Property type\n💰 Budget\n\nHum apni inventory se best match dhundh kar deal close karenge — milkar earn karenge!',
        params: [{ key: 'name', example: 'Rahul' }],
    },

    rp_team_welcome: {
        name: 'rp_team_welcome_v4',
        category: 'UTILITY',
        language: 'en',
        body: '🎊 Welcome to Realty Pandit, {{1}}! Aap humare team ka hissa ban gaye hain. Aapka account taiyaar hai — login karein: https://admin.realtypandit.in\n\nKoi sawal ho toh apne manager {{2}} se sampark karein. Saath milkar kaam karte hain!',
        params: [
            { key: 'name', example: 'Ravi Sharma' },
            { key: 'manager', example: 'Sunny Kumar' },
        ],
    },

    // ─── Appointment Management (2) ─────────────────────────────

    rp_appointment_confirm: {
        name: 'rp_appointment_confirm_v2',
        category: 'UTILITY',
        language: 'en',
        body: '✅ Appointment Confirm!\n\n🏠 Property: {{1}}, {{2}}\n📅 Date: {{3}}\n⏰ Time: {{4}}\n👤 Contact: {{5}}\n📍 Location: {{6}}\n\nSamay par pahunchein — hum wait karenge!',
        params: [
            { key: 'type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'date', example: '22 Feb 2026' },
            { key: 'time', example: '11:00 AM' },
            { key: 'contact_info', example: 'Raj Kumar (+919876543210)' },
            { key: 'maps_link', example: 'https://maps.google.com/?q=28.5355,77.3910' },
        ],
        buttons: ['Confirm', 'Reschedule'],
    },

    rp_appointment_reminder: {
        name: 'rp_appointment_reminder',
        category: 'UTILITY',
        language: 'en',
        body: '⏰ Reminder: Aapki property visit — {{1}} — kal hai. 📅 Date: {{2}} | Time: {{3}}. *Confirm* reply karein agar aa rahe hain, ya *Reschedule* type karein.',
        params: [
            { key: 'title', example: '2BHK Flat Visit' },
            { key: 'date', example: '22 Feb 2026' },
            { key: 'time', example: '11:00 AM' },
        ],
        buttons: ['Confirm', 'Reschedule'],
    },

    // ─── Site Visit Notifications (3) ───────────────────────────

    rp_visit_agent_notify: {
        name: 'rp_visit_agent_notify_v4',
        category: 'UTILITY',
        language: 'en',
        body: '🔔 Naya Site Visit Request!\n\n👤 Customer: {{1}}\n🏠 Property: {{2}}\n💰 Price: {{3}}\n📍 Location: {{4}}\n📢 Source: {{5}}\n\nCRM mein login karein — visit timing confirm karein aur key holder se coordinate karein.',
        params: [
            { key: 'customer_name', example: 'Amit Sharma' },
            { key: 'property', example: '3BHK Flat in Sector 150' },
            { key: 'price', example: '75 Lakh' },
            { key: 'address', example: 'ATS Greens, Sector 150, Noida' },
            { key: 'source', example: 'Website AI Chat' },
        ],
    },

    rp_visit_keyholder: {
        name: 'rp_visit_keyholder_v2',
        category: 'UTILITY',
        language: 'en',
        body: '🔑 Aapki property ke liye site visit schedule hui hai: {{1}}, {{2}} par. 👤 Visitor: {{3}}. 📅 Date: {{4}} | ⏰ Time: {{5}}. Property accessible rakhein — please neeche reply karein.',
        params: [
            { key: 'property', example: '3BHK Flat' },
            { key: 'address', example: 'ATS Greens, Sector 150' },
            { key: 'visitor_name', example: 'Amit Sharma' },
            { key: 'date', example: '26 Apr 2026' },
            { key: 'time', example: '11:00 AM' },
        ],
        buttons: ['Main hounga', 'Keys office bhej raha hoon', 'Reschedule chahiye'],
    },

    rp_visit_mgmt_alert: {
        name: 'rp_visit_mgmt_alert_v2',
        category: 'UTILITY',
        language: 'en',
        body: '⭐ High-Value Visit Request! 🏠 Property: {{1}} (💰 {{2}}). 👤 Customer: {{3}}. Yeh lead {{4}} ko assign ki gayi hai — immediate follow-up ke liye. Timely coordination ensure karein.',
        params: [
            { key: 'property', example: '4BHK Villa' },
            { key: 'price', example: '2.5 Cr' },
            { key: 'customer_name', example: 'Suresh Gupta' },
            { key: 'agent', example: 'Raj Kumar' },
        ],
    },

    // ─── Missed Call & No-Show (2) ──────────────────────────────

    rp_missed_call: {
        name: 'rp_missed_call_v2',
        category: 'UTILITY',
        language: 'en',
        body: '📞 Namaste! Aapka call receive nahi ho saka — hum maazrat chahte hain. 🏠 Property ke baare mein koi bhi sawaal ho toh yahaan reply karein — Panditji abhi available hain aur madad ke liye taiyaar hain.',
        params: [],
        buttons: ['Reply'],
    },

    rp_noshow_recovery: {
        name: 'rp_noshow_recovery',
        category: 'UTILITY',
        language: 'en',
        body: '🏠 Lagta hai property visit miss ho gayi. Dobaara schedule karna chahte hain toh *Reschedule* reply karein — nayi timing arrange kar denge.',
        params: [],
        buttons: ['Reschedule'],
    },

    // ─── Transaction Lifecycle Follow-ups (6) ───────────────────

    rp_tx_followup_new: {
        name: 'rp_tx_followup_new_v3',
        category: 'UTILITY',
        language: 'en',
        body: '🏠 Namaste!\n\nMain Panditji hoon — Realty Pandit se. Aapne haal hi mein {{1}} ke baare mein enquiry ki thi.\n\nAapke liye best options dhundh sakta hoon — bas yeh batayein:\n📍 Preferred location\n💰 Budget range\n🏷️ Property type',
        params: [{ key: 'inquiry_type', example: 'purchasing a property' }],
    },

    rp_tx_followup_matched: {
        name: 'rp_tx_followup_matched_v2',
        category: 'UTILITY',
        language: 'en',
        body: '🎯 Aapki search ke liye ek property mili — {{1}}, {{2}} mein. Site visit schedule karni hai. *Schedule Visit* reply karein ya neeche button dabayein.',
        params: [
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
        ],
        buttons: ['Schedule Visit'],
    },

    rp_tx_visit_reminder_1d: {
        name: 'rp_tx_visit_reminder_1d',
        category: 'UTILITY',
        language: 'en',
        body: '⏰ Reminder: Aapki property visit kal ke liye schedule hai. *Confirm* reply karein agar aa rahe hain — ya *Reschedule* type karein nayi timing ke liye.',
        params: [],
        buttons: ['Confirm', 'Reschedule'],
    },

    rp_tx_visit_reminder_2h: {
        name: 'rp_tx_visit_reminder_2h',
        category: 'UTILITY',
        language: 'en',
        body: '🏠 Yaad dilaana chahte hain — sirf 2 ghante mein aapki property visit hai! Taiyaar ho jaayein. 📍 Location: {{1}}. Koi bhi sawaal ho toh reply karein — hum yahan hain.',
        params: [{ key: 'maps_link', example: 'https://maps.google.com/?q=28.5355,77.3910' }],
        buttons: ['Confirmed'],
    },

    rp_tx_followup_visited: {
        name: 'rp_tx_followup_visited_v2',
        category: 'UTILITY',
        language: 'en',
        body: '🏠 Namaste! Aapne haal hi mein {{1}} mein property visit ki — umeed hai experience accha raha. Aage badhna chahte hain, ya aur options dekhne hain? Hum aapki sunenge — bas reply karein.',
        params: [{ key: 'location', example: 'Sector 150 Noida' }],
    },

    rp_tx_followup_negotiation: {
        name: 'rp_tx_followup_negotiation_v3',
        category: 'UTILITY',
        language: 'en',
        body: '🤝 Badhaai! Aapki property negotiation stage mein aa gayi hai. Hamaari team aapke saath milkar aage ke steps complete karegi — jald hi update milega.',
        params: [],
    },

    // ─── Transaction Status Notifications (7) ───────────────────

    rp_tx_created: {
        name: 'rp_tx_created_v2',
        category: 'UTILITY',
        language: 'en',
        body: '📋 Namaste {{1}}! Aapki property search Realty Pandit ke saath registered ho gayi hai. 👤 {{2}} aapki team se assigned hain — madad ke liye available hain. Aapke liye best {{3}} options dhundhe jaayenge!',
        params: [
            { key: 'name', example: 'Amit' },
            { key: 'executive', example: 'Raj Kumar' },
            { key: 'rental_prefix', example: 'rental ' },
        ],
    },

    rp_tx_lead_assigned: {
        name: 'rp_tx_lead_assigned_v3',
        category: 'UTILITY',
        language: 'en',
        body: '🔔 Nayi Lead Assign Hui!\n\n👤 Buyer: {{1}}\n🏠 Requirement: {{2}} in {{3}}\n💰 Budget: {{4}}\n🏷️ Type: {{5}}\n📢 Source: {{6}}\n\n24 ghante mein follow-up zaroor karein.',
        params: [
            { key: 'name', example: 'Amit Sharma' },
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'budget', example: '50 Lakh' },
            { key: 'type', example: 'Sale' },
            { key: 'source', example: 'Website' },
        ],
    },

    rp_tx_match_buyer: {
        name: 'rp_tx_match_buyer_v2',
        category: 'UTILITY',
        language: 'en',
        body: '🎯 Badhaai! Aapki requirement se match karti ek property mili — {{1}}, {{2}} mein. 💰 Price: {{3}}. Visit schedule karni hai toh Schedule Visit button dabayein ya reply karein.',
        params: [
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'price', example: '45 Lakh' },
        ],
        buttons: ['Schedule Visit'],
    },

    rp_tx_match_seller: {
        name: 'rp_tx_match_seller',
        category: 'UTILITY',
        language: 'en',
        body: '📣 Khushkhabri! Aapki {{2}} wali property mein ek potential {{1}} ki interest hai. Hamaari team coordinate karegi aur visit schedule hone par aapko notify kiya jaayega.',
        params: [
            { key: 'party_type', example: 'buyer' },
            { key: 'location', example: 'Sector 150 Noida' },
        ],
    },

    // NEG-3 (2026-06-23) — owner/seller-side negotiation + close notifications (pending Meta approval).
    rp_negotiation_seller: {
        name: 'rp_negotiation_seller',
        category: 'UTILITY',
        language: 'en',
        body: '🤝 Namaste {{1}}! Aapki {{2}} property ke liye ek buyer ke saath negotiation chal rahi hai. Hamaari team aapse jald hi price aur terms confirm karne ke liye sampark karegi.',
        params: [
            { key: 'owner_name', example: 'Rajesh' },
            { key: 'property', example: '3BHK, Sector 150 Noida' },
        ],
    },
    rp_deal_closed_seller: {
        name: 'rp_deal_closed_seller',
        category: 'UTILITY',
        language: 'en',
        body: '🎉 Badhaai {{1}}! Aapki {{2}} property ka deal final ho gaya hai. Hamaari team aapse aage ki formalities ke liye jald sampark karegi. Dhanyavaad!',
        params: [
            { key: 'owner_name', example: 'Rajesh' },
            { key: 'property', example: '3BHK, Sector 150 Noida' },
        ],
    },

    rp_tx_visit_buyer: {
        name: 'rp_tx_visit_buyer',
        category: 'UTILITY',
        language: 'en',
        body: '📅 Property Visit Schedule Ho Gayi! 🏠 Property: {{1}}, {{2}} mein. 📅 Date: {{3}} | ⏰ Time: {{4}}. {{5}}. Attendance confirm karne ke liye *CONFIRM* reply karein.',
        params: [
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'date', example: '22 Feb 2026' },
            { key: 'time', example: '11:00 AM' },
            { key: 'executive_info', example: 'Aapke Realty Pandit executive: Raj Kumar' },
        ],
        buttons: ['Confirm'],
    },

    rp_tx_visit_seller: {
        name: 'rp_tx_visit_seller',
        category: 'UTILITY',
        language: 'en',
        body: '🔔 Property Visit Schedule Ho Gayi. Aapki {{1}} wali property. 📅 Date: {{2}} | ⏰ Time: {{3}}. Ek potential {{4}} visit karenge — property ready rakhein.',
        params: [
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'date', example: '22 Feb 2026' },
            { key: 'time', example: '11:00 AM' },
            { key: 'party_type', example: 'buyer' },
        ],
    },

    rp_tx_deal_closed: {
        name: 'rp_tx_deal_closed_v2',
        category: 'UTILITY',
        language: 'en',
        body: '🎊 Badhaai! {{2}} mein {{1}} ka deal successfully close ho gaya{{3}}! Realty Pandit choose karne ke liye shukriya — nayi property ke liye dheron shubhkamnaayein!',
        params: [
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'price_info', example: ' — 45 Lakh mein' },
        ],
    },

    // ─── Misc Utility (4) ───────────────────────────────────────

    rp_daily_report: {
        name: 'rp_daily_report_v3',
        category: 'UTILITY',
        language: 'en',
        body: '📊 Daily Report ({{1}}). 🔔 Nayi Leads: {{2}} | 💬 Interactions: {{3}}. System active aur monitor kar raha hai.',
        params: [
            { key: 'date', example: '19 Feb 2026' },
            { key: 'leads', example: '12' },
            { key: 'interactions', example: '45' },
        ],
    },

    // Agent-facing reassignment alert (2026-07-22). Approved UTILITY, so it delivers
    // outside the 24h window — unlike the free-form text these alerts used to use,
    // which bounced with 131047 for 33 of 34 staff.
    // NOTE: distinct from rp_executive_reassigned below, which is CUSTOMER-facing.
    rp_agent_deal_reassigned: {
        name: 'rp_agent_deal_reassigned',
        category: 'UTILITY',
        language: 'en',
        body: '🔄 Deal reassigned to you\n\n🤝 Deal: {{1}}\n👤 Customer: {{2}}\n↪️ From: {{3}}\n📝 Reason: {{4}}\n\nOpen the Deal Pipeline to continue.',
        params: [
            { key: 'deal', example: '8021f0e3' },
            { key: 'customer', example: 'Umesh Sharma' },
            { key: 'from', example: 'Ashwani' },
            { key: 'reason', example: 'Coordinator change' },
        ],
    },

    rp_executive_reassigned: {
        name: 'rp_executive_reassigned_v2',
        category: 'UTILITY',
        language: 'en',
        body: '🔄 Namaste {{1}}! Aapke Realty Pandit contact mein update hua hai. Ab {{2}} aapki property {{3}} mein madad karenge. Kisi bhi waqt reach out kar saktein hain!',
        params: [
            { key: 'name', example: 'Amit' },
            { key: 'new_executive', example: 'Raj Kumar' },
            { key: 'deal_type', example: 'purchase' },
        ],
    },

    rp_inventory_confirmed: {
        name: 'rp_inventory_confirmed',
        category: 'UTILITY',
        language: 'en',
        body: '✅ Namaste {{1}}, aapki property Realty Pandit mein submit ho gayi hai! 🏠 Property: {{2}} | 📍 Location: {{3}} | 💰 Price: {{4}}. Property ID: {{5}}. Hamaari team 24 ghante mein verify aur list kar degi.',
        params: [
            { key: 'name', example: 'Sunny' },
            { key: 'type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150, Noida' },
            { key: 'price', example: '55 Lakh' },
            { key: 'id', example: 'INV-12345' },
        ],
    },

    rp_partner_inventory_matched: {
        name: 'rp_partner_inventory_matched',
        category: 'UTILITY',
        language: 'en',
        body: '🎯 Badhaai {{1}}! Aapki property — {{2}}, {{3}} — ke liye ek buyer match hua hai. 💰 Budget: {{4}}.\n\nAapke coordinator {{5}} buyer se coordinate karenge aur aapko update denge. Koi bhi action ki zaroorat nahi — hum sambhal lete hain!',
        params: [
            { key: 'name', example: 'Rahul' },
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'buyer_budget', example: '55 Lakh' },
            { key: 'coordinator', example: 'Sunny Kumar' },
        ],
    },

    rp_partner_client_matched: {
        name: 'rp_partner_client_matched',
        category: 'UTILITY',
        language: 'en',
        body: '🎯 Badhaai {{1}}! Aapke client ke liye ek property match mili — {{2}}, {{3}} mein. 💰 Price: {{4}}.\n\nAapke coordinator {{5}} site visit arrange karenge aur aapko loop mein rakhenge. Jald hi update milega!',
        params: [
            { key: 'name', example: 'Rahul' },
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'price', example: '55 Lakh' },
            { key: 'coordinator', example: 'Sunny Kumar' },
        ],
    },

    // ─── Welcome / Session Openers (reclassified UTILITY) (4) ────

    rp_buyer_lead_received: {
        // 2026-05-17: repointed v3→v4. v3 was MARKETING category (silently
        // undelivered to marketing-opted-out recipients). v4 is an
        // identical-body Meta-APPROVED UTILITY template → delivers reliably.
        // See docs/runbooks/meta-template-approval.md
        name: 'rp_buyer_lead_received_v4',
        category: 'UTILITY',
        language: 'en',
        body: '🏠 Namaste {{1}}!\n\nRealty Pandit par aapki property enquiry mili — shukriya!\n\nMain Panditji hoon — aapka AI property assistant. Seedha is WhatsApp par reply karein aur apni requirement batayein — best options turant dhundh deta hoon.\n\nYa abhi verified properties bhi dekh sakte hain:\n👉 https://realtypandit.in/properties',
        params: [
            { key: 'name', example: 'Amit' },
        ],
        buttons: ['Reply'],
    },

    rp_welcome_buyer: {
        // 2026-05-17: repointed v4→v5 (MARKETING → identical-body APPROVED
        // UTILITY). See docs/runbooks/meta-template-approval.md
        name: 'rp_welcome_buyer_v5',
        category: 'UTILITY',
        language: 'en',
        body: '🏠 Namaste {{1}}! Realty Pandit mein swagat hai. 🙏\n\nMain Panditji hoon — aapka AI property assistant.\n\nApni requirement batayein:\n📍 Location (jaise: Noida, Indirapuram)\n🏷️ Type (flat / plot / villa)\n💰 Budget range\n\nAapke liye best options turant dhundh deta hoon!',
        params: [{ key: 'name', example: 'Amit' }],
        buttons: ['Reply'],
    },

    rp_welcome_seller: {
        name: 'rp_welcome_seller_v4',
        category: 'UTILITY',
        language: 'en',
        body: '🏠 Namaste {{1}}! Realty Pandit mein swagat hai. 🙏\n\nMain Panditji hoon — aapka AI property assistant.\n\nApni property list karein:\n🏷️ Type (flat / house / plot / villa)\n📍 Location\n💰 Asking price\n\nBest buyer dhundh kar jaldi deal close karenge!',
        params: [{ key: 'name', example: 'Amit' }],
        buttons: ['Reply'],
    },

    rp_reopen_session: {
        name: 'rp_reopen_session_v4',
        category: 'UTILITY',
        language: 'en',
        body: '🔔 Namaste {{1}}!\n\nMain Panditji hoon — Realty Pandit se.\n\nAapki property {{2}} ke baare mein ek update hai — reply karein aur conversation continue karte hain.',
        params: [
            { key: 'name', example: 'Amit' },
            { key: 'context', example: 'search' },
        ],
        buttons: ['Reply'],
    },

    // ═══════════════════════════════════════════════════════════════
    // MARKETING TEMPLATES (5)
    // ═══════════════════════════════════════════════════════════════

    // #7 (2026-07-01): team alert when a new listing is added — already APPROVED on Meta as
    // rp_team_new_inventory (MARKETING). {{1}}=property {{2}}=location {{3}}=price {{4}}=share link.
    rp_team_new_inventory: {
        name: 'rp_team_new_inventory',
        category: 'MARKETING',
        language: 'en',
        body: '🆕 New property added to Realty Pandit inventory:\n\n🏠 {{1}}\n📍 {{2}}\n💰 {{3}}\n\nShare it with your matching clients:\n{{4}}\n\nOpen Realty Pandit to see full details. 🙏',
        params: [
            { key: 'property', example: '3BHK Flat' },
            { key: 'location', example: 'Vaishali, Ghaziabad' },
            { key: 'price', example: '85 Lakh' },
            { key: 'link', example: 'https://www.realtypandit.in/properties/RP-GZB-RES-20766' },
        ],
    },

    // #8 (2026-07-09): share an inventory document (Sale Deed, brochure, cost sheet, …) to a
    // contact as a link. Submitted to Meta as rp_document_share (UTILITY, PENDING → check status).
    // {{1}}=document title {{2}}=property {{3}}=public view/download link.
    rp_document_share: {
        name: 'rp_document_share',
        category: 'UTILITY',
        language: 'en',
        body: '📄 Document shared by Realty Pandit:\n\n*{{1}}*\nProperty: {{2}}\n\nView or download here:\n{{3}}\n\nThank you for choosing Realty Pandit. 🙏',
        params: [
            { key: 'title', example: 'Sale Deed' },
            { key: 'property', example: '3BHK Flat, Vaishali' },
            { key: 'link', example: 'https://api.realtypandit.in/uploads/properties/…/documents/deed.pdf' },
        ],
    },

    rp_whatsapp_invite: {
        name: 'rp_whatsapp_invite_v2',
        category: 'MARKETING',
        language: 'en',
        body: '👋 Namaste! Main Panditji hoon — Realty Pandit ka AI Property Assistant. 🏠 Aap hamaari website par properties dekh rahe the — yahaan WhatsApp par conversation continue karein. Reply karein aur shuru karte hain!',
        params: [],
        buttons: ["Haan, batao!"],
        footer: 'Reply STOP to opt out',
    },

    rp_tx_followup_won: {
        name: 'rp_tx_followup_won_v2',
        category: 'MARKETING',
        language: 'en',
        body: '🎉 Nayi property par badhaai! Paperwork ya registration mein madad chahiye toh Panditji available hain. 🤝 Agar doston ya family ko property ki zaroorat ho, Realty Pandit zaroor recommend karein!',
        params: [],
        footer: 'Reply STOP to opt out',
    },

    rp_tx_followup_lost: {
        name: 'rp_tx_followup_lost_v2',
        category: 'MARKETING',
        language: 'en',
        body: '🏠 Namaste! Kuch samay pehle aapne {{2}} mein {{1}} ke baare mein enquiry ki thi. Aapke preferred area mein nayi properties available hain — dekhna chahenge.',
        params: [
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
        ],
        buttons: ['Haan, dikhao'],
        footer: 'Reply STOP to opt out',
    },

    rp_new_listing: {
        name: 'rp_new_listing_v2',
        category: 'MARKETING',
        language: 'en',
        body: '🏠 Naya Listing Alert! {{2}} mein ek {{1}} available hai — sirf {{3}} mein. Details dekhne ke liye View Details button dabayein ya reply karein.',
        params: [
            { key: 'property_type', example: '3BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'price', example: '75 Lakh' },
        ],
        buttons: ['View Details'],
        footer: 'Reply STOP to opt out',
    },

    rp_generic_followup: {
        name: 'rp_generic_followup_v2',
        category: 'MARKETING',
        language: 'en',
        body: '👋 Namaste {{1}}! {{3}} mein {{2}} ki talash abhi bhi jaari hai. Reply karein — latest options dikhata hoon.',
        params: [
            { key: 'name', example: 'Amit' },
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
        ],
        buttons: ['Haan, dikhao'],
        footer: 'Reply STOP to opt out',
    },

    // ═══════════════════════════════════════════════════════════════
    // DEAL MANAGEMENT TEMPLATES (6)
    // ═══════════════════════════════════════════════════════════════

    rp_deal_created: {
        name: 'rp_deal_created',
        category: 'UTILITY',
        language: 'en',
        body: '📋 Nayi Deal Bani! 👤 Customer {{1}} — {{3}} mein {{2}} ki talash mein. 💰 Budget: {{4}}. Aap coordinator assign hain — login karein is deal ko manage karne ke liye.',
        params: [
            { key: 'customer_name', example: 'Rahul Sharma' },
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'budget', example: '50L - 80L' },
        ],
        footer: 'Realty Pandit Deal Management',
    },

    rp_deal_matched: {
        name: 'rp_deal_matched',
        category: 'UTILITY',
        language: 'en',
        body: '🎯 Badhaai! Aapke deal ke liye ek property match hui — {{1}}, {{2}} mein. 💰 Price: {{3}}. Aapke coordinator {{4}} jald visit schedule karenge.',
        params: [
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'price', example: '65 Lakh' },
            { key: 'coordinator_name', example: 'Amit Kumar' },
        ],
        footer: 'Realty Pandit',
    },

    rp_deal_status_update: {
        name: 'rp_deal_status_update',
        category: 'UTILITY',
        language: 'en',
        body: '🔄 Deal Update: Aapka {{1}} deal — {{2}} — ab {{3}} stage par hai. {{4}} Kisi bhi jaankari ke liye apne coordinator se sampark karein.',
        params: [
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'new_status', example: 'Visit Scheduled' },
            { key: 'extra_info', example: 'Visit on 15 March at 3 PM.' },
        ],
        footer: 'Realty Pandit',
    },

    rp_deal_query: {
        name: 'rp_deal_query',
        category: 'UTILITY',
        language: 'en',
        body: '💬 {{2}} mein {{1}} deal par ek nayi query aayi hai: {{3}}. Kripya jald se jald respond karein — CRM mein login karein aur jawab dein.',
        params: [
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'subject', example: 'Property kab available hogi' },
        ],
        footer: 'Realty Pandit',
    },

    rp_deal_query_answered: {
        name: 'rp_deal_query_answered',
        category: 'UTILITY',
        language: 'en',
        body: '✅ Aapki query — {{1}} — {{2}} deal par — ka jawab de diya gaya hai: {{3}}. Poori details ke liye CRM mein login karein.',
        params: [
            { key: 'subject', example: 'Property kab available hogi' },
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'answer_preview', example: 'Property agले mahine se available hai.' },
        ],
        footer: 'Realty Pandit',
    },

    rp_deal_closed_lost: {
        name: 'rp_deal_closed_lost',
        category: 'UTILITY',
        language: 'en',
        body: '📋 Deal Update: {{1}}, {{2}} — yeh deal band ho gayi hai. Karan: {{3}}. Realty Pandit mein aapki trust ke liye bahut shukriya. Aage kabhi bhi zaroorat ho toh hum yahan hain.',
        params: [
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'reason', example: 'Budget mismatch' },
        ],
        footer: 'Realty Pandit',
    },

    // ═══════════════════════════════════════════════════════════════
    // PIPELINE STAGE TEMPLATES (18) — Added 2026-04-24
    // Unified deal pipeline (DEC-003): NEW → QUALIFIED →
    // MATCHING_APPOINTMENT → VISIT_SCHEDULED → VISITED →
    // NEGOTIATION → CLOSED_WON / CLOSED_LOST / ON_HOLD
    // ═══════════════════════════════════════════════════════════════

    // ─── Stage 1 — NEW (2) ──────────────────────────────────────

    rp_call_attempted: {
        name: 'rp_call_attempted',
        category: 'UTILITY',
        language: 'en',
        body: '📞 Namaste {{1}}! Aapko call karne ki koshish ki — connect nahi ho saka. Kab free hain — date aur time batayein, usi waqt call karenge.',
        params: [{ key: 'name', example: 'Amit' }],
        buttons: ['Reply'],
    },

    rp_callback_manager_alert: {
        name: 'rp_callback_manager_alert',
        category: 'UTILITY',
        language: 'en',
        body: '📞 Callback Request! 👤 Customer: {{1}} | ⏰ Requested Time: {{2}} | 🏠 Requirement: {{3}}. CRM update ho gaya hai — please call on time.',
        params: [
            { key: 'name', example: 'Amit Sharma' },
            { key: 'callback_time', example: '25 Apr at 4:00 PM' },
            { key: 'requirement', example: '2BHK in Sector 150, Budget 50L' },
        ],
    },

    // ─── Stage 2 — QUALIFIED (5) ────────────────────────────────

    rp_property_card: {
        name: 'rp_property_card',
        category: 'UTILITY',
        language: 'en',
        headerType: 'IMAGE',
        body: '🏠 {{1}} — {{2}}\n\n📍 {{3}}\n💰 {{4}}\n\n{{5}}',
        params: [
            { key: 'bhk_type', example: '3BHK Flat' },
            { key: 'society_name', example: 'ATS Greens' },
            { key: 'location', example: 'Sector 150, Noida' },
            { key: 'price', example: '75 Lakh' },
            { key: 'description', example: 'Newly renovated, 3rd floor, east facing. Gated society with pool and gym.' },
        ],
        buttons: ['Call Back', 'Schedule Visit', 'Next Option'],
    },

    rp_property_card_sale_v2: {
        name: 'rp_property_card_sale_v2',
        category: 'UTILITY',
        language: 'en',
        headerType: 'IMAGE',
        body: '🏡 *{{1}}* — {{2}}\n\n📍 {{3}}\n💰 ₹{{4}} (One-Time)\n\n✅ {{5}}\n🧭 {{6}}\n🏢 {{7}}\n\n🔥 Seedha apne sapne ka ghar — aaj hi visit book karein!',
        params: [
            { key: 'p1', example: '3BHK Builder Flat' },
            { key: 'p2', example: 'Raj Nagar Extension' },
            { key: 'p3', example: 'Ghaziabad UP' },
            { key: 'p4', example: '75 Lakh' },
            { key: 'p5', example: 'Ready to Move' },
            { key: 'p6', example: 'East Facing' },
            { key: 'p7', example: 'Gated Society with Lift & Parking' },
        ],
        buttons: ['Call Back', 'Schedule Visit', 'Next Option'],
    },

    rp_property_card_rent_v2: {
        name: 'rp_property_card_rent_v2',
        category: 'UTILITY',
        language: 'en',
        headerType: 'IMAGE',
        body: '🏡 *{{1}}* — {{2}}\n\n📍 {{3}}\n💰 ₹{{4}}/month\n\n✅ {{5}}\n🧭 {{6}}\n🏢 {{7}}\n\n🔑 Abhi available hai — visit schedule karein aur ghar dekh lein!',
        params: [
            { key: 'p1', example: '2BHK Flat' },
            { key: 'p2', example: 'Indirapuram' },
            { key: 'p3', example: 'Ghaziabad UP' },
            { key: 'p4', example: '18,000' },
            { key: 'p5', example: 'Semi-Furnished' },
            { key: 'p6', example: '2nd Floor' },
            { key: 'p7', example: 'Gated Society with Lift & Parking' },
        ],
        buttons: ['Call Back', 'Schedule Visit', 'Next Option'],
    },

    // v3: genuine UTILITY copy (promotional urgency line removed) so Meta delivers even to
    // marketing-opted-out recipients. Submitted to Meta 2026-05-23 (sale id 2219870692118811,
    // rent id 1479051350071368). Used by property_sharing once Meta status = APPROVED.
    rp_property_card_sale_v3: {
        name: 'rp_property_card_sale_v3',
        category: 'UTILITY',
        language: 'en',
        headerType: 'IMAGE',
        body: '🏡 *{{1}}* — {{2}}\n\n📍 {{3}}\n💰 ₹{{4}}\n\n✅ {{5}}\n🧭 {{6}}\n🏢 {{7}}\n\nReply to this message for more details or to schedule a visit.',
        params: [
            { key: 'p1', example: '3BHK Builder Flat' },
            { key: 'p2', example: 'Raj Nagar Extension' },
            { key: 'p3', example: 'Ghaziabad UP' },
            { key: 'p4', example: '75 Lakh' },
            { key: 'p5', example: 'Ready to Move' },
            { key: 'p6', example: 'East Facing' },
            { key: 'p7', example: 'Gated Society with Lift & Parking' },
        ],
        buttons: ['Call Back', 'Schedule Visit', 'Next Option'],
    },

    rp_property_card_rent_v3: {
        name: 'rp_property_card_rent_v3',
        category: 'UTILITY',
        language: 'en',
        headerType: 'IMAGE',
        body: '🏡 *{{1}}* — {{2}}\n\n📍 {{3}}\n💰 ₹{{4}}/month\n\n✅ {{5}}\n🧭 {{6}}\n🏢 {{7}}\n\nReply to this message for more details or to schedule a visit.',
        params: [
            { key: 'p1', example: '2BHK Flat' },
            { key: 'p2', example: 'Indirapuram' },
            { key: 'p3', example: 'Ghaziabad UP' },
            { key: 'p4', example: '18,000' },
            { key: 'p5', example: 'Semi-Furnished' },
            { key: 'p6', example: '2nd Floor' },
            { key: 'p7', example: 'Gated Society with Lift & Parking' },
        ],
        buttons: ['Call Back', 'Schedule Visit', 'Next Option'],
    },

    // v4: request-fulfillment framing ("As requested, here are the details of the property matching
    // your enquiry") — strongest legitimate UTILITY attempt. Submitted to Meta 2026-05-23
    // (sale id 972298345496721, rent id 1558455636001225). Used by property_sharing as the preferred
    // card (falls back to v2 if Meta hasn't approved / keeps it MARKETING).
    rp_property_card_sale_v4: {
        name: 'rp_property_card_sale_v4',
        category: 'UTILITY',
        language: 'en',
        headerType: 'IMAGE',
        body: 'Namaste 🙏 As requested, here are the details of the property matching your enquiry:\n\n🏡 {{1}} — {{2}}\n📍 {{3}}\n💰 ₹{{4}}\n✅ {{5}}\n🧭 {{6}}\n🏢 {{7}}\n\nTo schedule a visit or get more information, please reply to this message.',
        params: [
            { key: 'p1', example: '3BHK Builder Flat' },
            { key: 'p2', example: 'Raj Nagar Extension' },
            { key: 'p3', example: 'Ghaziabad UP' },
            { key: 'p4', example: '75 Lakh' },
            { key: 'p5', example: 'Ready to Move' },
            { key: 'p6', example: 'East Facing' },
            { key: 'p7', example: 'Gated Society with Lift & Parking' },
        ],
        buttons: ['Call Back', 'Schedule Visit', 'Next Option'],
    },

    rp_property_card_rent_v4: {
        name: 'rp_property_card_rent_v4',
        category: 'UTILITY',
        language: 'en',
        headerType: 'IMAGE',
        body: 'Namaste 🙏 As requested, here are the details of the property matching your enquiry:\n\n🏡 {{1}} — {{2}}\n📍 {{3}}\n💰 ₹{{4}}/month\n✅ {{5}}\n🧭 {{6}}\n🏢 {{7}}\n\nTo schedule a visit or get more information, please reply to this message.',
        params: [
            { key: 'p1', example: '2BHK Flat' },
            { key: 'p2', example: 'Indirapuram' },
            { key: 'p3', example: 'Ghaziabad UP' },
            { key: 'p4', example: '18,000' },
            { key: 'p5', example: 'Semi-Furnished' },
            { key: 'p6', example: '2nd Floor' },
            { key: 'p7', example: 'Gated Society with Lift & Parking' },
        ],
        buttons: ['Call Back', 'Schedule Visit', 'Next Option'],
    },

    // ─── v5 property cards (2026-06-10): category-correct + clickable property link in body ──────
    // 8 templates = {residential-home, residential-plot, commercial-building, commercial-land} ×
    // {sale, rent}. All APPROVED UTILITY, IMAGE header, 7 body params, 3 quick-reply buttons.
    // p7 is the property website link (WhatsApp auto-links it). Picked by shareInventoryCard via
    // inv.category (res/com) + type-slug /plot|land|orchard/ (plot) + intent (sale/rent).
    rp_property_card_res_sale_v5: {
        name: 'rp_property_card_res_sale_v5', category: 'UTILITY', language: 'en', headerType: 'IMAGE',
        body: 'Namaste 🙏 As requested, here are the details of the residential property you enquired about:\n\n🏡 {{1}}\n📍 {{2}}\n💰 Price: ₹{{3}}\n📐 {{4}}\n🛋 {{5}}\n🏢 {{6}}\n\n🔗 View photos & full details:\n{{7}}\n\nReply here or tap a button below to schedule a visit. 🙏',
        params: [
            { key: 'p1', example: '2 BHK Builder Floor' }, { key: 'p2', example: 'Sector 5, Vaishali, Ghaziabad' },
            { key: 'p3', example: '40.5 Lakh' }, { key: 'p4', example: '550 sqft' }, { key: 'p5', example: 'Semi-Furnished' },
            { key: 'p6', example: 'Floor 3' }, { key: 'p7', example: 'https://www.realtypandit.in/properties/RP-GZB-RES-20471' },
        ],
        buttons: ['Call Back', 'Schedule Visit', 'Next Option'],
    },
    rp_property_card_res_rent_v5: {
        name: 'rp_property_card_res_rent_v5', category: 'UTILITY', language: 'en', headerType: 'IMAGE',
        body: 'Namaste 🙏 As requested, here are the details of the residential property you enquired about:\n\n🏡 {{1}}\n📍 {{2}}\n💰 Rent: ₹{{3}}/month\n📐 {{4}}\n🛋 {{5}}\n🏢 {{6}}\n\n🔗 View photos & full details:\n{{7}}\n\nReply here or tap a button below to schedule a visit. 🙏',
        params: [
            { key: 'p1', example: '2 BHK Flat' }, { key: 'p2', example: 'Indirapuram, Ghaziabad' },
            { key: 'p3', example: '25,000' }, { key: 'p4', example: '1050 sqft' }, { key: 'p5', example: 'Semi-Furnished' },
            { key: 'p6', example: 'Floor 2' }, { key: 'p7', example: 'https://www.realtypandit.in/properties/RP-GZB-RES-20471' },
        ],
        buttons: ['Call Back', 'Schedule Visit', 'Next Option'],
    },
    rp_property_card_res_plot_sale_v5: {
        name: 'rp_property_card_res_plot_sale_v5', category: 'UTILITY', language: 'en', headerType: 'IMAGE',
        body: 'Namaste 🙏 As requested, here are the details of the residential plot you enquired about:\n\n🏞 {{1}}\n📍 {{2}}\n💰 Price: ₹{{3}}\n📐 {{4}}\n🧭 {{5}}\n📜 {{6}}\n\n🔗 View photos & full details:\n{{7}}\n\nReply here or tap a button below to schedule a site visit. 🙏',
        params: [
            { key: 'p1', example: 'Residential Plot' }, { key: 'p2', example: 'Indirapuram, Ghaziabad' },
            { key: 'p3', example: '9.0 Cr' }, { key: 'p4', example: '350 Sq Meter' }, { key: 'p5', example: 'North-East · Road-facing' },
            { key: 'p6', example: 'Freehold · Boundary wall' }, { key: 'p7', example: 'https://www.realtypandit.in/properties/RP-GZB-RES-20474' },
        ],
        buttons: ['Call Back', 'Schedule Visit', 'Next Option'],
    },
    rp_property_card_res_plot_rent_v5: {
        name: 'rp_property_card_res_plot_rent_v5', category: 'UTILITY', language: 'en', headerType: 'IMAGE',
        body: 'Namaste 🙏 As requested, here are the details of the residential plot you enquired about:\n\n🏞 {{1}}\n📍 {{2}}\n💰 Rent: ₹{{3}}/month\n📐 {{4}}\n🧭 {{5}}\n📜 {{6}}\n\n🔗 View photos & full details:\n{{7}}\n\nReply here or tap a button below to schedule a site visit. 🙏',
        params: [
            { key: 'p1', example: 'Residential Plot' }, { key: 'p2', example: 'Indirapuram, Ghaziabad' },
            { key: 'p3', example: '35,000' }, { key: 'p4', example: '200 Sq Yard' }, { key: 'p5', example: 'East · Road-facing' },
            { key: 'p6', example: 'Freehold' }, { key: 'p7', example: 'https://www.realtypandit.in/properties/RP-GZB-RES-20474' },
        ],
        buttons: ['Call Back', 'Schedule Visit', 'Next Option'],
    },
    rp_property_card_com_sale_v5: {
        name: 'rp_property_card_com_sale_v5', category: 'UTILITY', language: 'en', headerType: 'IMAGE',
        body: 'Namaste 🙏 As requested, here are the details of the commercial property you enquired about:\n\n🏢 {{1}}\n📍 {{2}}\n💰 Price: ₹{{3}}\n📐 {{4}}\n🪑 {{5}}\n🚻 {{6}}\n\n🔗 View photos & full details:\n{{7}}\n\nReply here or tap a button below to schedule a visit. 🙏',
        params: [
            { key: 'p1', example: 'Retail Shop' }, { key: 'p2', example: 'Vaishali, Ghaziabad' },
            { key: 'p3', example: '1.1 Cr' }, { key: 'p4', example: '1152 sqft' }, { key: 'p5', example: 'Unfurnished' },
            { key: 'p6', example: 'Ground Floor' }, { key: 'p7', example: 'https://www.realtypandit.in/properties/RP-MEE-COM-20190' },
        ],
        buttons: ['Call Back', 'Schedule Visit', 'Next Option'],
    },
    rp_property_card_com_rent_v5: {
        name: 'rp_property_card_com_rent_v5', category: 'UTILITY', language: 'en', headerType: 'IMAGE',
        body: 'Namaste 🙏 As requested, here are the details of the commercial property you enquired about:\n\n🏢 {{1}}\n📍 {{2}}\n💰 Rent: ₹{{3}}/month\n📐 {{4}}\n🪑 {{5}}\n🚻 {{6}}\n\n🔗 View photos & full details:\n{{7}}\n\nReply here or tap a button below to schedule a visit. 🙏',
        params: [
            { key: 'p1', example: 'Office Space' }, { key: 'p2', example: 'Indirapuram, Ghaziabad' },
            { key: 'p3', example: '70,000' }, { key: 'p4', example: '1200 sqft · Built-up' }, { key: 'p5', example: 'Unfurnished' },
            { key: 'p6', example: '1 Washroom' }, { key: 'p7', example: 'https://www.realtypandit.in/properties/RP-MEE-COM-20190' },
        ],
        buttons: ['Call Back', 'Schedule Visit', 'Next Option'],
    },
    rp_property_card_com_plot_sale_v5: {
        name: 'rp_property_card_com_plot_sale_v5', category: 'UTILITY', language: 'en', headerType: 'IMAGE',
        body: 'Namaste 🙏 As requested, here are the details of the commercial land you enquired about:\n\n🏗 {{1}}\n📍 {{2}}\n💰 Price: ₹{{3}}\n📐 {{4}}\n🧭 {{5}}\n📜 {{6}}\n\n🔗 View photos & full details:\n{{7}}\n\nReply here or tap a button below to schedule a site visit. 🙏',
        params: [
            { key: 'p1', example: 'Commercial Land' }, { key: 'p2', example: 'Ghaziabad' },
            { key: 'p3', example: '12.5 Cr' }, { key: 'p4', example: '5000 Sq Yard' }, { key: 'p5', example: 'East · Road-facing' },
            { key: 'p6', example: 'Freehold · Boundary wall' }, { key: 'p7', example: 'https://www.realtypandit.in/properties/RP-MEE-COM-20190' },
        ],
        buttons: ['Call Back', 'Schedule Visit', 'Next Option'],
    },
    rp_property_card_com_plot_rent_v5: {
        name: 'rp_property_card_com_plot_rent_v5', category: 'UTILITY', language: 'en', headerType: 'IMAGE',
        body: 'Namaste 🙏 As requested, here are the details of the commercial land you enquired about:\n\n🏗 {{1}}\n📍 {{2}}\n💰 Rent: ₹{{3}}/month\n📐 {{4}}\n🧭 {{5}}\n📜 {{6}}\n\n🔗 View photos & full details:\n{{7}}\n\nReply here or tap a button below to schedule a site visit. 🙏',
        params: [
            { key: 'p1', example: 'Commercial Land' }, { key: 'p2', example: 'Ghaziabad' },
            { key: 'p3', example: '1.5 Lakh' }, { key: 'p4', example: '2000 Sq Yard' }, { key: 'p5', example: 'East · Road-facing' },
            { key: 'p6', example: 'Freehold' }, { key: 'p7', example: 'https://www.realtypandit.in/properties/RP-MEE-COM-20190' },
        ],
        buttons: ['Call Back', 'Schedule Visit', 'Next Option'],
    },

    rp_visit_availability: {
        name: 'rp_visit_availability',
        category: 'UTILITY',
        language: 'en',
        body: '📅 Visit ke liye kab available hain — please date aur time share karein. Aapki convenience ke hisaab se arrange karenge.',
        params: [],
        buttons: ['Reply'],
    },

    rp_cold_rent_nudge: {
        name: 'rp_cold_rent_nudge',
        category: 'MARKETING',
        language: 'en',
        body: '🏠 Namaste {{1}}! Aapke area mein rental ke nayi options aa gayi hain — aapki requirement se match karti hain. Dekhna chahenge toh reply karein.',
        params: [{ key: 'name', example: 'Amit' }],
        buttons: ['Haan, dikhao'],
        footer: 'Reply STOP to opt out',
    },

    rp_cold_buy_nudge: {
        name: 'rp_cold_buy_nudge',
        category: 'MARKETING',
        language: 'en',
        body: '🏠 Namaste {{1}}! {{2}} mein {{3}} ki aapki talash ke liye ek accha update hai — aapke budget mein ek nayi property available hui hai. Interested hain toh reply karein.',
        params: [
            { key: 'name', example: 'Amit' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'property_type', example: '2BHK Flat' },
        ],
        buttons: ['Haan, dikhao'],
        footer: 'Reply STOP to opt out',
    },

    rp_all_properties_shared: {
        name: 'rp_all_properties_shared',
        category: 'UTILITY',
        language: 'en',
        body: '🔎 Filhaal aapki requirement se match karne wali saari properties share kar di hain. Jaise hi nayi option milegi — turant aapko batayenge. Koi aur help chahiye toh reply karein.',
        params: [],
        buttons: ['Reply'],
    },

    // ─── Appointment Booking Notifications (Deal Workspace) ──────

    rp_visit_confirmation_customer: {
        name: 'rp_visit_confirmation_customer',
        category: 'UTILITY',
        language: 'en',
        body: '✅ *Visit Confirmed!*\n\nNamaste {{1}} 🙏\n\nAapki property visit book ho gayi hai:\n\n🏡 *{{2}}*\n📍 {{3}}\n📅 {{4}}\n\nHumara team aapka swagat karega. Koi sawaal ho toh humse baat karein.',
        params: [
            { key: 'customer_name', example: 'Nandini Ji' },
            { key: 'property_label', example: '3BHK Flat' },
            { key: 'location', example: 'Sector 62, Noida' },
            { key: 'visit_datetime', example: '15 May 2026, 11:00 AM' },
        ],
    },

    rp_visit_booked_manager: {
        name: 'rp_visit_booked_manager',
        category: 'UTILITY',
        language: 'en',
        body: '📅 *Visit Booked!*\n\nHi {{1}},\n\nNayi property visit confirm hui hai:\n\n👤 Customer: {{2}} ({{3}})\n🏡 {{4}}\n📍 {{5}}\n📅 {{6}}\n\nPlease CRM update karein aur timing ensure karein.',
        params: [
            { key: 'manager_name', example: 'Rahul' },
            { key: 'customer_name', example: 'Nandini Paliwal' },
            { key: 'customer_phone', example: '9876543210' },
            { key: 'property_label', example: '3BHK Flat' },
            { key: 'location', example: 'Sector 62, Noida' },
            { key: 'visit_datetime', example: '15 May 2026, 11:00 AM' },
        ],
    },

    rp_visit_keyholder_alert: {
        name: 'rp_visit_keyholder_alert',
        category: 'UTILITY',
        language: 'en',
        body: '🔑 *Property Visit Alert*\n\nHi {{1}},\n\n{{2}} ({{3}}) ke liye ek client aa raha hai:\n\n📱 Customer: {{4}}\n📅 {{5}}\n\nKripya keys ready rakhein aur samay par pahunchen.',
        params: [
            { key: 'keyholder_name', example: 'Suresh Ji' },
            { key: 'property_label', example: '3BHK Flat' },
            { key: 'location', example: 'Sector 62, Noida' },
            { key: 'customer_masked_phone', example: 'XXXXXX3210' },
            { key: 'visit_datetime', example: '15 May 2026, 11:00 AM' },
        ],
    },

    // ─── Stage 3 — MATCHING_APPOINTMENT (Legacy, kept for existing templates) ─

    rp_appt_pending_customer: {
        name: 'rp_appt_pending_customer',
        category: 'UTILITY',
        language: 'en',
        body: '⏳ Aapka appointment request hamare paas pahunch gaya hai — hum abhi confirm kar rahe hain. Thodi der mein aapko update mil jaayega.',
        params: [],
    },

    rp_appt_confirm_reminder: {
        name: 'rp_appt_confirm_reminder',
        category: 'UTILITY',
        language: 'en',
        body: '🔔 Action Required! 👤 {{1}} ne {{2}} ke liye appointment request ki hai — {{3}}, {{4}}. Kripya CRM mein confirm karein.',
        params: [
            { key: 'customer_name', example: 'Amit Sharma' },
            { key: 'datetime', example: '26 Apr at 11:00 AM' },
            { key: 'property', example: '3BHK Flat' },
            { key: 'location', example: 'Sector 150, Noida' },
        ],
    },

    rp_appt_escalation: {
        name: 'rp_appt_escalation',
        category: 'UTILITY',
        language: 'en',
        body: '⚠️ Escalation! 👤 {{1}} ka appointment request {{2}} se pending hai — {{3}} ghante ho gaye, Lead Manager ne respond nahi kiya. Immediate action required.',
        params: [
            { key: 'customer_name', example: 'Amit Sharma' },
            { key: 'requested_time', example: '26 Apr at 11:00 AM' },
            { key: 'hours_elapsed', example: '3' },
        ],
    },

    // ─── Stage 4 — VISIT_SCHEDULED (4) ──────────────────────────

    rp_visit_customer_confirmed: {
        name: 'rp_visit_customer_confirmed',
        category: 'UTILITY',
        language: 'en',
        body: '✅ Attendance Confirmed! 👤 {{1}} ne aaj ki visit confirm kar di. 🏠 {{2}} | ⏰ {{3}}. Please ensure timely arrival.',
        params: [
            { key: 'customer_name', example: 'Amit Sharma' },
            { key: 'property', example: '3BHK Flat, Sector 150' },
            { key: 'time', example: '11:00 AM' },
        ],
    },

    rp_visit_manager_1hr: {
        name: 'rp_visit_manager_1hr',
        category: 'UTILITY',
        language: 'en',
        body: '⏰ 1 Ghante Mein Visit! 👤 {{1}} | 🏠 {{2}} | 📍 {{3}} | ⏰ {{4}}. Taiyaar ho jaayein.',
        params: [
            { key: 'customer_name', example: 'Amit Sharma' },
            { key: 'property', example: '3BHK Flat' },
            { key: 'location', example: 'Sector 150, Noida' },
            { key: 'time', example: '11:00 AM' },
        ],
    },

    rp_visit_daily_schedule: {
        name: 'rp_visit_daily_schedule',
        category: 'UTILITY',
        language: 'en',
        body: '📋 Aaj Ka Visit Schedule ({{1}})\n\n{{2}}\n\nSabhi visits ke liye taiyaar rahein. Koi change ho toh CRM update karein.',
        params: [
            { key: 'date', example: '25 Apr 2026' },
            { key: 'visit_list', example: '1. Amit Sharma — 3BHK Sector 150 — 10:00 AM\n2. Priya Singh — 2BHK Sector 62 — 2:00 PM' },
        ],
    },

    rp_manager_noshow_alert: {
        name: 'rp_manager_noshow_alert',
        category: 'UTILITY',
        language: 'en',
        body: '⚠️ No-Show Alert! Lead Manager {{1}} ke 3 consecutive visits no-show ho chuke hain. Immediate review required — please CRM check karein.',
        params: [{ key: 'manager_name', example: 'Raj Kumar' }],
    },

    // ─── Stage 6 — NEGOTIATION (3) ──────────────────────────────

    rp_negotiation_availability: {
        name: 'rp_negotiation_availability',
        category: 'UTILITY',
        language: 'en',
        body: '🤝 Badhaai! Aapki deal negotiation stage mein hai. Aage badhne ke liye hamaari team aapse ek chhoti meeting karna chahti hai. Aap kab available hain — please preferred date aur time share karein.',
        params: [],
        buttons: ['Reply'],
    },

    rp_negotiation_nudge: {
        name: 'rp_negotiation_nudge',
        category: 'UTILITY',
        language: 'en',
        body: '🔔 Meeting Pending! 👤 {{1}} ke saath negotiation meeting abhi tak schedule nahi hui — 48 ghante ho gaye. Please jald se jald meeting book karein.',
        params: [{ key: 'customer_name', example: 'Amit Sharma' }],
    },

    rp_negotiation_inactive: {
        name: 'rp_negotiation_inactive',
        category: 'UTILITY',
        language: 'en',
        body: '⚠️ Inactivity Alert! 👤 {{1}} ki deal mein 14 din se koi progress nahi — deal ON_HOLD mein move ho gayi. Please follow-up karein ya deal close karein.',
        params: [{ key: 'customer_name', example: 'Amit Sharma' }],
    },

    // ─── ON_HOLD (1) ─────────────────────────────────────────────

    rp_deal_onhold: {
        name: 'rp_deal_onhold',
        category: 'UTILITY',
        language: 'en',
        body: '⏸️ Deal On Hold! 👤 {{1}} — {{2}}, {{3}}. Reason: {{4}}. CRM mein review karein — Revive ya Close karein.',
        params: [
            { key: 'customer_name', example: 'Amit Sharma' },
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'reason', example: '14 din se koi progress nahi' },
        ],
    },

    // ─── Stage 4 — VISIT_SCHEDULED customer reminders (2) ───────

    rp_visit_reminder_24hr: {
        name: 'rp_visit_reminder_24hr',
        category: 'UTILITY',
        language: 'en',
        body: '⏰ Kal aapki property visit hai! 📅 {{1}} | 🏠 {{2}}\n\nAa rahe hain toh Confirmed button dabayein — ya reschedule karna ho toh reply karein, hum arrange kar denge.',
        params: [
            { key: 'datetime', example: '27 Apr at 11:00 AM' },
            { key: 'property', example: '3BHK Flat, Sector 150' },
        ],
        buttons: ['Confirmed'],
    },

    rp_visit_reminder_2hr: {
        name: 'rp_visit_reminder_2hr',
        category: 'UTILITY',
        language: 'en',
        body: '🔔 2 ghante mein visit! 📅 {{1}} | 🏠 {{2}} | 📍 Maps: {{3}}\n\nTime pe pahunchen — hum wait karenge!',
        params: [
            { key: 'datetime', example: '11:00 AM' },
            { key: 'property', example: '3BHK Flat, Sector 150' },
            { key: 'maps_link', example: 'https://maps.google.com/?q=28.5,77.4' },
        ],
        buttons: ['Confirmed'],
    },

    // ─── Stage 4 — VISIT_SCHEDULED customer confirmation (1) ─────

    rp_visit_confirmed_customer: {
        name: 'rp_visit_confirmed_customer',
        category: 'UTILITY',
        language: 'en',
        body: '✅ Aapki Visit Confirm Ho Gayi! 📅 {{1}} | 🏠 {{2}} | 📍 Location: {{3}}\n\nSamay par pahunchein — hamaari team aapka intezaar karegi.',
        params: [
            { key: 'datetime', example: '27 Apr at 11:00 AM' },
            { key: 'property', example: '3BHK Flat, Sector 150' },
            { key: 'maps_link', example: 'https://maps.google.com/?q=28.5355,77.3910' },
        ],
    },
};

// ─── Helper Functions ───────────────────────────────────────────

/**
 * Build a Meta Graph API template payload from template name + param values.
 *
 * @param templateName - Key from TEMPLATE_REGISTRY (e.g., 'rp_user_otp')
 * @param paramValues  - Object mapping param keys to values (e.g., { otp: '123456' })
 * @returns Ready-to-send payload with name, language, and components array
 * @throws If template not found in registry
 */
export function buildTemplatePayload(
    templateName: string,
    paramValues: Record<string, string>,
    imageUrl?: string,
): TemplatePayload {
    const template = TEMPLATE_REGISTRY[templateName];
    if (!template) {
        throw new Error(`WhatsApp template "${templateName}" not found in registry`);
    }

    const components: any[] = [];

    // Image header (rp_property_card and any future IMAGE header templates)
    if (template.headerType === 'IMAGE' && imageUrl) {
        components.push({
            type: 'header',
            parameters: [{ type: 'image', image: { link: imageUrl } }],
        });
    }

    // Body parameters
    if (template.params.length > 0) {
        const bodyParams = template.params.map(p => ({
            type: 'text' as const,
            text: paramValues[p.key] || p.example, // Fallback to example if missing
        }));
        components.push({
            type: 'body',
            parameters: bodyParams,
        });
    }

    // Button components
    if (template.category === 'AUTHENTICATION' && template.params.length > 0) {
        // AUTH COPY_CODE templates need: sub_type "url", index "0", OTP as text param
        const otpValue = paramValues[template.params[0].key] || template.params[0].example;
        components.push({
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: otpValue }],
        });
    } else if (template.buttons && template.buttons.length > 0) {
        template.buttons.forEach((_, index) => {
            components.push({
                type: 'button',
                sub_type: 'quick_reply',
                index: index.toString(),
                parameters: [{ type: 'payload', payload: `${templateName}_btn_${index}` }],
            });
        });
    }

    return {
        name: template.name,
        language: template.language,
        components,
    };
}

/**
 * Get all templates for a given category (useful for Meta submission batching).
 */
export function getTemplatesByCategory(category: TemplateCategory): TemplateDefinition[] {
    return Object.values(TEMPLATE_REGISTRY).filter(t => t.category === category);
}

/**
 * Get a human-readable summary of all templates (useful for generating
 * the Meta Business Manager submission spreadsheet).
 */
export function getTemplateSummary(): { name: string; category: string; body: string; paramCount: number }[] {
    return Object.values(TEMPLATE_REGISTRY).map(t => ({
        name: t.name,
        category: t.category,
        body: t.body,
        paramCount: t.params.length,
    }));
}
