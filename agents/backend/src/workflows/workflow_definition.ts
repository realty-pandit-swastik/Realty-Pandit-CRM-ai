/**
 * Unified Inventory Workflow - Step Definitions (v3 - Shortened Flow)
 *
 * Key changes from v2:
 * - Shortened to 10 stages for lead retention (capture minimum viable listing)
 * - Platform-specific identity detection (Admin/Web/WhatsApp)
 * - Specs, pricing, features moved to post-save enrichment
 * - Media upload is optional and skippable
 * - Human-readable display ID (RP-DEL-RES-20431)
 * - Same definition powers Admin, Website, WhatsApp, and Voice
 *
 * Mandatory Stages: Identity → Contact → Intent → Property Type → Configuration → Address → Key Holder → Pricing → Area → Construction → Media (skip OK) → Confirm
 * Post-save Enrichment: Amenities, Area, Specs, Description, Documents, Ownership details
 */

import { WorkflowStep } from './workflow_types';

// ================================================================
// MAIN WORKFLOW STEPS (Stages 1-12 — Mandatory for inventory creation)
// ================================================================

export const INVENTORY_WORKFLOW_STEPS: WorkflowStep[] = [

    // ================================================================
    // STAGE 1: IDENTITY DETECTION (platform-specific)
    // ================================================================

    {
        id: 'user_role',
        group: 'identity',
        question: 'Who are you?',
        question_hi: 'Aap kaun hain?',
        input_type: 'radio',
        field: 'user_role',
        required: true,
        // Default options (used when platform_options doesn't match)
        static_options: [
            { value: 'PROPERTY_OWNER', label: 'Owner', label_hi: 'Malik' },
            { value: 'AGENT_DEALER', label: 'Broker / Agent', label_hi: 'Broker / Agent' },
            { value: 'BUILDER', label: 'Builder', label_hi: 'Builder' },
        ],
        options_source: 'static',
        // Platform-specific question text
        platform_question: {
            admin: 'Reference for this inventory?',
            web: 'Who are you?',
            whatsapp: 'Where did you get this inventory?',
        },
        platform_question_hi: {
            admin: 'Is inventory ka reference kya hai?',
            web: 'Aap kaun hain?',
            whatsapp: 'Yeh inventory kahan se aayi hai?',
        },
        // Platform-specific options
        platform_options: {
            admin: [
                { value: 'PROPERTY_OWNER', label: 'Direct Owner', label_hi: 'Direct Owner' },
                { value: 'AGENT_DEALER', label: 'Agent / Dealer', label_hi: 'Agent / Dealer' },
                { value: 'FINANCER', label: 'Financer', label_hi: 'Financer' },
            ],
            web: [
                { value: 'PROPERTY_OWNER', label: 'Owner', label_hi: 'Malik' },
                { value: 'AGENT_DEALER', label: 'Broker / Agent', label_hi: 'Broker / Agent' },
                { value: 'BUILDER', label: 'Builder', label_hi: 'Builder' },
            ],
            whatsapp: [
                { value: 'PROPERTY_OWNER', label: 'Owner', label_hi: 'Malik' },
                { value: 'AGENT_DEALER', label: 'Dealer / Agent', label_hi: 'Dealer / Agent' },
                { value: 'BUILDER', label: 'Builder', label_hi: 'Builder' },
                { value: 'FINANCER', label: 'Financer', label_hi: 'Financer' },
            ],
        },
        whatsapp_type: 'buttons',
    },

    // ================================================================
    // STAGE 2: CONTACT (Name + Phone — mandatory)
    // ================================================================

    {
        id: 'uploader_phone',
        group: 'contact',
        question: 'What is your phone number?',
        question_hi: 'Aapka phone number kya hai?',
        platform_question: {
            admin: 'Share their contact number?',
            web: 'What is your phone number?',
            whatsapp: 'Share the contact number of the owner/dealer',
        },
        platform_question_hi: {
            admin: 'Unka contact number share karein?',
            web: 'Aapka phone number kya hai?',
            whatsapp: 'Owner/dealer ka contact number share karein',
        },
        input_type: 'phone',
        field: 'uploader_phone',
        required: true,
        placeholder: '9876543210',
        help_text: 'Enter 10-digit mobile number',
        help_text_hi: '10 digit mobile number enter karein',
        validation: {
            pattern: '^[6-9]\\d{9}$',
            message: 'Enter valid 10-digit mobile number (should start with 6-9)',
        },
        whatsapp_type: 'text',
    },

    // ================================================================
    // STAGE 3: PROPERTY INTENT (Sale or Rent/Lease)
    {
        id: 'uploader_name',
        group: 'contact',
        question: 'What is your name?',
        question_hi: 'Aapka naam kya hai?',
        input_type: 'text',
        field: 'uploader_name',
        required: true,
        placeholder: 'Enter your full name',
        platform_question: {
            admin: 'Share name?',
            web: 'What is your name?',
            whatsapp: 'Name of the contact?',
        },
        platform_question_hi: {
            admin: 'Naam share karein?',
            web: 'Aapka naam kya hai?',
            whatsapp: 'Contact ka naam?',
        },
        // Skip if name was auto-resolved from phone lookup
        skip_when: [
            { field: 'uploader_name', operator: 'exists' },
        ],
        whatsapp_type: 'text',
    },

    // ================================================================
    // STAGE 3: PROPERTY INTENT (Sale or Rent/Lease)
    // ================================================================

    {
        id: 'intent',
        group: 'intent',
        question: 'Sale or Rent / Lease?',
        question_hi: 'Bechna ya Kiraye/Lease par dena?',
        input_type: 'radio',
        field: 'intent',
        required: true,
        static_options: [
            { value: 'sell', label: 'Sale', label_hi: 'Bechna' },
            { value: 'rent_lease', label: 'Rent / Lease', label_hi: 'Kiraye/Lease par dena' },
        ],
        options_source: 'static',
        whatsapp_type: 'buttons',
    },

    // ================================================================
    // STAGE 4: PROPERTY TYPE (Residential / Commercial / Agricultural)
    // ================================================================

    {
        id: 'main_category',
        group: 'property_type',
        question: 'Type of property?',
        question_hi: 'Property ka type?',
        input_type: 'radio',
        field: 'main_category',
        required: true,
        static_options: [
            { value: 'residential', label: 'Residential', label_hi: 'Residential' },
            { value: 'commercial', label: 'Commercial', label_hi: 'Commercial' },
            { value: 'agricultural', label: 'Agricultural Land', label_hi: 'Agricultural Land' },
        ],
        options_source: 'static',
        whatsapp_type: 'buttons',
    },

    // ================================================================
    // STAGE 5: PROPERTY CONFIGURATION (sub-type + BHK)
    // ================================================================

    {
        id: 'flat_property_type_id',
        group: 'config',
        question: 'What type of property?',
        question_hi: 'Property ka type kya hai?',
        input_type: 'dropdown',
        field: 'flat_property_type_id',
        required: true,
        options_source: 'filtered',
        dynamic_endpoint: '/public/master/flat-property-types',
        filter_by: 'main_category',
        // Skip for agricultural (only 1 type, auto-selected)
        skip_when: [
            { field: 'main_category', operator: 'equals', value: 'agricultural' },
        ],
        whatsapp_type: 'list',
    },

    {
        id: 'configuration_id',
        group: 'config',
        question: 'What is the configuration? (e.g., 2 BHK)',
        question_hi: 'Configuration kya hai? (e.g., 2 BHK)',
        input_type: 'dropdown',
        field: 'configuration_id',
        required: false,
        options_source: 'dynamic',
        dynamic_endpoint: '/public/master/configurations',
        // Only show BHK selection when property type requires it (Land/Plot skip BHK)
        show_when: [
            { field: 'flat_property_type_id', operator: 'from_flat_type_rules', validation_rule_key: 'bhk_required' },
        ],
        whatsapp_type: 'list',
    },

    // ================================================================
    // STAGE 6: ADDRESS (Google Location)
    // ================================================================

    {
        id: 'address_block',
        group: 'address',
        question: 'Property Address',
        question_hi: 'Property ka address bharein',
        input_type: 'address_block',
        field: 'address_block',
        required: true,
        whatsapp_type: 'text',
    },

    // ================================================================
    // STAGE 7: KEY HOLDER
    // ================================================================

    {
        id: 'key_holder_type',
        group: 'keyholder',
        question: 'Who holds the key of the property?',
        question_hi: 'Property ki chaabi kiske paas hai?',
        input_type: 'radio',
        field: 'key_holder_type',
        required: true,
        static_options: [
            { value: 'UPLOADER', label: 'I have the key', label_hi: 'Mere paas hai' },
            { value: 'SOMEONE_ELSE', label: 'Someone else', label_hi: 'Kisi aur ke paas' },
        ],
        options_source: 'static',
        whatsapp_type: 'buttons',
    },

    {
        id: 'key_holder_name',
        group: 'keyholder',
        question: 'Key holder\'s name',
        question_hi: 'Chaabi wale ka naam?',
        input_type: 'text',
        field: 'key_holder_name',
        placeholder: 'Enter name',
        required: true,
        show_when: [
            { field: 'key_holder_type', operator: 'equals', value: 'SOMEONE_ELSE' },
        ],
        whatsapp_type: 'text',
    },

    {
        id: 'key_holder_phone',
        group: 'keyholder',
        question: 'Key holder\'s phone number',
        question_hi: 'Chaabi wale ka phone number?',
        input_type: 'phone',
        field: 'key_holder_phone',
        placeholder: '9876543210',
        required: true,
        show_when: [
            { field: 'key_holder_type', operator: 'equals', value: 'SOMEONE_ELSE' },
        ],
        validation: { pattern: '^[6-9]\\d{9}$', message: 'Enter valid 10-digit mobile number' },
        whatsapp_type: 'text',
    },

    // ================================================================
    // STAGE 8: ASKING PRICE
    // ================================================================

    {
        id: 'asking_price',
        group: 'pricing',
        question: 'What is the asking price?',
        question_hi: 'Asking price kya hai?',
        input_type: 'number',
        field: 'customer_price',
        required: true,
        placeholder: 'e.g., 10000000',
        help_text: 'Enter numeric value — display will auto-format (1 Cr, 58 L, 67 K)',
        help_text_hi: 'Number mein enter karein — display auto-format hoga (1 Cr, 58 L, 67 K)',
        platform_question: {
            admin: 'Asking Price?',
            web: 'What is the asking price?',
        },
        platform_question_hi: {
            admin: 'Asking price kya hai?',
            web: 'Kitni price hai?',
        },
        // Dynamic question based on intent: Sale → "Price", Rent → "Monthly Rent"
        // Handled via platform_question but the engine resolves the base question
        validation: { min: 1, message: 'Price must be greater than 0' },
        whatsapp_type: 'text',
    },

    // ================================================================
    // STAGE 9: AREA OF THE PROPERTY
    // ================================================================

    {
        id: 'property_area',
        group: 'area',
        question: 'Area of the property?',
        question_hi: 'Property ka area kitna hai?',
        input_type: 'compound',
        field: 'area',
        secondary_field: 'area_unit',
        secondary_options: [
            { value: 'sqft', label: 'Sq.ft' },
            { value: 'sqyd', label: 'Sq.yd' },
            { value: 'sqm', label: 'Sq.m' },
            { value: 'bigha', label: 'Bigha' },
            { value: 'acre', label: 'Acre' },
            { value: 'hectare', label: 'Hectare' },
        ],
        placeholder: 'e.g., 1200',
        required: true,
        help_text: 'Enter area with unit (e.g., 1200 sqft, 120 sqm, 12 bigha)',
        help_text_hi: 'Area aur unit enter karein (e.g., 1200 sqft, 120 sqm, 12 bigha)',
        validation: { min: 1, max: 1000000, message: 'Please enter a valid area' },
        whatsapp_type: 'text',
    },

    // ================================================================
    // STAGE 10: CONSTRUCTION STATUS / AGE
    // ================================================================

    {
        id: 'construction_status',
        group: 'construction',
        question: 'Construction Status: Age of Construction?',
        question_hi: 'Construction status: Kitne saal purani hai?',
        input_type: 'radio',
        field: 'property_age',
        required: true,
        static_options: [
            { value: 'under_construction', label: 'Under Construction', label_hi: 'Nirman jaari' },
            { value: 'new_construction', label: 'New Construction (< 1 year)', label_hi: 'Nayi (< 1 saal)' },
            { value: '1-3_years', label: '1-3 Years', label_hi: '1-3 saal' },
            { value: '3-5_years', label: '3-5 Years', label_hi: '3-5 saal' },
            { value: '5-10_years', label: '5-10 Years', label_hi: '5-10 saal' },
            { value: '10+_years', label: '10+ Years', label_hi: '10+ saal' },
        ],
        options_source: 'static',
        // Skip for agricultural land (no construction)
        skip_when: [
            { field: 'main_category', operator: 'equals', value: 'agricultural' },
        ],
        whatsapp_type: 'list',
    },

    // ================================================================
    // STAGE 11: MEDIA UPLOAD (Optional — skippable)
    // ================================================================

    {
        id: 'photos',
        group: 'media',
        question: 'Upload property photos (or skip to add later)',
        question_hi: 'Property ki photos bhejein (ya baad mein add karein)',
        input_type: 'media_upload',
        field: 'photos',
        required: false,
        whatsapp_type: 'media',
    },

    {
        id: 'videos',
        group: 'media',
        question: 'Upload property videos (optional)',
        question_hi: 'Property ki videos bhejein (optional)',
        input_type: 'video_upload',
        field: 'videos',
        required: false,
        whatsapp_type: 'media',
    },

    // ================================================================
    // STAGE 12: CONFIRM & CREATE
    // ================================================================

    {
        id: 'confirm_create',
        group: 'confirm',
        question: 'Review and save inventory',
        question_hi: 'Review karein aur inventory save karein',
        input_type: 'confirm',
        field: '_confirm',
        required: true,
        whatsapp_type: 'buttons',
    },
];

