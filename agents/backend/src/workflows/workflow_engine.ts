/**
 * Unified Workflow Engine (v3 - Shortened Flow)
 *
 * Platform-agnostic engine that powers inventory upload across
 * Admin, Website, WhatsApp, and Voice. Evaluates step transitions,
 * validates answers, resolves dynamic options, and commits to SSOT.
 *
 * v3 changes:
 * - Platform-aware options (platform_options on steps)
 * - Group skip support (allow_group_skip for media)
 * - Simplified commit (uploader = owner by default)
 * - Display ID generation (RP-DEL-RES-20431)
 * - Completion percentage tracking
 * - Relaxed pincode validation (optional)
 */

import prisma from '../db';
import logger from '../utils/logger';
import { ensureOwner } from '../services/ensure_owner';
import { generateUniqueSlug } from '../utils/slug';
import { INVENTORY_WORKFLOW_STEPS } from './workflow_definition';
import { WorkflowStep, WorkflowAnswer, ConditionalRule, StepOption, StepResult, ValidationResult, WorkflowSummary } from './workflow_types';
import { INDIAN_STATES, ACTIVE_STATES, DISTRICTS_BY_STATE } from '../data/india_geo';
import { normalizePhone, phoneVariants } from '../utils/phone';
import { generateDisplayId } from '../utils/inventory_id';

// Cache validation rules per sub_category_id during a session
const validationRulesCache = new Map<string, Record<string, any>>();

/**
 * Validate that agent phone exists and is active
 */
async function validateAgentPhone(phone: string): Promise<{ valid: boolean; agentId?: string; error?: string }> {
    try {
        // Normalize phone to E.164 if needed
        let normalizedPhone = phone.trim();
        if (!normalizedPhone.startsWith('+')) {
            normalizedPhone = '+91' + normalizedPhone; // Assume India if no country code
        }

        const agent = await prisma.agent.findUnique({
            where: { phone_number: normalizedPhone },
            select: { id: true, name: true, status: true },
        });

        if (!agent) {
            return { valid: false, error: 'No agent found with this phone number' };
        }

        if (agent.status !== 'ACTIVE') {
            return { valid: false, error: `Agent ${agent.name} is not active (status: ${agent.status})` };
        }

        return { valid: true, agentId: agent.id };
    } catch (err) {
        logger.error('[WorkflowEngine] Agent validation error', err);
        return { valid: false, error: 'Failed to validate agent phone number' };
    }
}

/**
 * Format a number as Indian price (1 Cr, 58 L, 67 K).
 */
function formatIndianPrice(amount: number): string {
    if (amount >= 10000000) {
        const cr = amount / 10000000;
        return cr % 1 === 0 ? `${cr} Cr` : `${cr.toFixed(2).replace(/\.?0+$/, '')} Cr`;
    }
    if (amount >= 100000) {
        const l = amount / 100000;
        return l % 1 === 0 ? `${l} L` : `${l.toFixed(2).replace(/\.?0+$/, '')} L`;
    }
    if (amount >= 1000) {
        const k = amount / 1000;
        return k % 1 === 0 ? `${k} K` : `${k.toFixed(1).replace(/\.?0+$/, '')} K`;
    }
    return `₹${amount}`;
}

/**
 * Calculate completion percentage based on filled fields.
 * Counts mandatory + enrichment fields that have been filled.
 */
function calculateCompletionPct(answers: WorkflowAnswer): number {
    const allFields = [
        // Mandatory fields (from stages 1-12)
        'user_role', 'uploader_name', 'uploader_phone', 'intent',
        'main_category', 'flat_property_type_id', 'configuration_id',
        'address_block', 'key_holder_type',
        'customer_price', 'area', 'property_age',
        // Enrichment fields
        'features', 'bathrooms',
        'furnishing', 'facing', 'description', 'photos',
        'total_floors', 'documents',
    ];
    const filled = allFields.filter(f => {
        const v = answers[f];
        if (v === undefined || v === null || v === '') return false;
        if (Array.isArray(v) && v.length === 0) return false;
        if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return false;
        return true;
    }).length;
    return Math.round((filled / allFields.length) * 100);
}

export class WorkflowEngine {
    protected steps: WorkflowStep[];

    constructor(steps?: WorkflowStep[]) {
        this.steps = steps || INVENTORY_WORKFLOW_STEPS;
    }

    /**
     * Get the full step definitions (for frontend rendering).
     */
    getDefinition(): WorkflowStep[] {
        return this.steps;
    }

    /**
     * Given accumulated answers, return ALL visible steps (for progress bar).
     */
    async getVisibleSteps(answers: WorkflowAnswer): Promise<WorkflowStep[]> {
        const visible: WorkflowStep[] = [];
        for (const step of this.steps) {
            if (await this.isStepVisible(step, answers)) {
                visible.push(step);
            }
        }
        return visible;
    }

    /**
     * Given the current step ID and accumulated answers, return the NEXT visible step.
     * Returns null if all steps are complete.
     *
     * v3: Supports group skipping — if a step has allow_group_skip and the answer
     * is '__skip__', all remaining steps in the same group are skipped.
     */
    async getNextStep(currentStepId: string | null, answers: WorkflowAnswer): Promise<StepResult | null> {
        let foundCurrent = currentStepId === null;

        // Check if the current step triggered a group skip
        let skipGroup: string | null = null;
        if (currentStepId) {
            const currentStep = this.steps.find(s => s.id === currentStepId);
            if (currentStep?.allow_group_skip && answers[currentStep.field] === '__skip__') {
                skipGroup = currentStep.group;
            }
        }

        for (const step of this.steps) {
            if (!foundCurrent) {
                if (step.id === currentStepId) {
                    foundCurrent = true;
                }
                continue;
            }

            // Skip all steps in the skipped group
            if (skipGroup && step.group === skipGroup) {
                continue;
            }

            if (await this.isStepVisible(step, answers)) {
                const options = await this.getStepOptions(step, answers);
                const metadata = await this.getStepMetadata(step, answers);
                const resolvedStep = this.resolvePlatformQuestion(step, answers);
                return { step: resolvedStep, options: options.length > 0 ? options : undefined, metadata };
            }
        }

        return null; // All steps complete
    }

    /**
     * Get the previous visible step (for going back).
     */
    async getPreviousStep(currentStepId: string, answers: WorkflowAnswer): Promise<StepResult | null> {
        const visibleSteps = await this.getVisibleSteps(answers);
        const currentIndex = visibleSteps.findIndex(s => s.id === currentStepId);
        if (currentIndex <= 0) return null;

        const prevStep = visibleSteps[currentIndex - 1];
        const options = await this.getStepOptions(prevStep, answers);
        const resolvedStep = this.resolvePlatformQuestion(prevStep, answers);
        return { step: resolvedStep, options: options.length > 0 ? options : undefined };
    }

