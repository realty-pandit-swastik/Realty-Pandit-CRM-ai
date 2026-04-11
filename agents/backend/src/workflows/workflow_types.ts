/**
 * Unified Inventory Workflow Type Definitions
 *
 * These types define the step-by-step inventory upload workflow
 * that runs across all platforms: Admin, Website, WhatsApp, Voice.
 */

export interface WorkflowStep {
    id: string;
    group: string;           // classification, specs, pricing, address, features, media, contact, optional, confirm
    question: string;        // English question text
    question_hi?: string;    // Hindi translation (for WhatsApp)
    input_type: 'dropdown' | 'number' | 'text' | 'phone' | 'textarea' | 'radio' | 'multi_select' | 'media_upload' | 'video_upload' | 'document_upload' | 'confirm' | 'compound' | 'address_block' | 'owner_block' | 'uploader_block';
    field: string;           // Maps to answer key: "category_id", "state", etc.
    placeholder?: string;

    // For compound inputs (e.g., area + area_unit in one step)
    secondary_field?: string;
    secondary_options?: Array<{ value: string; label: string }>;

    // Options (for dropdown/radio/multi_select)
    options_source?: 'static' | 'dynamic' | 'filtered';
    static_options?: Array<{ value: string; label: string; label_hi?: string }>;
    dynamic_endpoint?: string;    // e.g., "/public/master/categories"
    filter_by?: string;           // Field from answers to filter by, e.g., "category_id"

    // Conditional logic
    show_when?: ConditionalRule[];  // ALL must be true (AND) to show
    skip_when?: ConditionalRule[];  // ANY true = skip this step (OR)

    // Validation
    required?: boolean;
    validation?: {
        min?: number;
        max?: number;
        pattern?: string;     // Regex
        message?: string;     // Custom error message
    };

    // Platform rendering hints
    whatsapp_type?: 'list' | 'buttons' | 'text' | 'media';

    // Platform-specific option overrides (v3 shortened flow)
    platform_options?: {
        admin?: Array<{ value: string; label: string; label_hi?: string }>;
        web?: Array<{ value: string; label: string; label_hi?: string }>;
        whatsapp?: Array<{ value: string; label: string; label_hi?: string }>;
    };

    // Platform-specific question text overrides
    platform_question?: {
        admin?: string;
        web?: string;
        whatsapp?: string;
    };
    platform_question_hi?: {
        admin?: string;
        web?: string;
        whatsapp?: string;
    };

    // Allow skipping entire group (e.g., media "Skip" button)
    allow_group_skip?: boolean;

    // Help text shown below input
    help_text?: string;
    help_text_hi?: string;
}

export interface ConditionalRule {
    field: string;
    operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'exists' | 'not_exists' | 'gt' | 'lt' | 'gte' | 'lte' | 'from_validation_rules' | 'from_flat_type_rules';
    value?: any;
    validation_rule_key?: string;  // For from_validation_rules: "bhk_required", "floor_required", etc.
}

export interface WorkflowAnswer {
    [stepId: string]: any;
}

export interface WorkflowState {
    answers: WorkflowAnswer;
    current_step_id: string | null;
    source: 'web' | 'admin' | 'whatsapp' | 'voice';
    started_at: string;
    pending_media_urls?: string[];
    pending_document_urls?: string[];
}

export interface StepOption {
    value: string;
    label: string;
    label_hi?: string;
}

export interface StepResult {
    step: WorkflowStep;
    options?: StepOption[];
    metadata?: Record<string, any>;  // Extra context for composite steps (e.g., address_config)
}

export interface ValidationResult {
    valid: boolean;
    error?: string;
}

export interface WorkflowSummary {
    [label: string]: string;  // Human-readable: "Property Type" → "2 BHK Flat"
}