// ================================================================
// WORKFLOW GROUPS (Progress bar — 12 stages)
// ================================================================

export const WORKFLOW_GROUPS = [
    { id: 'identity', label: 'Identity', label_hi: 'Pehchaan', icon: '1' },
    { id: 'contact', label: 'Contact', label_hi: 'Contact', icon: '2' },
    { id: 'intent', label: 'Intent', label_hi: 'Intent', icon: '3' },
    { id: 'property_type', label: 'Property Type', label_hi: 'Property Type', icon: '4' },
    { id: 'config', label: 'Configuration', label_hi: 'Configuration', icon: '5' },
    { id: 'address', label: 'Address', label_hi: 'Address', icon: '6' },
    { id: 'keyholder', label: 'Key Holder', label_hi: 'Chaabi', icon: '7' },
    { id: 'pricing', label: 'Pricing', label_hi: 'Price', icon: '8' },
    { id: 'area', label: 'Area', label_hi: 'Area', icon: '9' },
    { id: 'construction', label: 'Construction', label_hi: 'Construction', icon: '10' },
    { id: 'media', label: 'Media', label_hi: 'Photos/Videos', icon: '11' },
    { id: 'confirm', label: 'Confirm', label_hi: 'Confirm', icon: '12' },
];

// ================================================================
// ENRICHMENT STEPS (Post-save optional details — Stage 10)
// ================================================================