    /**
     * Validate a single step's answer.
     */
    async validateStep(stepId: string, value: any, answers: WorkflowAnswer): Promise<ValidationResult> {
        const step = this.steps.find(s => s.id === stepId);
        if (!step) return { valid: false, error: 'Unknown step' };

        // Required check
        if (step.required && (value === undefined || value === null || value === '')) {
            return { valid: false, error: step.validation?.message || `${step.question} is required` };
        }

        // Skip validation for empty optional fields
        if (!step.required && (value === undefined || value === null || value === '')) {
            return { valid: true };
        }

        // Allow group skip value
        if (value === '__skip__' && step.allow_group_skip) {
            return { valid: true };
        }

        // Composite block validation — context-aware based on property sub-category
        if (step.input_type === 'address_block') {
            if (!value || typeof value !== 'object') {
                return { valid: false, error: 'Address details are required' };
            }
            // Only 3 mandatory address fields: Locality, City/District, State
            if (!value.locality && !value.sub_locality) return { valid: false, error: 'Locality is required' };
            if (!value.city && !value.district) return { valid: false, error: 'City / District is required' };
            if (!value.state) return { valid: false, error: 'State is required' };
            // Pincode: optional but validated if provided (v3 change)
            if (value.pincode && !/^[1-9][0-9]{5}$/.test(value.pincode)) {
                return { valid: false, error: 'Pincode must be a valid 6-digit number' };
            }
            return { valid: true };
        }

        if (step.input_type === 'uploader_block') {
            if (!value || typeof value !== 'object') {
                return { valid: false, error: 'Contact details are required' };
            }
            if (!value.name || !value.name.trim()) {
                return { valid: false, error: 'Name is required' };
            }
            if (!value.phone || !value.phone.trim()) {
                return { valid: false, error: 'WhatsApp number is required' };
            }
            const normalized = normalizePhone(value.phone);
            if (!normalized || normalized.length < 10) {
                return { valid: false, error: 'Please enter a valid phone number' };
            }
            return { valid: true };
        }

        if (step.input_type === 'owner_block') {
            if (!value || typeof value !== 'object') {
                return { valid: false, error: 'Owner details are required' };
            }
            if (!value.owner_name || !value.owner_name.trim()) {
                return { valid: false, error: 'Owner name is required' };
            }
            // Phone format validation (if provided)
            if (value.owner_phone && value.owner_phone.trim()) {
                const normalized = normalizePhone(value.owner_phone);
                if (!normalized || normalized.length < 10) {
                    return { valid: false, error: 'Please enter a valid phone number' };
                }
            }
            return { valid: true };
        }

        // Agent reference phone validation (for AGENT_OWNER workflow)
        if (stepId === 'agent_reference_phone') {
            const validation = await validateAgentPhone(value as string);
            if (!validation.valid) {
                return { valid: false, error: validation.error || 'Invalid agent phone number' };
            }
            // Store validated agent ID in metadata for later use
            return { valid: true, agentId: validation.agentId } as any;
        }

        // Pattern validation
        if (step.validation?.pattern) {
            const regex = new RegExp(step.validation.pattern);
            if (!regex.test(String(value))) {
                return { valid: false, error: step.validation.message || 'Invalid format' };
            }
        }

        // Min/max for numbers
        if (step.input_type === 'number' || step.input_type === 'compound') {
            const num = Number(value);
            if (isNaN(num)) return { valid: false, error: 'Must be a number' };
            if (step.validation?.min !== undefined && num < step.validation.min) {
                return { valid: false, error: step.validation.message || `Minimum value is ${step.validation.min}` };
            }
            if (step.validation?.max !== undefined && num > step.validation.max) {
                return { valid: false, error: step.validation.message || `Maximum value is ${step.validation.max}` };
            }
        }

        return { valid: true };
    }

    /**
     * Get options for a dynamic/filtered/static step.
     * v3: Supports platform_options for platform-specific option sets.
     */
    async getStepOptions(step: WorkflowStep, answers: WorkflowAnswer): Promise<StepOption[]> {
        // v3: Check for platform-specific options first
        if (step.platform_options && answers._source) {
            const platformOpts = step.platform_options[answers._source as keyof typeof step.platform_options];
            if (platformOpts) {
                return platformOpts;
            }
        }

        if (step.options_source === 'static' && step.static_options) {
            return step.static_options;
        }

        if (step.options_source === 'dynamic') {
            return this.fetchDynamicOptions(step.dynamic_endpoint || '', answers);
        }

        if (step.options_source === 'filtered') {
            return this.fetchFilteredOptions(step, answers);
        }

        return [];
    }

