import { z } from 'zod';
import { normalizePhone } from '../utils/phone';

const phoneRegex = /^\+?[1-9]\d{7,14}$/;

/**
 * Canonical phone field for all public lead-capture forms.
 * Accepts user-typed formats, normalizes to E.164 (+91XXXXXXXXXX) BEFORE the
 * handler sees req.body.phone (validate() writes result.data back to req.body).
 * Rejects anything that doesn't resolve to a valid Indian mobile so we never
 * store an un-openable contact PK again. See docs/plans/2026-05-17-website-phone-normalization-fix.md
 */
const phoneField = z
    .string()
    .regex(phoneRegex, 'Invalid phone number')
    .transform((v) => normalizePhone(v))
    .refine((v) => /^\+91[6-9]\d{9}$/.test(v), 'Invalid phone number');

export const contactSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    phone: phoneField,
    email: z.string().email().optional().or(z.literal('')),
    message: z.string().max(1000).optional(),
    property_id: z.string().optional(),
    intent: z.string().optional(),
});

export const leadSchema = z.object({
    name: z.string().max(100).optional(),
    phone: phoneField.optional(),
    email: z.string().email().optional().or(z.literal('')),
    interest: z.string().max(200).optional(),
    source: z.string().max(100).optional(),
    page_url: z.string().max(500).optional(),
    user_agent: z.string().max(500).optional(),
    cookie_consent: z.boolean().optional(),
});

export const newsletterSchema = z.object({
    email: z.string().email('Invalid email address'),
    name: z.string().max(100).optional(),
    source: z.string().max(100).optional(),
});

/**
 * Date + time are MANDATORY for every client-facing visit booking.
 * preferred_date: ISO YYYY-MM-DD, within today … today+30 (mirrors the website
 * form's date picker bounds). preferred_time: one of the three concrete slots
 * (no "flexible") so scheduled_at is deterministic.
 * See docs/plans/2026-05-17-website-visit-not-visible-in-crm.md
 */
const visitDateField = z
    .string({ required_error: 'Preferred date is required' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Preferred date must be a valid date')
    .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Preferred date must be a valid date')
    .refine((v) => {
        const today = new Date(); today.setUTCHours(0, 0, 0, 0);
        const max = new Date(today); max.setUTCDate(max.getUTCDate() + 30);
        const d = new Date(`${v}T00:00:00Z`);
        return d >= today && d <= max;
    }, 'Preferred date must be within the next 30 days');

const visitTimeSlot = z.enum(['morning', 'afternoon', 'evening'], {
    required_error: 'Preferred time is required',
    invalid_type_error: 'Preferred time is required',
});

export const scheduleVisitSchema = z.object({
    property_id: z.string().min(1, 'Property ID is required'),
    name: z.string().min(1, 'Name is required').max(100),
    phone: phoneField,
    email: z.string().email().optional().or(z.literal('')),
    preferred_date: visitDateField,
    preferred_time: visitTimeSlot,
    message: z.string().max(1000).optional(),
});

// PHASE 7: Standardized lead capture — intent → category → type → budget → location
export const leadRequirementsSchema = z.object({
    intent: z.enum(['buy', 'rent_lease'], { required_error: 'Intent is required (buy or rent_lease)' }),
    category: z.enum(['residential', 'commercial', 'agricultural'], { required_error: 'Category is required' }),
    type_slug: z.string().min(1, 'Property type is required').max(100),
    budget_min: z.number({ coerce: true }).nonnegative().optional(),
    budget_max: z.number({ coerce: true }).positive('Budget max must be positive').optional(),
    budget_type: z.enum(['one_time', 'per_month']).optional(),
    location: z.string().min(1, 'Location is required').max(200),
    name: z.string().max(100).optional(),
    phone: phoneField.optional(),
    email: z.string().email().optional().or(z.literal('')),
    amenities: z.array(z.string()).optional(),
    source: z.string().max(100).optional(),
});

export const postPropertySchema = z.object({
    intent: z.string().min(1, 'Intent is required'),
    location: z.string().min(1, 'Location is required').max(200),
    price: z.number({ coerce: true }).positive('Price must be positive'),
    phone: phoneField,
    category: z.string().optional(),
    type: z.string().optional(),
    category_id: z.string().optional(),
    sub_category_id: z.string().optional(),
    type_id: z.string().optional(),
    configuration_id: z.string().optional(),
    usage_type_id: z.string().optional(),
    investment_type_id: z.string().optional(),
    price_unit: z.string().optional(),
    specs: z.record(z.any()).optional(),
    features: z.record(z.any()).optional(),
    description: z.string().max(5000).optional(),
    furnishing: z.string().optional(),
    owner_name: z.string().max(100).optional(),
    email: z.string().email().optional().or(z.literal('')),
});
