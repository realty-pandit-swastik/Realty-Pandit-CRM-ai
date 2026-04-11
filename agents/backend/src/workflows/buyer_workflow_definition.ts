/**
 * Buyer Lead Workflow Step Definitions
 *
 * Defines the structured requirement capture flow for buyers/tenants.
 * Used across all platforms: Website (Panditji chatbot), Admin panel,
 * Agent/Dealer portal, and WhatsApp.
 *
 * 9 steps across 6 groups:
 *   contact → intent → classification → specs → location → budget
 */

import { WorkflowStep } from './workflow_types';

export const BUYER_WORKFLOW_STEPS: WorkflowStep[] = [

    // ═══════════════════════════════════════
    // GROUP 1: CONTACT (capture early for lead recovery)
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
        // Skip on WhatsApp (phone auto-known from sender)
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
    // GROUP 2: INTENT
    // ═══════════════════════════════════════
    {
        id: 'buyer_intent',
        group: 'intent',
        question: 'Are you looking to buy or rent/lease?',
        question_hi: 'Aap kharidna chahte hain ya kiraya/lease par lena chahte hain?',
        input_type: 'radio',
        field: 'buyer_intent',
        required: true,
        options_source: 'static',
        static_options: [
            { value: 'buy', label: 'Purchase (Buy)', label_hi: 'Kharidna (Buy)' },
            { value: 'rent_lease', label: 'Rent / Lease', label_hi: 'Kiraya / Lease' },
        ],
        whatsapp_type: 'buttons',
    },

    // ═══════════════════════════════════════
    // GROUP 3: CLASSIFICATION
    // ═══════════════════════════════════════
    {
        id: 'buyer_main_category',
        group: 'classification',
        question: 'What category of property are you looking for?',
        question_hi: 'Aap kis category ki property dhundh rahe hain?',
        input_type: 'radio',
        field: 'buyer_main_category',
        required: true,
        options_source: 'static',
        static_options: [
            { value: 'residential', label: 'Residential', label_hi: 'Residential' },
            { value: 'commercial', label: 'Commercial', label_hi: 'Commercial' },
        ],
        whatsapp_type: 'buttons',
    },

    // Residential property type
    {
        id: 'buyer_property_type',
        group: 'classification',
        question: 'What type of residential property?',
        question_hi: 'Kaunsi residential property chahiye?',
        input_type: 'radio',
        field: 'buyer_property_type',
        required: true,
        options_source: 'static',
        static_options: [
            { value: 'flat', label: 'Flat / Apartment', label_hi: 'Flat / Apartment' },
            { value: 'house', label: 'House / Villa / Kothi', label_hi: 'Makan / Villa / Kothi' },
            { value: 'plot', label: 'Plot / Land', label_hi: 'Plot / Zameen' },
            { value: 'builder_floor', label: 'Builder Floor', label_hi: 'Builder Floor' },
            { value: 'builder_flat', label: 'Builder Flat', label_hi: 'Builder Flat' },
        ],
        show_when: [
            { field: 'buyer_main_category', operator: 'equals', value: 'residential' },
        ],
        whatsapp_type: 'list',
    },

    // Commercial property type / use case
    {
        id: 'buyer_commercial_type',
        group: 'classification',
        question: 'What type of commercial property are you looking for?',
        question_hi: 'Kaunsi commercial property chahiye?',
        input_type: 'radio',
        field: 'buyer_property_type',  // Same field — only one of these two steps runs
        required: true,
        options_source: 'static',
        static_options: [
            { value: 'office', label: 'Office Space', label_hi: 'Office' },
            { value: 'shop', label: 'Shop / Showroom', label_hi: 'Dukan / Showroom' },
            { value: 'warehouse', label: 'Warehouse / Godown', label_hi: 'Godown' },
            { value: 'commercial_plot', label: 'Commercial Plot', label_hi: 'Commercial Plot' },
            { value: 'coworking', label: 'Co-working Space', label_hi: 'Co-working' },
        ],
        show_when: [
            { field: 'buyer_main_category', operator: 'equals', value: 'commercial' },
        ],
        whatsapp_type: 'list',
    },

    // ═══════════════════════════════════════
    // GROUP 4: SPECS (BHK — conditional)
    // ═══════════════════════════════════════
    {
        id: 'buyer_bhk',
        group: 'specs',
        question: 'How many BHK do you need?',
        question_hi: 'Kitne BHK chahiye?',
        input_type: 'radio',
        field: 'buyer_bhk',
        required: false,
        options_source: 'static',
        static_options: [
            { value: '1', label: '1 BHK' },
            { value: '2', label: '2 BHK' },
            { value: '3', label: '3 BHK' },
            { value: '4', label: '4 BHK' },
            { value: '5', label: '5+ BHK' },
        ],
        // Only show for residential types that have BHK
        show_when: [
            { field: 'buyer_main_category', operator: 'equals', value: 'residential' },
            { field: 'buyer_property_type', operator: 'in', value: ['flat', 'house', 'builder_floor', 'builder_flat'] },
        ],
        whatsapp_type: 'list',
    },

    // AREA REQUIREMENT
    {
        id: 'buyer_area',
        group: 'specs',
        question: 'What area (in sqft) are you looking for?',
        question_hi: 'Aapko kitne sqft ka property chahiye?',
        input_type: 'text',
        field: 'buyer_area',
        required: false,
        placeholder: 'e.g., 800-1200 sqft, 1000 sqft',
        whatsapp_type: 'text',
    },

    // AMENITIES PREFERENCE
    {
        id: 'buyer_amenities',
        group: 'specs',
        question: 'Which amenities are important to you? (Select all that apply)',
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
        whatsapp_type: 'list',
    },

    // ═══════════════════════════════════════
    // GROUP 5: LOCATION
    // ═══════════════════════════════════════
    {
        id: 'buyer_location',
        group: 'location',
        question: 'Which area or city are you looking in?',
        question_hi: 'Kaunse area ya sheher mein dhundh rahe hain?',
        input_type: 'text',
        field: 'buyer_location',
        required: true,
        placeholder: 'e.g., Noida Sector 75, Gurgaon, Vaishali',
        whatsapp_type: 'text',
    },

    // ═══════════════════════════════════════
    // GROUP 6: BUDGET
    // ═══════════════════════════════════════
    {
        id: 'buyer_budget',
        group: 'budget',
        question: 'What is your budget range?',
        question_hi: 'Aapka budget kitna hai? (e.g., 50 lakh, 1 crore, 20000/month)',
        input_type: 'text',
        field: 'buyer_budget',
        required: true,
        placeholder: 'e.g., 50 lakh, 1-2 crore, 20000/month',
        whatsapp_type: 'text',
    },
];

export const BUYER_WORKFLOW_GROUPS = [
    { id: 'contact', label: 'Contact Info', label_hi: 'Contact' },
    { id: 'intent', label: 'Intent', label_hi: 'Intent' },
    { id: 'classification', label: 'Property Type', label_hi: 'Property Type' },
    { id: 'specs', label: 'Specifications', label_hi: 'Specifications' },
    { id: 'location', label: 'Location', label_hi: 'Location' },
    { id: 'budget', label: 'Budget', label_hi: 'Budget' },
];