    /**
     * Build a human-readable summary of all answers.
     * Resolves IDs to names from master data.
     */
    async buildSummary(answers: WorkflowAnswer): Promise<WorkflowSummary> {
        const summary: WorkflowSummary = {};

        // User Role
        if (answers.user_role) {
            const roleLabels: Record<string, string> = {
                PROPERTY_OWNER: 'Direct Owner',
                FINANCER: 'Financer',
                BUILDER: 'Builder',
                AGENT_DEALER: 'Agent/Dealer',
                DIRECT_CUSTOMER: 'Direct Customer',
            };
            summary['Role'] = roleLabels[answers.user_role] || answers.user_role;
        }

        // Uploader details
        if (answers.uploader_name) summary['Name'] = answers.uploader_name;
        if (answers.uploader_phone) summary['Phone'] = answers.uploader_phone;

        // Intent
        if (answers.intent) {
            summary['Intent'] = answers.intent === 'sell' ? 'Sale' : 'Rent / Lease';
        }

        // Category
        if (answers.main_category) {
            const catLabels: Record<string, string> = { residential: 'Residential', commercial: 'Commercial', agricultural: 'Agricultural Land' };
            summary['Category'] = catLabels[answers.main_category] || answers.main_category;
        }

        // Property Type
        if (answers.flat_property_type_id) {
            try {
                const fpt = await prisma.flatPropertyType.findUnique({ where: { id: answers.flat_property_type_id } });
                if (fpt) summary['Property Type'] = fpt.name;
            } catch { /* skip */ }
        }

        // Configuration
        if (answers.configuration_id) {
            try {
                const config = await prisma.propertyConfiguration.findUnique({ where: { id: answers.configuration_id } });
                if (config) summary['Configuration'] = config.name;
            } catch { /* skip */ }
        }

        // Address
        const addr = answers.address_block || {};
        const addrParts = [
            addr.flat_no, addr.apartment_name, addr.sub_locality,
            addr.locality, addr.city || addr.district, addr.state,
        ].filter(Boolean);
        if (addrParts.length > 0) summary['Address'] = addrParts.join(', ');

        // Key holder
        if (answers.key_holder_type) {
            if (answers.key_holder_type === 'UPLOADER') {
                summary['Key Holder'] = 'Self (Uploader)';
            } else if (answers.key_holder_type === 'SOMEONE_ELSE') {
                summary['Key Holder'] = `${answers.key_holder_name || 'Someone else'} (${answers.key_holder_phone || 'N/A'})`;
            }
        }

        // Pricing
        if (answers.customer_price) {
            const price = parseFloat(answers.customer_price);
            summary['Asking Price'] = formatIndianPrice(price);
        }

        // Area
        if (answers.area) {
            const areaVal = parseFloat(answers.area);
            const unit = answers.area_unit || 'sqft';
            const unitLabels: Record<string, string> = { sqft: 'Sq.ft', sqyd: 'Sq.yd', sqm: 'Sq.m', bigha: 'Bigha', acre: 'Acre', hectare: 'Hectare' };
            summary['Area'] = `${areaVal} ${unitLabels[unit] || unit}`;
        }

        // Construction Status / Age
        if (answers.property_age) {
            const ageLabels: Record<string, string> = {
                under_construction: 'Under Construction',
                new_construction: 'New Construction (< 1 year)',
                '1-3_years': '1-3 Years',
                '3-5_years': '3-5 Years',
                '5-10_years': '5-10 Years',
                '10+_years': '10+ Years',
            };
            summary['Construction Age'] = ageLabels[answers.property_age] || answers.property_age;
        }

        // Media
        const photoCount = Array.isArray(answers.photos) ? answers.photos.length : 0;
        const videoCount = Array.isArray(answers.videos) ? answers.videos.length : 0;
        if (photoCount > 0 || videoCount > 0) {
            summary['Media'] = `${photoCount} photos, ${videoCount} videos`;
        }

        return summary;
    }

    /**
     * Commit workflow answers to create an Inventory record.
     *
     * v3 changes:
     * - Uploader = owner by default (simplified ownership)
     * - Generates human-readable display_id
     * - Calculates completion_pct
     * - customer_price is now optional
     * - Key holder 'SOMEONE_ELSE' maps to 'EXTERNAL' in DB
     */
    async commit(
        answers: WorkflowAnswer,
        source: 'web' | 'admin' | 'whatsapp' | 'voice',
        agentId?: string,
    ): Promise<{ inventory_id: string; display_id: string; completion_pct: number }> {
        logger.info(`[WorkflowEngine] Committing inventory from ${source}`);

        // ─── 0. Snapshot raw answers for audit trail (before any override) ───
        const rawUploaderPhone = answers.uploader_phone as string || '';
        const rawUploaderName = answers.uploader_name as string || '';

        // ─── 1. Determine uploader identity ───
        let uploaderPhone = '';
        let uploaderName = answers.uploader_name as string || '';

        if (source === 'admin' && agentId) {
            // Admin: source contact was selected in the InventoryModal
            // Use the contact's phone from workflow answers, NOT the logged-in agent's phone
            if (answers.uploader_phone) {
                uploaderPhone = normalizePhone(answers.uploader_phone as string) || '';
            }
            // Fallback: if no uploader_phone in answers, use agent phone (legacy behavior)
            if (!uploaderPhone) {
                const agent = await prisma.agent.findUnique({ where: { id: agentId } });
                if (agent) {
                    uploaderPhone = normalizePhone(agent.phone) || '';
                    uploaderName = uploaderName || agent.name;
                }
            }
        } else {
            // Website/WhatsApp/Voice: from uploader_phone step
            uploaderPhone = normalizePhone(answers.uploader_phone as string || '') || '';
        }

        // ─── 2. In simplified v3 flow, uploader IS the owner by default ───
        // Enrichment can later add different owner details
        let ownerPhone = uploaderPhone;
        let ownerName = uploaderName || 'Property Owner';
        const ownershipType = answers.ownership_type || 'OWNER';

        // If enrichment has already set owner details, use those
        if (answers.owner_self_phone) {
            const enrichedOwnerPhone = normalizePhone(answers.owner_self_phone as string);
            if (enrichedOwnerPhone) {
                ownerPhone = enrichedOwnerPhone;
                ownerName = answers.owner_self_name as string || ownerName;
            }
        }

        if (!ownerPhone) {
            throw new Error('Phone number is required');
        }

        // Get tenant
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) throw new Error('No tenant found');

        // ─── 3. Resolve flat property type → legacy strings ───
        let legacyCategory = 'residential';
        let legacyType = 'flat';
        let flatPropertyTypeId: string | undefined;

        if (answers.flat_property_type_id) {
            flatPropertyTypeId = answers.flat_property_type_id;
            const fpt = await prisma.flatPropertyType.findUnique({ where: { id: flatPropertyTypeId } });
            if (fpt) {
                legacyCategory = fpt.legacy_category_slug || fpt.main_category;
                legacyType = fpt.legacy_type_slug || fpt.slug;
            }
        } else if (answers.main_category === 'agricultural') {
            // Auto-resolve agricultural (only 1 type, auto-selected)
            legacyCategory = 'agricultural';
            legacyType = 'agricultural_land';
            const agriType = await prisma.flatPropertyType.findFirst({
                where: { main_category: 'agricultural', is_active: true },
            });
            if (agriType) flatPropertyTypeId = agriType.id;
        } else {
            // Fallback to main_category
            legacyCategory = answers.main_category || 'residential';
        }

