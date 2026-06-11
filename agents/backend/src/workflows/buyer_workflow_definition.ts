/**
 * Buyer Lead Workflow Step Definitions — Simplified Smart Flow
 *
 * Designed for MINIMUM questions before showing properties.
 * WhatsApp flow: 5 steps max (self/dealer → intent+category → BHK → location → budget)
 * Website/Admin: Can show all fields for manual entry.
 *
 * Rules:
 * - Area, amenities, property sub-type: SKIPPED on WhatsApp (asked later if needed)
 * - BHK: Only for residential (flat/house/builder_floor/builder_flat)
 * - Location: Prefers pin share on WhatsApp, text fallback
 * - Each answer saved to contact record IMMEDIATELY (real-time admin panel updates)
 * - AI reads history — never re-asks what's already known
 * - External leads only — internal team-created leads skip this flow entirely
 */

import { WorkflowStep } from './workflow_types';

export const BUYER_WORKFLOW_STEPS: WorkflowStep[] = [

    // ═══════════════════════════════════════
    // GROUP 1: CONTACT (auto-captured on WhatsApp)
    // ═══════════════════════════════════════
    {
        id: 'buyer_phone',
        group: 'contact',
        question: 'What is your phone number?',
        question_hi: 'Aapka phone number kya hai?',
        input_type: 'phone',
        field: 'buyer_phone',
        required: true,
        placeholder: '9876543210',
        validation: { pattern: '^[6-9]\\d{9}$', message: 'Enter valid 10-digit mobile number' },
        skip_when: [
            { field: '_source', operator: 'equals', value: 'whatsapp' },
        ],
        whatsapp_type: 'text',
    },
    {
        id: 'buyer_name',
        group: 'contact',
        question: 'What is your name?',
        question_hi: 'Aapka naam kya hai?',
        input_type: 'text',
        field: 'buyer_name',
        required: false,
        placeholder: 'e.g., Rahul Sharma',
        whatsapp_type: 'text',
    },

    // ═══════════════════════════════════════
    // STEP 1: SELF OR DEALER? (WhatsApp: 2 buttons)
    // ═══════════════════════════════════════
    {
        id: 'buyer_user_type',
        group: 'qualification',
        question: 'Are you looking for yourself or are you a dealer/agent?',
        question_hi: 'Aap apne liye dhundh rahe hain ya dealer/agent hain?',
        input_type: 'radio',
        field: 'buyer_user_type',
        required: true,
        options_source: 'static',
        static_options: [
            { value: 'self', label: 'For Myself', label_hi: 'Apne liye' },
            { value: 'agent', label: "I'm a Dealer", label_hi: 'Dealer/Agent hoon' },
        ],
        whatsapp_type: 'buttons',
        // Save to contact: self → BUYER, agent → PARTNER_AGENT
        save_to_contact: { field: 'contact_type', mapping: { self: 'BUYER', agent: 'PARTNER_AGENT' } },
    },

    // ═══════════════════════════════════════
    // STEP 2: INTENT + CATEGORY COMBINED (WhatsApp: 4 buttons or list)
    // ═══════════════════════════════════════
    {
        id: 'buyer_intent_category',
        group: 'qualification',
        question: 'What are you looking for?',
        question_hi: 'Aapko kya chahiye?',
        input_type: 'radio',
        field: 'buyer_intent_category',
        required: true,
        options_source: 'static',
        static_options: [
            { value: 'buy_residential', label: 'Buy Residential', label_hi: 'Residential kharidna' },
            { value: 'rent_residential', label: 'Rent Residential', label_hi: 'Residential kiraya' },
            { value: 'buy_commercial', label: 'Buy Commercial', label_hi: 'Commercial kharidna' },
            { value: 'rent_commercial', label: 'Rent Commercial', label_hi: 'Commercial kiraya' },
        ],
        whatsapp_type: 'list',
        // Save splits into two contact fields
        save_to_contact: {
            split: true,
            mappings: {
                buy_residential: { intent: 'buy', demand_main_category: 'residential' },
                rent_residential: { intent: 'rent', demand_main_category: 'residential' },
                buy_commercial: { intent: 'buy', demand_main_category: 'commercial' },
                rent_commercial: { intent: 'rent', demand_main_category: 'commercial' },
            },
        },
    },

    // ═══════════════════════════════════════
    // STEP 3: BHK (Only for residential, WhatsApp: list)
    // ═══════════════════════════════════════
    {
        id: 'buyer_bhk',
        group: 'qualification',
        question: 'How many rooms (BHK) do you need?',
        question_hi: 'Kitne BHK chahiye?',
        input_type: 'radio',
        field: 'buyer_bhk',
        required: true,
        options_source: 'static',
        static_options: [
            { value: '1', label: '1 BHK' },
            { value: '2', label: '2 BHK' },
            { value: '3', label: '3 BHK' },
            { value: '4', label: '4 BHK' },
            { value: '5', label: '5+ BHK' },
        ],
        show_when: [
            { field: 'buyer_intent_category', operator: 'in', value: ['buy_residential', 'rent_residential'] },
        ],
        whatsapp_type: 'list',
        save_to_contact: { field: 'demand_bhk' },
    },

    // ═══════════════════════════════════════
    // STEP 4: LOCATION (WhatsApp: location pin preferred, text fallback)
    // ═══════════════════════════════════════
    {
        id: 'buyer_location',
        group: 'qualification',
        question: 'Where are you looking for the property?\n\n📍 Share your location or type the area name.',
        question_hi: 'Property kahan chahiye?\n\n📍 Location share karo ya area ka naam likho.',
        input_type: 'text', // Also accepts WhatsApp location messages
        field: 'buyer_location',
        required: true,
        placeholder: 'e.g., Noida Sector 75, Gurgaon, Dwarka',
        whatsapp_type: 'text', // Handles both text and location pin in webhook processor
        accepts_location_pin: true, // Custom flag for WhatsApp adapter
        save_to_contact: { field: 'preferred_location' },
    },

    // ═══════════════════════════════════════
    // STEP 5: BUDGET (WhatsApp: text input)
    // ═══════════════════════════════════════
    {
        id: 'buyer_budget',
        group: 'qualification',
        question: 'What is your budget?',
        question_hi: 'Aapka budget kitna hai?\n\nJaise: 50 lakh, 1 crore, 20000/month',
        input_type: 'text',
        field: 'buyer_budget',
        required: true,
        placeholder: 'e.g., 50 lakh, 1-2 crore, 20000/month',
        whatsapp_type: 'text',
        save_to_contact: { field: 'budget_max' },
    },

    // ═══════════════════════════════════════
    // OPTIONAL STEPS (shown on website/admin, skipped on WhatsApp)
    // Can be asked later if user refines search
    // ═══════════════════════════════════════

    // Residential property sub-type
    {
        id: 'buyer_property_type',
        group: 'optional',
        question: 'What type of residential property?',
        question_hi: 'Kaunsi residential property chahiye?',
        input_type: 'radio',
        field: 'buyer_property_type',
        required: false,
        options_source: 'static',
        static_options: [
            { value: 'flat', label: 'Flat / Apartment', label_hi: 'Flat / Apartment' },
            { value: 'house', label: 'House / Villa / Kothi', label_hi: 'Makan / Villa / Kothi' },
            { value: 'plot', label: 'Plot / Land', label_hi: 'Plot / Zameen' },
            { value: 'builder_floor', label: 'Builder Floor', label_hi: 'Builder Floor' },
            { value: 'builder_flat', label: 'Builder Flat', label_hi: 'Builder Flat' },
        ],
        show_when: [
            { field: 'buyer_intent_category', operator: 'in', value: ['buy_residential', 'rent_residential'] },
        ],
        skip_when: [
            { field: '_source', operator: 'equals', value: 'whatsapp' },
        ],
        whatsapp_type: 'list',
    },

    // Commercial property sub-type
    {
        id: 'buyer_commercial_type',
        group: 'optional',
        question: 'What type of commercial property?',
        question_hi: 'Kaunsi commercial property chahiye?',
        input_type: 'radio',
        field: 'buyer_property_type',
        required: false,
        options_source: 'static',
        static_options: [
            { value: 'office', label: 'Office Space', label_hi: 'Office' },
            { value: 'shop', label: 'Shop / Showroom', label_hi: 'Dukan / Showroom' },
            { value: 'warehouse', label: 'Warehouse / Godown', label_hi: 'Godown' },
            { value: 'commercial_plot', label: 'Commercial Plot', label_hi: 'Commercial Plot' },
            { value: 'coworking', label: 'Co-working Space', label_hi: 'Co-working' },
        ],
        show_when: [
            { field: 'buyer_intent_category', operator: 'in', value: ['buy_commercial', 'rent_commercial'] },
        ],
        skip_when: [
            { field: '_source', operator: 'equals', value: 'whatsapp' },
        ],
        whatsapp_type: 'list',
    },

    // Area requirement
    {
        id: 'buyer_area',
        group: 'optional',
        question: 'What area (in sqft) are you looking for?',
        question_hi: 'Aapko kitne sqft ka property chahiye?',
        input_type: 'text',
        field: 'buyer_area',
        required: false,
        placeholder: 'e.g., 800-1200 sqft, 1000 sqft',
        skip_when: [
            { field: '_source', operator: 'equals', value: 'whatsapp' },
        ],
        whatsapp_type: 'text',
    },

    // Amenities
    {
        id: 'buyer_amenities',
        group: 'optional',
        question: 'Which amenities are important to you?',
        question_hi: 'Kaunsi suvidhaayein zaroori hain?',
        input_type: 'multi_select',
        field: 'buyer_amenities',
        required: false,
        static_options: [
            { value: 'parking', label: 'Parking' },
            { value: 'lift', label: 'Lift' },
            { value: 'gym', label: 'Gym' },
            { value: 'security', label: 'Security' },
            { value: 'power_backup', label: 'Power Backup' },
            { value: 'garden', label: 'Garden' },
            { value: 'pool', label: 'Swimming Pool' },
        ],
        options_source: 'static',
        skip_when: [
            { field: '_source', operator: 'equals', value: 'whatsapp' },
        ],
        whatsapp_type: 'list',
    },
];

export const BUYER_WORKFLOW_GROUPS = [
    { id: 'contact', label: 'Contact Info', label_hi: 'Contact' },
    { id: 'qualification', label: 'Quick Qualification', label_hi: 'Qualification' },
    { id: 'optional', label: 'Additional Details', label_hi: 'Additional Details' },
];