export const ENRICHMENT_STEPS: WorkflowStep[] = [

    // --- Amenities ---
    {
        id: 'features',
        group: 'enrichment_amenities',
        question: 'Select available amenities',
        question_hi: 'Kaunsi amenities available hain?',
        input_type: 'multi_select',
        field: 'features',
        required: false,
        static_options: [
            { value: 'parking', label: 'Parking' },
            { value: 'lift', label: 'Lift' },
            { value: 'garden', label: 'Garden' },
            { value: 'pool', label: 'Swimming Pool' },
            { value: 'gym', label: 'Gym' },
            { value: 'security', label: 'Security' },
            { value: 'power_backup', label: 'Power Backup' },
            { value: 'water_supply', label: 'Water Supply' },
            { value: 'club_house', label: 'Club House' },
            { value: 'intercom', label: 'Intercom' },
            { value: 'gas_pipeline', label: 'Gas Pipeline' },
            { value: 'park', label: 'Park' },
        ],
        options_source: 'static',
        whatsapp_type: 'text',
    },

    // --- Pricing ---
    {
        id: 'customer_price',
        group: 'enrichment_pricing',
        question: 'What is the expected price (in INR)?',
        question_hi: 'Expected price kitni hai? (INR mein)',
        input_type: 'number',
        field: 'customer_price',
        placeholder: 'e.g., 5500000',
        required: false,
        validation: { min: 1, message: 'Price must be greater than 0' },
        whatsapp_type: 'text',
    },

    {
        id: 'price_negotiable',
        group: 'enrichment_pricing',
        question: 'Is the price negotiable?',
        question_hi: 'Kya price negotiate ho sakti hai?',
        input_type: 'radio',
        field: 'price_negotiable',
        required: false,
        static_options: [
            { value: 'yes', label: 'Yes', label_hi: 'Haan' },
            { value: 'no', label: 'No', label_hi: 'Nahi' },
        ],
        options_source: 'static',
        whatsapp_type: 'buttons',
    },

    {
        id: 'display_price',
        group: 'enrichment_pricing',
        question: 'What price to display on website? (in INR)',
        question_hi: 'Website par kaunsi price dikhani hai? (INR mein)',
        input_type: 'number',
        field: 'display_price',
        placeholder: 'Leave blank to use expected price',
        required: false,
        validation: { min: 1, message: 'Price must be greater than 0' },
        show_when: [
            { field: '_source', operator: 'in', value: ['admin'] },
        ],
        whatsapp_type: 'text',
    },

    // --- Area ---
    {
        id: 'area',
        group: 'enrichment_area',
        question: 'What is the built-up area?',
        question_hi: 'Built-up area kitna hai?',
        input_type: 'compound',
        field: 'area',
        secondary_field: 'area_unit',
        secondary_options: [
            { value: 'sqft', label: 'Sq.ft' },
            { value: 'sqyd', label: 'Sq.yd' },
            { value: 'sqm', label: 'Sq.m' },
        ],
        placeholder: 'e.g., 1200',
        required: false,
        validation: { min: 1, max: 1000000, message: 'Please enter a valid area' },
        whatsapp_type: 'text',
    },

    {
        id: 'carpet_area',
        group: 'enrichment_area',
        question: 'What is the carpet area?',
        question_hi: 'Carpet area kitna hai?',
        input_type: 'compound',
        field: 'carpet_area',
        secondary_field: 'carpet_area_unit',
        secondary_options: [
            { value: 'sqft', label: 'Sq.ft' },
            { value: 'sqyd', label: 'Sq.yd' },
            { value: 'sqm', label: 'Sq.m' },
        ],
        placeholder: 'e.g., 900',
        required: false,
        validation: { min: 1, max: 1000000, message: 'Please enter a valid area' },
        whatsapp_type: 'text',
    },

    // --- Property Details ---
    {
        id: 'bathrooms',
        group: 'enrichment_details',
        question: 'How many bathrooms?',
        question_hi: 'Kitne bathrooms hain?',
        input_type: 'number',
        field: 'bathrooms',
        placeholder: 'e.g., 2',
        required: false,
        validation: { min: 1, max: 20, message: 'Bathrooms must be between 1 and 20' },
        show_when: [
            { field: 'flat_property_type_id', operator: 'from_flat_type_rules', validation_rule_key: 'bhk_required' },
        ],
        whatsapp_type: 'text',
    },

    {
        id: 'total_floors',
        group: 'enrichment_details',
        question: 'How many floors does the building have?',
        question_hi: 'Building mein total kitne floors hain?',
        input_type: 'number',
        field: 'total_floors',
        placeholder: 'e.g., 12',
        required: false,
        validation: { min: 1, max: 200, message: 'Total floors must be between 1 and 200' },
        show_when: [
            { field: 'flat_property_type_id', operator: 'from_flat_type_rules', validation_rule_key: 'floor_required' },
        ],
        whatsapp_type: 'text',
    },

    {
        id: 'facing',
        group: 'enrichment_details',
        question: 'Which direction does the property face?',
        question_hi: 'Property ka mukh kis disha mein hai?',
        input_type: 'dropdown',
        field: 'facing',
        required: false,
        static_options: [
            { value: 'north', label: 'North', label_hi: 'Uttar' },
            { value: 'south', label: 'South', label_hi: 'Dakshin' },
            { value: 'east', label: 'East', label_hi: 'Poorv' },
            { value: 'west', label: 'West', label_hi: 'Pashchim' },
            { value: 'north_east', label: 'North-East', label_hi: 'Ishan (NE)' },
            { value: 'north_west', label: 'North-West', label_hi: 'Vayavya (NW)' },
            { value: 'south_east', label: 'South-East', label_hi: 'Agneya (SE)' },
            { value: 'south_west', label: 'South-West', label_hi: 'Nairitya (SW)' },
        ],
        options_source: 'static',
        whatsapp_type: 'list',
    },

    {
        id: 'furnishing',
        group: 'enrichment_details',
        question: 'What is the furnishing status?',
        question_hi: 'Furnishing status kya hai?',
        input_type: 'dropdown',
        field: 'furnishing',
        required: false,
        static_options: [
            { value: 'unfurnished', label: 'Unfurnished', label_hi: 'Khaali' },
            { value: 'semi_furnished', label: 'Semi-Furnished', label_hi: 'Aadha furnished' },
            { value: 'fully_furnished', label: 'Fully Furnished', label_hi: 'Poora furnished' },
        ],
        options_source: 'static',
        skip_when: [
            { field: 'flat_property_type_id', operator: 'from_flat_type_rules', validation_rule_key: 'plot_area_required' },
        ],
        whatsapp_type: 'buttons',
    },

    {
        id: 'property_age',
        group: 'enrichment_details',
        question: 'How old is the property?',
        question_hi: 'Property kitni purani hai?',
        input_type: 'dropdown',
        field: 'property_age',
        required: false,
        static_options: [
            { value: 'new_construction', label: 'New Construction', label_hi: 'Nayi' },
            { value: '1-3_years', label: '1-3 Years', label_hi: '1-3 saal' },
            { value: '3-5_years', label: '3-5 Years', label_hi: '3-5 saal' },
            { value: '5-10_years', label: '5-10 Years', label_hi: '5-10 saal' },
            { value: '10+_years', label: '10+ Years', label_hi: '10+ saal' },
        ],
        options_source: 'static',
        skip_when: [
            { field: 'flat_property_type_id', operator: 'from_flat_type_rules', validation_rule_key: 'plot_area_required' },
        ],
        whatsapp_type: 'list',
    },

    {
        id: 'lift_available',
        group: 'enrichment_details',
        question: 'Is there a lift in the building?',
        question_hi: 'Building mein lift hai?',
        input_type: 'radio',
        field: 'lift_available',
        required: false,
        static_options: [
            { value: 'yes', label: 'Yes', label_hi: 'Haan' },
            { value: 'no', label: 'No', label_hi: 'Nahi' },
        ],
        options_source: 'static',
        show_when: [
            { field: 'flat_property_type_id', operator: 'from_flat_type_rules', validation_rule_key: 'floor_required' },
        ],
        whatsapp_type: 'buttons',
    },

    // --- Description ---
    {
        id: 'description',
        group: 'enrichment_details',
        question: 'Any additional details about the property?',
        question_hi: 'Property ke baare mein kuch aur batana chahein?',
        input_type: 'textarea',
        field: 'description',
        placeholder: 'Describe surroundings, highlights, landmarks...',
        required: false,
        whatsapp_type: 'text',
    },

    // --- Documents ---
    {
        id: 'documents',
        group: 'enrichment_docs',
        question: 'Upload documents (title deed, NOC, layout plan, etc.)',
        question_hi: 'Documents bhejein (title deed, NOC, layout plan)',
        input_type: 'document_upload',
        field: 'documents',
        required: false,
        whatsapp_type: 'media',
    },

    // --- Lead Reference (admin only) ---
    {
        id: 'lead_reference',
        group: 'enrichment_details',
        question: 'How did this lead come in?',
        question_hi: 'Yeh property ki lead kahan se aayi?',
        input_type: 'text',
        field: 'lead_reference',
        placeholder: 'e.g. Agent Rakesh, self-sourced, 99acres',
        required: false,
        show_when: [
            { field: '_source', operator: 'in', value: ['admin'] },
        ],
        whatsapp_type: 'text',
    },

    // --- Ownership Details (moved from mandatory flow) ---
    {
        id: 'ownership_type',
        group: 'enrichment_ownership',
        question: 'Where did you get this inventory from?',
        question_hi: 'Yeh inventory kahan se mili?',
        input_type: 'radio',
        field: 'ownership_type',
        required: false,
        static_options: [
            { value: 'OWNER', label: 'Got directly from Property Owner', label_hi: 'Property malik se seedha mila' },
            { value: 'EXTERNAL_AGENT', label: 'Got from External Agent/Dealer', label_hi: 'External Agent/Dealer se mila' },
            { value: 'AGENT_OWNER', label: 'From Agent who owns the property', label_hi: 'Agent se jo khud malik hai' },
        ],
        options_source: 'static',
        show_when: [
            { field: 'user_role', operator: 'equals', value: 'AGENT_DEALER' },
        ],
        whatsapp_type: 'buttons',
    },

    {
        id: 'owner_self_contact',
        group: 'enrichment_ownership',
        question: 'What is the property owner\'s phone number?',
        question_hi: 'Property owner ka phone number kya hai?',
        input_type: 'phone',
        field: 'owner_self_phone',
        required: false,
        show_when: [
            { field: 'ownership_type', operator: 'equals', value: 'OWNER' },
        ],
        placeholder: '9876543210',
        validation: {
            pattern: '^[6-9]\\d{9}$',
            message: 'Enter valid 10-digit mobile number',
        },
        whatsapp_type: 'text',
    },

    {
        id: 'agent_reference_phone',
        group: 'enrichment_ownership',
        question: 'Phone number of the agent who provided this property',
        question_hi: 'Agent ka phone number jisne yeh property di',
        input_type: 'text',
        field: 'agent_reference_phone',
        placeholder: '9876543210',
        required: false,
        show_when: [
            { field: 'ownership_type', operator: 'equals', value: 'AGENT_OWNER' },
        ],
        validation: {
            pattern: '^[6-9][0-9]{9}$',
            message: 'Enter valid 10-digit mobile number',
        },
        whatsapp_type: 'text',
    },
];