        // ─── 3b. Auto-resolve classification tree IDs from flat_property_type ───
        // Maps flat_property_type_id → category_id + sub_category_id (the locked tree)
        const FLAT_TYPE_TO_SUB_CATEGORY: Record<string, string> = {
            // Residential
            'residential_apartment':       '67036368-a350-423d-a410-18f3c6742efd', // Apartment / Gated Society
            'builder_floor':               '810703de-fec4-45fe-9035-a1106fa30352', // Builder Floor
            'builder_flat_front_back':     '162fa699-271f-42e4-8c0e-73c59dd3a8f6', // Builder Flat Front Facing
            'builder_flat_back_facing':    '82a4baa0-13c4-438d-bb37-8bea027e4350', // Builder Flat Back Facing
            'independent_house_villa':     'cfccf6b1-084f-4790-a59c-771626c36f17', // Independent House / Villa
            'residential_land_plot':       '925e5302-82b9-438f-b154-54f639c1dd3f', // Land / Plot
            'farm_house':                  '628f161d-e970-4d41-9509-842e85bc19c7', // Farm House
            'studio_apartment':            'bdb4e092-466c-4870-8741-ad6e9a85be42', // Studio Apartment
            'serviced_apartments':         '265dc796-8e25-4d2f-a75d-bdc026212318', // Serviced Apartments
            // Commercial
            'commercial_shops':            'cdafa0ee-334f-4fa7-bb04-3109f4e2326f', // Retail
            'commercial_showrooms':        'cdafa0ee-334f-4fa7-bb04-3109f4e2326f', // Retail
            'commercial_office_space':     'a566e0cd-f369-4676-b97e-c65865a925db', // Office
            'office_business_park':        'a566e0cd-f369-4676-b97e-c65865a925db', // Office
            'office_it_park':              'a566e0cd-f369-4676-b97e-c65865a925db', // Office
            'ready_to_move_office':        'a566e0cd-f369-4676-b97e-c65865a925db', // Office
            'bare_shell_office':           'a566e0cd-f369-4676-b97e-c65865a925db', // Office
            'coworking_office':            'a566e0cd-f369-4676-b97e-c65865a925db', // Office
            'business_center':             'a566e0cd-f369-4676-b97e-c65865a925db', // Office
            'warehouse':                   'fb635206-dc71-446a-90d0-655c21aea8c5', // Industrial
            'cold_storage':                'fb635206-dc71-446a-90d0-655c21aea8c5', // Industrial
            'factory':                     'fb635206-dc71-446a-90d0-655c21aea8c5', // Industrial
            'manufacturing':               'fb635206-dc71-446a-90d0-655c21aea8c5', // Industrial
            'hotel_resorts':               '8478896c-4703-443f-926d-0d3bc8b25b27', // Hospitality
            'guest_house_banquet':         '8478896c-4703-443f-926d-0d3bc8b25b27', // Hospitality
            'time_share':                  '8478896c-4703-443f-926d-0d3bc8b25b27', // Hospitality
            'food_court':                  '8478896c-4703-443f-926d-0d3bc8b25b27', // Hospitality
            'restaurant':                  '8478896c-4703-443f-926d-0d3bc8b25b27', // Hospitality
            'kiosk':                       '8478896c-4703-443f-926d-0d3bc8b25b27', // Hospitality
            'multiplex':                   '8478896c-4703-443f-926d-0d3bc8b25b27', // Hospitality
            'commercial_land':             '71fc7951-b75c-4d6e-a2a4-f70fd5ed52b8', // Lands / Plots
            'industrial_land_plots':       '71fc7951-b75c-4d6e-a2a4-f70fd5ed52b8', // Lands / Plots
            'sco_plots':                   '71fc7951-b75c-4d6e-a2a4-f70fd5ed52b8', // Lands / Plots
            'agricultural_farm_land_commercial': '71fc7951-b75c-4d6e-a2a4-f70fd5ed52b8', // Lands / Plots
            'commercial_other':            'cdafa0ee-334f-4fa7-bb04-3109f4e2326f', // Retail (fallback)
            // Agricultural
            'agricultural_land':           'e3d938da-5575-4e88-ae0e-66e97b1433d4', // Farm Land
        };
        const CATEGORY_SLUG_TO_ID: Record<string, string> = {
            'residential':  '1b687034-98bc-4d22-b751-f9531a01e38d',
            'commercial':   'a980aa06-adc5-45a9-9108-4d3bf85d2a9d',
            'agricultural': 'd0c00d05-971f-4f1e-a00a-14edf3396489',
        };

        if (flatPropertyTypeId) {
            const fpt = await prisma.flatPropertyType.findUnique({ where: { id: flatPropertyTypeId } });
            if (fpt) {
                answers.category_id = CATEGORY_SLUG_TO_ID[fpt.main_category] || undefined;
                answers.sub_category_id = FLAT_TYPE_TO_SUB_CATEGORY[fpt.slug] || undefined;
                // type_id stays undefined — flat types map to sub-categories, not property types
            }
        }

        // ─── 4. Map intent (rent_lease → rent for legacy) ───
        let intent = answers.intent || 'sell';
        if (intent === 'rent_lease') intent = 'rent';

        // ─── 5. SSOT: Upsert Owner Contact ───
        // Don't overwrite existing contact name — ContactSearchField already created/found it
        await prisma.contact.upsert({
            where: { phone_number: ownerPhone },
            update: {
                updated_at: new Date(),
            },
            create: {
                phone_number: ownerPhone,
                tenant_id: tenant.id,
                name: ownerName || null,
                contact_type: 'LANDLORD',
                lead_status: 'NEW',
            },
        });

        // SSOT: Ensure Owner record
        const ownerId = await ensureOwner(ownerPhone, tenant.id);

        // ─── 6. Upsert uploader contact (if different from owner) ───
        if (uploaderPhone && uploaderPhone !== ownerPhone) {
            await prisma.contact.upsert({
                where: { phone_number: uploaderPhone },
                update: {
                    updated_at: new Date(),
                },
                create: {
                    phone_number: uploaderPhone,
                    tenant_id: tenant.id,
                    name: uploaderName || null,
                    contact_type: 'LANDLORD',
                    source: source === 'whatsapp' ? 'whatsapp' : 'website',
                    lead_status: 'NEW',
                },
            });
        }

        // ─── 7. Build specs & features JSON (may be empty in v3 shortened flow) ───
        const specs: Record<string, any> = {};
        if (answers.bathrooms) specs.bathrooms = parseInt(answers.bathrooms);
        if (answers.area) specs.area = parseFloat(answers.area);
        if (answers.area_unit) specs.area_unit = answers.area_unit;

        let features: Record<string, boolean> | undefined;
        if (answers.features && typeof answers.features === 'object') {
            features = {};
            for (const [k, v] of Object.entries(answers.features)) {
                if (v) features[k] = true;
            }
            if (answers.lift_available === 'yes') features.lift = true;
            if (Object.keys(features).length === 0) features = undefined;
        } else if (answers.lift_available === 'yes') {
            features = { lift: true };
        }

        // ─── 8. Extract address ───
        const addrBlock = answers.address_block || {};
        const flatNo = addrBlock.flat_no || undefined;
        const plotNo = addrBlock.plot_no || undefined;
        const apartmentName = addrBlock.apartment_name || undefined;
        const addrLocality = addrBlock.locality || answers.locality || undefined;
        const addrSubLocality = addrBlock.sub_locality || undefined;
        const addrCity = addrBlock.city || addrBlock.district || answers.district || undefined;
        const addrState = addrBlock.state || answers.state || undefined;
        const addrPincode = addrBlock.pincode || answers.pincode || undefined;
        const floorNumber = addrBlock.floor_number ? parseInt(addrBlock.floor_number)
            : (answers.floor_number ? parseInt(answers.floor_number) : undefined);

