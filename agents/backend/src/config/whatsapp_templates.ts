/**
 * WhatsApp Meta Template Registry
 *
 * Central registry of all 38 Meta-approved WhatsApp Business API templates.
 * These templates are required for business-initiated messages sent outside
 * the 24-hour session window.
 *
 * Categories:
 * - AUTHENTICATION (3): OTP / login codes
 * - UTILITY (27): Transactional updates (appointments, visits, deals, reports)
 * - MARKETING (8): Promotional, re-engagement, welcome, campaigns
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
    /** Header text (if any) */
    header?: string;
    /** Footer text (if any) */
    footer?: string;
}

export interface TemplatePayload {
    name: string;
    language: string;
    components: any[];
}

// ─── Template Registry ──────────────────────────────────────────

export const TEMPLATE_REGISTRY: Record<string, TemplateDefinition> = {

    // ═══════════════════════════════════════════════════════════════
    // AUTHENTICATION TEMPLATES (3)
    // ═══════════════════════════════════════════════════════════════

    rp_user_otp: {
        name: 'rp_user_otp',
        category: 'AUTHENTICATION',
        language: 'en',
        body: 'Your Realty Pandit verification code is {{1}}. Valid for 10 minutes. Do not share this code.',
        params: [{ key: 'otp', example: '123456' }],
        buttons: ['Copy Code'],
    },

    rp_password_reset: {
        name: 'rp_password_reset_v2',
        category: 'AUTHENTICATION',
        language: 'en',
        body: 'Your Realty Pandit password reset code is {{1}}. Valid for 10 minutes. Do not share this code.',
        params: [
            { key: 'otp', example: '654321' },
        ],
        buttons: ['Copy Code'],
    },

    rp_agent_otp: {
        name: 'rp_agent_otp',
        category: 'AUTHENTICATION',
        language: 'en',
        body: 'Your Realty Pandit Agent login code is {{1}}. Valid for 5 minutes. Do not share this code.',
        params: [{ key: 'otp', example: '789012' }],
        buttons: ['Copy Code'],
    },

    // ═══════════════════════════════════════════════════════════════
    // UTILITY TEMPLATES (27)
    // ═══════════════════════════════════════════════════════════════

    // ─── Onboarding & Welcome (4) ───────────────────────────────

    rp_whatsapp_link: {
        name: 'rp_whatsapp_link',
        category: 'UTILITY',
        language: 'en',
        body: "You're about to connect your WhatsApp with Realty Pandit's AI property assistant. Reply *Yes* to sync your conversations across all channels and get property recommendations directly here.",
        params: [],
        buttons: ['Yes', 'No thanks'],
    },

    rp_agent_welcome_free: {
        name: 'rp_agent_welcome_free',
        category: 'UTILITY',
        language: 'en',
        body: 'Welcome to Realty Pandit Partner Network, {{1}}! Your FREE account is active. You can list up to 10 properties and receive enquiry notifications. Upload properties by chatting here or via your dashboard. Type "add property" to get started!',
        params: [{ key: 'name', example: 'Rahul' }],
    },

    rp_partner_registered: {
        name: 'rp_partner_registered',
        category: 'UTILITY',
        language: 'en',
        body: 'Welcome to Realty Pandit Partner Network, {{1}}! You have been registered as a {{2}}. Your coordinator is {{3}} who will assist you with onboarding. Login to your partner portal at https://realtypandit.in/agent/login using this WhatsApp number to receive OTP. Upload your properties and start receiving buyer leads!',
        params: [
            { key: 'name', example: 'Rahul Sharma' },
            { key: 'category', example: 'Individual Partner' },
            { key: 'coordinator', example: 'Sunny Kumar' },
        ],
    },

    rp_partner_welcome_confirmed: {
        name: 'rp_partner_welcome_confirmed',
        category: 'UTILITY',
        language: 'en',
        header: 'Registration Confirmed!',
        body: 'Namaste {{1}}! Your registration as a {{2}} on Realty Pandit Partner Network is confirmed.\n\nYour Coordinator: {{3}}\nPackage: {{4}}\n\nNext Steps:\n1. Login to your Partner Portal\n2. Upload your property inventory\n3. Start receiving buyer leads\n\nPortal: https://realtypandit.in/agent/login\nUse this WhatsApp number to receive your login OTP.',
        params: [
            { key: 'name', example: 'Meenakshi Sharma' },
            { key: 'category', example: 'Individual Partner' },
            { key: 'coordinator', example: 'Sunny Kumar' },
            { key: 'package', example: 'Free (10 listings)' },
        ],
        buttons: ['Open Portal'],
    },

    rp_agent_welcome_paid: {
        name: 'rp_agent_welcome_paid',
        category: 'UTILITY',
        language: 'en',
        body: 'Welcome to Realty Pandit Partner Network, {{1}}! Thank you for choosing {{2}} package. Your account will be activated once payment is confirmed. Dashboard: https://realtypandit.in/agent/login',
        params: [
            { key: 'name', example: 'Rahul' },
            { key: 'package', example: 'PRO' },
        ],
    },

    rp_team_welcome: {
        name: 'rp_team_welcome_v2',
        category: 'UTILITY',
        language: 'en',
        body: 'Welcome to Realty Pandit! Your account has been created. Please check your email for login credentials and password setup link. The setup link is valid for 48 hours. After setup, login at admin.realtypandit.in to access your dashboard.',
        params: [],
    },

    // ─── Appointment Management (2) ─────────────────────────────

    rp_appointment_confirm: {
        name: 'rp_appointment_confirm',
        category: 'UTILITY',
        language: 'en',
        body: 'Appointment Confirmed! Your property visit for {{1}} in {{2}} is scheduled on {{3}} at {{4}}. Your point of contact is {{5}}. Please arrive on time. Reply Confirm to acknowledge or Reschedule to change the timing.',
        params: [
            { key: 'type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'date', example: '22 Feb 2026' },
            { key: 'time', example: '11:00 AM' },
            { key: 'contact_info', example: 'Raj Kumar (+919876543210)' },
        ],
        buttons: ['Confirm', 'Reschedule'],
    },

    rp_appointment_reminder: {
        name: 'rp_appointment_reminder',
        category: 'UTILITY',
        language: 'en',
        body: 'Reminder: Your property visit {{1}} is tomorrow. Date: {{2}}, Time: {{3}}. Reply Confirm if you\'re coming or Reschedule to change the time.',
        params: [
            { key: 'title', example: '2BHK Flat Visit' },
            { key: 'date', example: '22 Feb 2026' },
            { key: 'time', example: '11:00 AM' },
        ],
        buttons: ['Confirm', 'Reschedule'],
    },

    // ─── Site Visit Notifications (4) ───────────────────────────

    rp_visit_agent_notify: {
        name: 'rp_visit_agent_notify_v2',
        category: 'UTILITY',
        language: 'en',
        body: 'NEW SITE VISIT REQUEST. Customer: {{1}}. Property: {{2}}, Price: {{3}}, Location: {{4}}. Source: {{5}}. Action: Contact customer via CRM to confirm timing, coordinate with key holder.',
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
        body: 'Site visit scheduled for your property: {{1}} at {{2}}. Visitor: {{3}}. Please keep property accessible. Our agent will contact you to confirm timing.',
        params: [
            { key: 'property', example: '3BHK Flat' },
            { key: 'address', example: 'ATS Greens, Sector 150' },
            { key: 'visitor_name', example: 'Amit Sharma' },
        ],
    },

    rp_visit_mgmt_alert: {
        name: 'rp_visit_mgmt_alert_v2',
        category: 'UTILITY',
        language: 'en',
        body: 'HIGH-VALUE VISIT REQUEST. Property: {{1}} ({{2}}). Customer: {{3}}. This lead has been assigned to {{4}} for immediate follow-up. Please ensure timely coordination.',
        params: [
            { key: 'property', example: '4BHK Villa' },
            { key: 'price', example: '2.5 Cr' },
            { key: 'customer_name', example: 'Suresh Gupta' },
            { key: 'agent', example: 'Raj Kumar' },
        ],
    },

    rp_whatsapp_invite: {
        name: 'rp_whatsapp_invite_v2',
        category: 'MARKETING',
        language: 'en',
        body: 'Hi! This is Panditji, your AI Property Assistant from Realty Pandit. I see you were browsing properties on our website. Would you like to continue our conversation here on WhatsApp? Just reply to get started!',
        params: [],
        buttons: ['Yes, let\'s chat!'],
        footer: 'Reply STOP to opt out',
    },

    // ─── Missed Call & No-Show (2) ──────────────────────────────

    rp_missed_call: {
        name: 'rp_missed_call',
        category: 'UTILITY',
        language: 'en',
        body: 'Hi! We noticed we missed your call. How can we help you regarding property details? Reply to connect with Panditji, your AI property assistant.',
        params: [],
        buttons: ['Reply'],
    },

    rp_noshow_recovery: {
        name: 'rp_noshow_recovery',
        category: 'UTILITY',
        language: 'en',
        body: 'It looks like the property visit was missed. Would you like us to schedule another time? Reply to reschedule.',
        params: [],
        buttons: ['Reschedule'],
    },

    // ─── Transaction Lifecycle Follow-ups (8) ───────────────────

    rp_tx_followup_new: {
        name: 'rp_tx_followup_new',
        category: 'UTILITY',
        language: 'en',
        body: "Namaste! This is Panditji from Realty Pandit. You recently inquired about {{1}}. Could you share your budget, preferred location, and property type? I'll find the best options for you!",
        params: [{ key: 'inquiry_type', example: 'purchasing a property' }],
    },

    rp_tx_followup_matched: {
        name: 'rp_tx_followup_matched',
        category: 'UTILITY',
        language: 'en',
        body: 'Hello! We found a {{1}} matching your search in {{2}}. Would you like to schedule a site visit? Reply to get details.',
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
        body: "Reminder: Your property visit is scheduled for tomorrow. Please confirm if you're attending or let us know to reschedule.",
        params: [],
        buttons: ['Confirm', 'Reschedule'],
    },

    rp_tx_visit_reminder_2h: {
        name: 'rp_tx_visit_reminder_2h',
        category: 'UTILITY',
        language: 'en',
        body: 'Your property visit is in 2 hours. Ready? If you have any questions, just ask!',
        params: [],
    },

    rp_tx_followup_visited: {
        name: 'rp_tx_followup_visited',
        category: 'UTILITY',
        language: 'en',
        body: 'Namaste! You recently visited a property in {{1}}. How was it? Would you like to proceed or see more options? Your feedback helps us find better matches.',
        params: [{ key: 'location', example: 'Sector 150 Noida' }],
    },

    rp_tx_followup_negotiation: {
        name: 'rp_tx_followup_negotiation',
        category: 'UTILITY',
        language: 'en',
        body: 'Hello! Any update on the {{1}} deal? If you need help with price negotiation, our Realty Pandit team is ready to assist and get you the best deal.',
        params: [{ key: 'property_type', example: '2BHK Flat' }],
    },

    rp_tx_followup_won: {
        name: 'rp_tx_followup_won_v2',
        category: 'MARKETING',
        language: 'en',
        body: 'Congratulations on your new property! If you need help with paperwork or registration, Panditji is here. And if friends or family need property help, recommend Realty Pandit!',
        params: [],
        footer: 'Reply STOP to opt out',
    },

    rp_tx_followup_lost: {
        name: 'rp_tx_followup_lost_v2',
        category: 'MARKETING',
        language: 'en',
        body: 'Namaste! You had inquired about {{1}} in {{2}} a while ago. We have new properties available in your preferred area. Would you like to take a look?',
        params: [
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
        ],
        buttons: ['Yes, show me'],
        footer: 'Reply STOP to opt out',
    },

    // ─── Transaction Status Notifications (7) ───────────────────

    rp_tx_created: {
        name: 'rp_tx_created',
        category: 'UTILITY',
        language: 'en',
        body: "Namaste {{1}}! Your property search is registered with Realty Pandit. {{2}} from our team is assigned to help you. We'll find the best {{3}}options for you!",
        params: [
            { key: 'name', example: 'Amit' },
            { key: 'executive', example: 'Raj Kumar' },
            { key: 'rental_prefix', example: 'rental ' },
        ],
    },

    rp_tx_lead_assigned: {
        name: 'rp_tx_lead_assigned',
        category: 'UTILITY',
        language: 'en',
        body: 'New Lead Assigned. Buyer: {{1}}. Looking for: {{2}} in {{3}}. Budget: {{4}}. Type: {{5}}. Source: {{6}}. Please follow up within 24 hours.',
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
        name: 'rp_tx_match_buyer',
        category: 'UTILITY',
        language: 'en',
        body: 'Great news! We found a property matching your requirements: {{1}} in {{2}}, Price: {{3}}. Would you like to schedule a visit? Reply "schedule visit".',
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
        body: "Good news! A potential {{1}} is interested in your property at {{2}}. Our team will coordinate. We'll notify you when a visit is scheduled.",
        params: [
            { key: 'party_type', example: 'buyer' },
            { key: 'location', example: 'Sector 150 Noida' },
        ],
    },

    rp_tx_visit_buyer: {
        name: 'rp_tx_visit_buyer',
        category: 'UTILITY',
        language: 'en',
        body: 'Property Visit Scheduled. Property: {{1}} in {{2}}. Date: {{3}}, Time: {{4}}. {{5}}. Reply CONFIRM to confirm attendance.',
        params: [
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'date', example: '22 Feb 2026' },
            { key: 'time', example: '11:00 AM' },
            { key: 'executive_info', example: 'Your Realty Pandit executive: Raj Kumar' },
        ],
        buttons: ['Confirm'],
    },

    rp_tx_visit_seller: {
        name: 'rp_tx_visit_seller',
        category: 'UTILITY',
        language: 'en',
        body: 'Property Visit Scheduled. Your property at {{1}}. Date: {{2}}, Time: {{3}}. A potential {{4}} will visit. Please ensure the property is ready.',
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
        body: 'Congratulations! The deal for {{1}} in {{2}} is closed successfully{{3}}! Thank you for choosing Realty Pandit. We wish you all the best with your new property.',
        params: [
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'price_info', example: ' at 45 Lakh' },
        ],
    },

    // ═══════════════════════════════════════════════════════════════
    // MARKETING TEMPLATES (8)
    // ═══════════════════════════════════════════════════════════════

    rp_welcome_buyer: {
        name: 'rp_welcome_buyer_v2',
        category: 'MARKETING',
        language: 'en',
        body: "Namaste {{1}}! Welcome to Realty Pandit. I'm Panditji, your AI property assistant. Tell me what you're looking for - type, budget, location - and I'll find the best options for you.",
        params: [{ key: 'name', example: 'Amit' }],
        buttons: ['Reply'],
        footer: 'Reply STOP to opt out',
    },

    rp_welcome_seller: {
        name: 'rp_welcome_seller_v2',
        category: 'MARKETING',
        language: 'en',
        body: "Namaste {{1}}! Welcome to Realty Pandit. I'm Panditji. Ready to list your property? Just tell me the type (flat/house/plot), location, and asking price.",
        params: [{ key: 'name', example: 'Amit' }],
        buttons: ['Reply'],
        footer: 'Reply STOP to opt out',
    },

    rp_new_listing: {
        name: 'rp_new_listing_v2',
        category: 'MARKETING',
        language: 'en',
        body: 'New listing alert! A {{1}} is now available in {{2}} for {{3}}. Reply "details" to know more.',
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
        body: "Hi {{1}}! Just checking in - are you still looking for a {{2}} in {{3}}? Reply and I'll show you the latest options.",
        params: [
            { key: 'name', example: 'Amit' },
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
        ],
        buttons: ['Yes, Show Options'],
        footer: 'Reply STOP to opt out',
    },

    rp_daily_report: {
        name: 'rp_daily_report_v2',
        category: 'UTILITY',
        language: 'en',
        body: 'Daily Report ({{1}}). New Leads: {{2}}. Interactions: {{3}}. System is active and monitoring.',
        params: [
            { key: 'date', example: '19 Feb 2026' },
            { key: 'leads', example: '12' },
            { key: 'interactions', example: '45' },
        ],
    },

    rp_subscription_expiry: {
        name: 'rp_subscription_expiry_v2',
        category: 'UTILITY',
        language: 'en',
        body: 'Your Realty Pandit Partner Subscription has expired. Please renew via the dashboard to keep receiving leads and listing properties.',
        params: [],
        buttons: ['Renew Now'],
    },

    rp_executive_reassigned: {
        name: 'rp_executive_reassigned_v2',
        category: 'UTILITY',
        language: 'en',
        body: 'Hi {{1}}! Your Realty Pandit contact has been updated. {{2}} will now assist you with your property {{3}}. Feel free to reach out anytime!',
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
        body: 'Hi {{1}}, your property has been submitted to Realty Pandit! Property: {{2}} | Location: {{3}} | Price: {{4}}. Property ID: {{5}}. Our team will verify and list it within 24 hours.',
        params: [
            { key: 'name', example: 'Sunny' },
            { key: 'type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150, Noida' },
            { key: 'price', example: '55 Lakh' },
            { key: 'id', example: 'INV-12345' },
        ],
    },

    rp_reopen_session: {
        name: 'rp_reopen_session_v2',
        category: 'MARKETING',
        language: 'en',
        body: 'Hi {{1}}! This is Panditji from Realty Pandit. We have an update for you regarding your property {{2}}. Reply to this message to continue our conversation.',
        params: [
            { key: 'name', example: 'Amit' },
            { key: 'context', example: 'search' },
        ],
        buttons: ['Reply'],
        footer: 'Reply STOP to opt out',
    },

    // ═══════════════════════════════════════════════════════════════
    // PHASE 7: DEAL MANAGEMENT TEMPLATES (6)
    // ═══════════════════════════════════════════════════════════════

    rp_deal_created: {
        name: 'rp_deal_created',
        category: 'UTILITY',
        language: 'en',
        body: 'New deal created! Customer {{1}} is looking for {{2}} in {{3}}. Budget: {{4}}. You have been assigned as coordinator. Log in to manage this deal.',
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
        body: 'Great news! A {{1}} in {{2}} has been matched to your deal. Price: {{3}}. Your coordinator {{4}} will schedule a visit soon.',
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
        body: 'Deal update: Your {{1}} deal in {{2}} has moved to "{{3}}". {{4}} Contact your coordinator for details.',
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
        body: 'New query on deal for {{1}} in {{2}}: "{{3}}". Please respond at your earliest. Log in to answer.',
        params: [
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'subject', example: 'When is the property available?' },
        ],
        footer: 'Realty Pandit',
    },

    rp_deal_query_answered: {
        name: 'rp_deal_query_answered',
        category: 'UTILITY',
        language: 'en',
        body: 'Your query "{{1}}" on the {{2}} deal has been answered: "{{3}}". Log in to see full details.',
        params: [
            { key: 'subject', example: 'When is the property available?' },
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'answer_preview', example: 'Property available from next month.' },
        ],
        footer: 'Realty Pandit',
    },

    rp_deal_closed_lost: {
        name: 'rp_deal_closed_lost',
        category: 'UTILITY',
        language: 'en',
        body: 'Deal update: The {{1}} deal in {{2}} has been closed. Reason: {{3}}. Thank you for your interest. Panditji will keep looking for better options!',
        params: [
            { key: 'property_type', example: '2BHK Flat' },
            { key: 'location', example: 'Sector 150 Noida' },
            { key: 'reason', example: 'Budget mismatch' },
        ],
        footer: 'Realty Pandit',
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
): TemplatePayload {
    const template = TEMPLATE_REGISTRY[templateName];
    if (!template) {
        throw new Error(`WhatsApp template "${templateName}" not found in registry`);
    }

    const components: any[] = [];

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