// ================================================================
// ENRICHMENT GROUPS (for post-save UI sections)
// ================================================================

export const ENRICHMENT_GROUPS = [
    { id: 'enrichment_amenities', label: 'Amenities', label_hi: 'Amenities', icon: 'amenities' },
    { id: 'enrichment_pricing', label: 'Pricing', label_hi: 'Price', icon: 'pricing' },
    { id: 'enrichment_area', label: 'Area', label_hi: 'Area', icon: 'area' },
    { id: 'enrichment_details', label: 'Details', label_hi: 'Details', icon: 'details' },
    { id: 'enrichment_docs', label: 'Documents', label_hi: 'Documents', icon: 'docs' },
    { id: 'enrichment_ownership', label: 'Ownership', label_hi: 'Ownership', icon: 'ownership' },
];

// ================================================================
// DOCUMENT TYPE OPTIONS (for document_upload step)
// ================================================================

export const DOCUMENT_TYPES = [
    { value: 'title_deed', label: 'Title Deed' },
    { value: 'noc', label: 'NOC (No Objection Certificate)' },
    { value: 'layout_plan', label: 'Layout Plan / Floor Plan' },
    { value: 'sale_agreement', label: 'Sale Agreement' },
    { value: 'encumbrance', label: 'Encumbrance Certificate' },
    { value: 'tax_receipt', label: 'Property Tax Receipt' },
    { value: 'completion_certificate', label: 'Completion Certificate' },
    { value: 'occupancy_certificate', label: 'Occupancy Certificate' },
    { value: 'other', label: 'Other Document' },
];