        const fullAddress = addrBlock.full_address || [
            flatNo, apartmentName, addrSubLocality, addrLocality, addrCity, addrState,
            addrPincode ? `- ${addrPincode}` : '',
        ].filter(Boolean).join(', ').replace(', -', ' -') || null;

        const addrLatitude = addrBlock.latitude != null ? parseFloat(addrBlock.latitude) : undefined;
        const addrLongitude = addrBlock.longitude != null ? parseFloat(addrBlock.longitude) : undefined;

        const location = [addrLocality || addrCity, addrState].filter(Boolean).join(', ') || null;

        // ─── 9. Pricing (now optional in v3) ───
        let customerPrice: number | null = null;
        let displayPrice: number | null = null;
        let legacyPrice: number | null = null;

        if (answers.customer_price) {
            customerPrice = parseFloat(answers.customer_price);
            legacyPrice = customerPrice;
        }
        if (answers.display_price) {
            displayPrice = parseFloat(answers.display_price);
        } else {
            displayPrice = customerPrice; // Default: display = customer
        }
        // Support legacy single price field
        if (!customerPrice && answers.price) {
            customerPrice = parseFloat(answers.price);
            displayPrice = customerPrice;
            legacyPrice = customerPrice;
        }

        // ─── 10. Generate display ID ───
        const displayId = await generateDisplayId(addrCity || '', answers.main_category || '');

        // ─── 11. Calculate completion percentage ───
        const completionPct = calculateCompletionPct(answers);

        // ─── 12. Map key holder type (v3: SOMEONE_ELSE → EXTERNAL) ───
        let dbKeyHolderType = answers.key_holder_type || undefined;
        if (dbKeyHolderType === 'SOMEONE_ELSE') {
            dbKeyHolderType = 'EXTERNAL';
        }

        // ─── 13. Validate and link reference agent (if enrichment provided) ───
        let referenceAgentId: string | undefined;

        if (ownershipType === 'AGENT_OWNER' && answers.agent_reference_phone) {
            const validation = await validateAgentPhone(answers.agent_reference_phone as string);
            if (validation.valid && validation.agentId) {
                referenceAgentId = validation.agentId;
            }
        }

        // ─── 13b. Auto-detect agent by phone if no agentId from JWT ───
        if (!agentId && uploaderPhone) {
            const matchedAgent = await prisma.agent.findFirst({
                where: { phone_number: { in: phoneVariants(uploaderPhone) }, status: 'active' },
                select: { id: true, name: true },
            });
            if (matchedAgent) {
                agentId = matchedAgent.id;
                logger.info(`[WorkflowEngine] Auto-linked to agent ${matchedAgent.name} (${matchedAgent.id}) by phone ${uploaderPhone}`);
            }
        }

        // ─── 14. Create Inventory ───
        const inventory = await prisma.inventory.create({
            data: {
                tenant_id: tenant.id,
                owner_id: ownerId,
                owner_phone: ownerPhone,
                intent,

                // Display ID (v3)
                display_id: displayId,
                completion_pct: completionPct,
                is_enriched: false,

                // Flat property type (Redesign v2)
                flat_property_type_id: flatPropertyTypeId || undefined,

                // Legacy classification IDs (backward compat)
                category_id: answers.category_id || undefined,
                sub_category_id: answers.sub_category_id || undefined,
                type_id: answers.type_id || undefined,
                configuration_id: answers.configuration_id || undefined,

                // Legacy string fields
                category: legacyCategory,
                type: legacyType,

                // Specs & Features (may be empty in shortened flow)
                specs: Object.keys(specs).length > 0 ? specs : undefined,
                features: features || undefined,

                // Property Details (enrichment — may be empty)
                description: answers.description || undefined,
                furnishing: answers.furnishing || undefined,
                floor_number: floorNumber || undefined,
                total_floors: answers.total_floors ? parseInt(answers.total_floors) : undefined,
                facing: answers.facing || undefined,
                property_age: answers.property_age || undefined,

                // Structured Address
                flat_no: flatNo,
                plot_no: plotNo,
                apartment_name: apartmentName,
                state: addrState,
                district: addrCity,   // Backward compat: city value written to district too
                city: addrCity,
                sub_locality: addrSubLocality,
                locality: addrLocality,
                pincode: addrPincode,
                full_address: fullAddress || undefined,
                location,
                latitude: addrLatitude || undefined,
                longitude: addrLongitude || undefined,

                // Pricing (optional in v3)
                customer_price: customerPrice || undefined,
                display_price: displayPrice || undefined,
                price: legacyPrice || undefined,

                // Media
                media_urls: answers.photos && answers.photos !== '__skip__' ? answers.photos : [],
                video_urls: answers.videos && answers.videos !== '__skip__' ? answers.videos : [],

                // Lead reference
                lead_reference: answers.lead_reference || undefined,

                // Key holder
                key_holder_type: dbKeyHolderType || undefined,
                key_holder_name: (dbKeyHolderType === 'EXTERNAL') ? answers.key_holder_name : undefined,
                key_holder_phone: (dbKeyHolderType === 'EXTERNAL') ? answers.key_holder_phone : undefined,

                // Ownership & Upload tracking
                ownership_type: ownershipType as any,
                upload_source: source === 'web' ? 'website' : source,
                uploader_phone: uploaderPhone || undefined,
                uploader_name: uploaderName || undefined,

                // Agent (uploader and reference)
                uploaded_by_agent_id: agentId || undefined,
                reference_agent_phone: answers.agent_reference_phone as string | undefined,
                reference_agent_id: referenceAgentId,

                // Partner uploads via WhatsApp go to pending_approval — coordinator must approve before going live
                status: source === 'whatsapp' ? 'pending_approval' : 'active',
            },
        });

        // ─── POST-WRITE SAFEGUARD: Verify owner_phone matches intended contact ───
        if (source === 'admin' && rawUploaderPhone) {
            const expectedPhone = normalizePhone(rawUploaderPhone);
            if (expectedPhone && inventory.owner_phone !== expectedPhone) {
                logger.error('[WorkflowEngine] OWNER_PHONE_MISMATCH — auto-correcting', {
                    inventory_id: inventory.id,
                    expected: expectedPhone,
                    actual: inventory.owner_phone,
                    raw_uploader_phone: rawUploaderPhone,
                });
                await prisma.inventory.update({
                    where: { id: inventory.id },
                    data: { owner_phone: expectedPhone, uploader_phone: expectedPhone },
                });
            }
        }

        // Generate SEO slug
        try {
            let configName: string | undefined;
            if (answers.configuration_id) {
                const config = await prisma.propertyConfiguration.findUnique({ where: { id: answers.configuration_id }, select: { name: true } });
                configName = config?.name || undefined;
            }
            const slug = await generateUniqueSlug({
                id: inventory.id,
                type: legacyType,
                category: legacyCategory,
                specs: specs || {},
                intent: intent || undefined,
                location: location || undefined,
                city: addrCity,
                locality: addrLocality,
                sub_locality: addrSubLocality,
                apartment_name: apartmentName,
                full_address: fullAddress || undefined,
                configuration_name: configName,
            });
            await prisma.inventory.update({ where: { id: inventory.id }, data: { slug } });
        } catch (slugErr) {
            logger.warn('Failed to generate slug for inventory', { id: inventory.id, error: slugErr });
        }

        // Create InventoryDocuments if any
        if (answers.documents && Array.isArray(answers.documents)) {
            for (const doc of answers.documents) {
                await prisma.inventoryDocument.create({
                    data: {
                        inventory_id: inventory.id,
                        doc_type: doc.doc_type || 'other',
                        title: doc.title || doc.file_name || 'Document',
                        file_url: doc.file_url || doc.url || '',
                        file_name: doc.file_name || 'document',
                        mime_type: doc.mime_type || 'application/octet-stream',
                        file_size: doc.file_size || null,
                        uploaded_via: source,
                    },
                });
            }
        }

        // SSOT: Log Interaction
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: ownerPhone,
                direction: 'inbound',
                channel: source === 'whatsapp' ? 'whatsapp' : 'web',
                event_type: 'inventory_commit',
                content: `Property listed: ${legacyType} for ${intent} in ${location || 'N/A'}`,
                metadata: {
                    inventory_id: inventory.id,
                    display_id: displayId,
                    source,
                    workflow: 'inventory_v3',
                    owner_name: ownerName || undefined,
                    ownership_type: ownershipType,
                    uploader_phone: uploaderPhone || undefined,
                    raw_uploader_phone: rawUploaderPhone || undefined,
                    raw_uploader_name: rawUploaderName || undefined,
                },
            },
        });

        // Auto-register external key holder as PARTNER_AGENT
        if (dbKeyHolderType === 'EXTERNAL' && answers.key_holder_phone) {
            const dealerPhone = normalizePhone(answers.key_holder_phone);
            if (dealerPhone) {
                try {
                    await prisma.contact.upsert({
                        where: { phone_number: dealerPhone },
                        update: { name: answers.key_holder_name || undefined },
                        create: {
                            phone_number: dealerPhone,
                            tenant_id: tenant.id,
                            name: answers.key_holder_name || 'External Dealer',
                            contact_type: 'PARTNER_AGENT',
                            source: 'inventory_workflow',
                            lead_status: 'NEW',
                        },
                    });

                    const existingDealerOwner = await prisma.owner.findFirst({
                        where: { contact_phone: { in: phoneVariants(dealerPhone) } },
                    });
                    if (!existingDealerOwner) {
                        const extOwner = await prisma.owner.create({
                            data: {
                                scope: 'EXTERNAL',
                                externalType: 'INDIVIDUAL_AGENT',
                                contact_phone: dealerPhone,
                                status: 'ACTIVE',
                                listing_limit: 5,
                                priority_score: 30,
                            },
                        });
                        await prisma.subscription.create({
                            data: {
                                owner_id: extOwner.id,
                                plan_type: 'FREE',
                                status: 'ACTIVE',
                                start_date: new Date(),
                                auto_renew: false,
                            },
                        });
                        logger.info(`[WorkflowEngine] Auto-registered external dealer: ${dealerPhone}`);
                    }

                    await prisma.interaction.create({
                        data: {
                            tenant_id: tenant.id,
                            phone_number: dealerPhone,
                            direction: 'inbound',
                            channel: source === 'whatsapp' ? 'whatsapp' : 'web',
                            event_type: 'dealer_auto_registered',
                            content: `External dealer auto-registered via inventory upload. Property ID: ${inventory.id}`,
                            metadata: { inventory_id: inventory.id, source, registered_by: agentId },
                        },
                    });
                } catch (dealerErr) {
                    logger.error(`[WorkflowEngine] Failed to auto-register dealer: ${dealerPhone}`, dealerErr);
                }
            }
        }

        // ─── Auto-register dealer/builder from website & send invitation ───
        const userRole = answers.user_role as string;
        if ((userRole === 'AGENT_DEALER' || userRole === 'BUILDER') && uploaderPhone) {
            const dealerPhone = normalizePhone(uploaderPhone);
            if (dealerPhone) {
                try {
                    // Check if already a registered partner agent
                    const existingPartner = await prisma.partnerAgent.findUnique({
                        where: { phone_number: dealerPhone },
                    });

                    if (!existingPartner) {
                        // Auto-register as partner agent
                        const partnerCategory = userRole === 'BUILDER' ? 'COMPANY' : 'INDIVIDUAL';
                        await prisma.partnerAgent.create({
                            data: {
                                phone_number: dealerPhone,
                                name: ownerName || uploaderName || 'Partner',
                                email: answers.email as string || undefined,
                                company_name: userRole === 'BUILDER' ? (ownerName || 'Builder') : undefined,
                                package_type: 'FREE',
                                status: 'ACTIVE',
                                partner_category: partnerCategory,
                            },
                        });

                        // Ensure contact exists as PARTNER_AGENT
                        await prisma.contact.upsert({
                            where: { phone_number: dealerPhone },
                            update: { contact_type: 'PARTNER_AGENT', name: ownerName || uploaderName || undefined },
                            create: {
                                phone_number: dealerPhone,
                                tenant_id: tenant.id,
                                name: ownerName || uploaderName || 'Partner',
                                contact_type: 'PARTNER_AGENT',
                                source: 'website_auto_register',
                            },
                        });

                        // Send welcome WhatsApp + Email
                        const { sendPartnerWelcomeWhatsApp, sendPartnerWelcomeEmail } = await import('../services/partner_notifications');
                        const partnerName = ownerName || uploaderName || 'Partner';
                        await sendPartnerWelcomeWhatsApp(dealerPhone, partnerName, partnerCategory, undefined, 'FREE').catch(e =>
                            logger.warn(`[WorkflowEngine] Welcome WhatsApp failed for ${dealerPhone}: ${e.message}`)
                        );
                        if (answers.email) {
                            await sendPartnerWelcomeEmail(answers.email as string, partnerName, partnerCategory).catch(e =>
                                logger.warn(`[WorkflowEngine] Welcome email failed for ${answers.email}: ${e.message}`)
                            );
                        }

                        logger.info(`[WorkflowEngine] Auto-registered ${userRole} partner: ${dealerPhone} from website upload`);
                    } else {
                        logger.info(`[WorkflowEngine] ${userRole} ${dealerPhone} already registered as partner`);
                    }

                    // Link inventory to partner agent if not already linked
                    if (!inventory.uploaded_by_agent_id) {
                        // Find matching internal agent by phone
                        const matchedAgent = await prisma.agent.findFirst({
                            where: { phone_number: { in: phoneVariants(dealerPhone) }, status: 'active' },
                            select: { id: true },
                        });
                        if (matchedAgent) {
                            await prisma.inventory.update({
                                where: { id: inventory.id },
                                data: { uploaded_by_agent_id: matchedAgent.id },
                            });
                        }
                    }
                } catch (dealerErr) {
                    logger.error(`[WorkflowEngine] Failed to auto-register ${userRole}: ${dealerPhone}`, dealerErr);
                }
            }
        }

        logger.info(`[WorkflowEngine] Inventory created: ${inventory.id} (${displayId}) from ${source}, completion: ${completionPct}%`);
        return { inventory_id: inventory.id, display_id: displayId, completion_pct: completionPct };
    }

    // ─── PRIVATE HELPERS ────────────────────────────────────────

    /**
     * Resolve platform-specific question text (e.g., admin sees different question than web).
     */
    private resolvePlatformQuestion(step: WorkflowStep, answers: WorkflowAnswer): WorkflowStep {
        const source = answers._source as string;
        if (!source || !step.platform_question) return step;

        const platformQ = step.platform_question[source as keyof typeof step.platform_question];
        const platformQHi = step.platform_question_hi?.[source as keyof typeof step.platform_question_hi];

        if (!platformQ) return step;

        return { ...step, question: platformQ, ...(platformQHi && { question_hi: platformQHi }) };
    }

    /**
     * Get metadata for composite steps (e.g., address field configuration based on property type).
     */
    private async getStepMetadata(step: WorkflowStep, answers: WorkflowAnswer): Promise<Record<string, any> | undefined> {
        if (step.input_type === 'address_block') {
            const rules = await this.getAddressRules(answers);
            return { address_config: rules };
        }
        return undefined;
    }

    /**
     * Get address field rules - tries FlatPropertyType first, falls back to sub-category.
     */
    async getAddressRules(answers: WorkflowAnswer): Promise<{
        sub_category_slug: string;
        floor_required: boolean;
        bhk_required: boolean;
        plot_area_required: boolean;
    }> {
        // New: try flat property type first (Redesign v2)
        const flatTypeId = answers.flat_property_type_id;
        if (flatTypeId) {
            const cacheKey = `flat_${flatTypeId}`;
            if (!validationRulesCache.has(cacheKey)) {
                const flatType = await prisma.flatPropertyType.findUnique({
                    where: { id: flatTypeId },
                    select: { bhk_required: true, floor_required: true, plot_area_required: true, slug: true },
                });
                if (flatType) {
                    validationRulesCache.set(cacheKey, {
                        rules: {
                            bhk_required: flatType.bhk_required,
                            floor_required: flatType.floor_required,
                            plot_area_required: flatType.plot_area_required,
                        },
                        slug: flatType.slug,
                    });
                }
            }
            const cached = validationRulesCache.get(cacheKey);
            if (cached) {
                return {
                    sub_category_slug: cached.slug,
                    floor_required: cached.rules.floor_required === true,
                    bhk_required: cached.rules.bhk_required === true,
                    plot_area_required: cached.rules.plot_area_required === true,
                };
            }
        }

        // Fallback: Check main_category if no flat_property_type_id
        const mainCategory = answers.main_category;
        if (mainCategory === 'agricultural') {
            return { sub_category_slug: 'agricultural', floor_required: false, bhk_required: false, plot_area_required: true };
        }

        // Fallback: legacy sub-category rules
        const subCatId = answers.sub_category_id;
        if (!subCatId) {
            return { sub_category_slug: '', floor_required: true, bhk_required: false, plot_area_required: false };
        }

        if (!validationRulesCache.has(subCatId)) {
            const subCat = await prisma.propertySubCategory.findUnique({
                where: { id: subCatId },
                select: { validation_rules: true, slug: true },
            });
            validationRulesCache.set(subCatId, {
                rules: (subCat?.validation_rules as Record<string, any>) || {},
                slug: subCat?.slug || '',
            });
        }

        const cached = validationRulesCache.get(subCatId)!;
        return {
            sub_category_slug: cached.slug,
            floor_required: cached.rules.floor_required === true,
            bhk_required: cached.rules.bhk_required === true,
            plot_area_required: cached.rules.plot_area_required === true,
        };
    }

    /**
     * Check if a step should be visible given current answers.
     */
    private async isStepVisible(step: WorkflowStep, answers: WorkflowAnswer): Promise<boolean> {
        // Check skip_when (OR logic — skip if ANY condition is true)
        if (step.skip_when && step.skip_when.length > 0) {
            for (const rule of step.skip_when) {
                if (await this.evaluateCondition(rule, answers)) {
                    return false; // Skip this step
                }
            }
        }

        // Check show_when (AND logic — show only if ALL conditions are true)
        if (step.show_when && step.show_when.length > 0) {
            for (const rule of step.show_when) {
                if (!(await this.evaluateCondition(rule, answers))) {
                    return false; // Don't show
                }
            }
        }

        return true;
    }

    /**
     * Evaluate a single conditional rule against accumulated answers.
     */
    private async evaluateCondition(rule: ConditionalRule, answers: WorkflowAnswer): Promise<boolean> {
        // Special: validation rules from sub-category (legacy)
        if (rule.operator === 'from_validation_rules') {
            return this.checkValidationRule(answers, rule.validation_rule_key || '');
        }

        // New: flat property type rules (Redesign v2)
        if (rule.operator === 'from_flat_type_rules') {
            return this.checkFlatTypeRule(answers, rule.validation_rule_key || '');
        }

        const fieldValue = answers[rule.field];

        switch (rule.operator) {
            case 'equals':
                return fieldValue === rule.value;
            case 'not_equals':
                return fieldValue !== rule.value;
            case 'in':
                return Array.isArray(rule.value) && rule.value.includes(fieldValue);
            case 'not_in':
                return Array.isArray(rule.value) && !rule.value.includes(fieldValue);
            case 'exists':
                return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
            case 'not_exists':
                return fieldValue === undefined || fieldValue === null || fieldValue === '';
            case 'gt':
                return Number(fieldValue) > Number(rule.value);
            case 'lt':
                return Number(fieldValue) < Number(rule.value);
            case 'gte':
                return Number(fieldValue) >= Number(rule.value);
            case 'lte':
                return Number(fieldValue) <= Number(rule.value);
            default:
                return false;
        }
    }

    /**
     * Check a validation rule from the sub-category's validation_rules JSON (legacy).
     */
    private async checkValidationRule(answers: WorkflowAnswer, ruleKey: string): Promise<boolean> {
        const subCatId = answers.sub_category_id;
        if (!subCatId) return false;

        if (!validationRulesCache.has(subCatId)) {
            const subCat = await prisma.propertySubCategory.findUnique({
                where: { id: subCatId },
                select: { validation_rules: true, slug: true },
            });
            validationRulesCache.set(subCatId, {
                rules: (subCat?.validation_rules as Record<string, any>) || {},
                slug: subCat?.slug || '',
            });
        }

        const cached = validationRulesCache.get(subCatId)!;
        answers['_sub_category_slug'] = cached.slug;
        return cached.rules[ruleKey] === true;
    }

    /**
     * Check a rule from the FlatPropertyType record (Redesign v2).
     * Reads bhk_required, floor_required, plot_area_required directly from the type.
     */
    private async checkFlatTypeRule(answers: WorkflowAnswer, ruleKey: string): Promise<boolean> {
        const flatTypeId = answers.flat_property_type_id;

        // If no flat type selected (e.g., for plots/land/commercial),
        // return true for plot_area_required rule (skip flat-only fields like furnishing)
        if (!flatTypeId) {
            return ruleKey === 'plot_area_required';
        }

        const cacheKey = `flat_${flatTypeId}`;
        if (!validationRulesCache.has(cacheKey)) {
            const flatType = await prisma.flatPropertyType.findUnique({
                where: { id: flatTypeId },
                select: { bhk_required: true, floor_required: true, plot_area_required: true, slug: true },
            });
            if (!flatType) return false;
            validationRulesCache.set(cacheKey, {
                rules: {
                    bhk_required: flatType.bhk_required,
                    floor_required: flatType.floor_required,
                    plot_area_required: flatType.plot_area_required,
                },
                slug: flatType.slug,
            });
        }

        const cached = validationRulesCache.get(cacheKey)!;
        return cached.rules[ruleKey] === true;
    }

    /**
     * Fetch dynamic options (categories, configurations, usage types, etc.)
     */
    private async fetchDynamicOptions(endpoint: string, answers: WorkflowAnswer): Promise<StepOption[]> {
        try {
            if (endpoint.includes('/master/categories')) {
                const cats = await prisma.propertyCategory.findMany({
                    where: { is_active: true },
                    orderBy: { display_order: 'asc' },
                });
                return cats.map(c => ({ value: c.id, label: c.name }));
            }

            if (endpoint.includes('/master/configurations')) {
                // Commercial config slugs — everything else is residential
                const COMMERCIAL_CONFIG_SLUGS = ['furnished-office', 'bare-shell', 'serviced-office'];

                const configs = await prisma.propertyConfiguration.findMany({
                    where: { is_active: true },
                    orderBy: { display_order: 'asc' },
                });

                // Filter by main_category from session answers
                const category = answers.main_category;
                if (category === 'commercial') {
                    return configs
                        .filter(c => COMMERCIAL_CONFIG_SLUGS.includes(c.slug))
                        .map(c => ({ value: c.id, label: c.name }));
                }
                // Residential / agricultural — exclude commercial configs
                return configs
                    .filter(c => !COMMERCIAL_CONFIG_SLUGS.includes(c.slug))
                    .map(c => ({ value: c.id, label: c.name }));
            }

            if (endpoint.includes('/master/usage-types')) {
                const types = await prisma.usageType.findMany({
                    where: { is_active: true },
                    orderBy: { display_order: 'asc' },
                });
                return types.map(t => ({ value: t.id, label: t.name }));
            }

            if (endpoint.includes('/master/investment-types')) {
                const types = await prisma.investmentType.findMany({
                    where: { is_active: true },
                    orderBy: { display_order: 'asc' },
                });
                return types.map(t => ({ value: t.id, label: t.name }));
            }

            // New: flat property types (Redesign v2)
            if (endpoint.includes('/master/flat-property-types')) {
                const types = await prisma.flatPropertyType.findMany({
                    where: { is_active: true },
                    orderBy: { display_order: 'asc' },
                });
                return types.map(t => ({ value: t.id, label: t.name }));
            }

            if (endpoint.includes('/geo/states')) {
                return ACTIVE_STATES.map(s => ({ value: s.name, label: s.name }));
            }

            return [];
        } catch (err) {
            logger.error(`[WorkflowEngine] Failed to fetch dynamic options: ${endpoint}`, err);
            return [];
        }
    }

    /**
     * Fetch filtered options (flat property types by main_category, sub-categories, types, districts).
     */
    private async fetchFilteredOptions(step: WorkflowStep, answers: WorkflowAnswer): Promise<StepOption[]> {
        try {
            const filterValue = step.filter_by ? answers[step.filter_by] : null;
            if (!filterValue) return [];

            // New: flat property types filtered by main_category (Redesign v2)
            if (step.id === 'flat_property_type_id') {
                const types = await prisma.flatPropertyType.findMany({
                    where: { main_category: filterValue, is_active: true },
                    orderBy: { display_order: 'asc' },
                });
                return types.map(t => ({ value: t.id, label: t.name }));
            }

            // Legacy: sub-categories by category
            if (step.id === 'sub_category_id') {
                const subs = await prisma.propertySubCategory.findMany({
                    where: { category_id: filterValue, is_active: true },
                    orderBy: { display_order: 'asc' },
                });
                return subs.map(s => ({ value: s.id, label: s.name }));
            }

            // Legacy: types by sub-category
            if (step.id === 'type_id') {
                const types = await prisma.propertyType.findMany({
                    where: { sub_category_id: filterValue, is_active: true },
                    orderBy: { display_order: 'asc' },
                });
                return types.map(t => ({ value: t.id, label: t.name }));
            }

            if (step.id === 'district') {
                const stateEntry = INDIAN_STATES.find(s => s.name === filterValue);
                if (stateEntry) {
                    const districts = DISTRICTS_BY_STATE[stateEntry.code] || [];
                    return districts.map(d => ({ value: d, label: d }));
                }
                return [];
            }

            return [];
        } catch (err) {
            logger.error(`[WorkflowEngine] Failed to fetch filtered options for ${step.id}`, err);
            return [];
        }
    }

}
