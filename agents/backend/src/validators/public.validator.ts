import { z } from 'zod';

const phoneRegex = /^\+?[1-9]\d{7,14}$/;

export const contactSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    phone: z.string().regex(phoneRegex, 'Invalid phone number'),
    email: z.string().email().optional().or(z.literal('')),
    message: z.string().max(1000).optional(),
    property_id: z.string().optional(),
    intent: z.string().optional(),
});

export const leadSchema = z.object({
    name: z.string().max(100).optional(),
    phone: z.string().regex(phoneRegex, 'Invalid phone number').optional(),
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

export const scheduleVisitSchema = z.object({
    property_id: z.string().min(1, 'Property ID is required'),
    name: z.string().min(1, 'Name is required').max(100),
    phone: z.string().regex(phoneRegex, 'Invalid phone number'),
    email: z.string().email().optional().or(z.literal('')),
    preferred_date: z.string().optional(),
    preferred_time: z.string().optional(),
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
    phone: z.string().regex(phoneRegex, 'Invalid phone number').optional(),
    email: z.string().email().optional().or(z.literal('')),
    amenities: z.array(z.string()).optional(),
    source: z.string().max(100).optional(),
});

export const postPropertySchema = z.object({
    intent: z.string().min(1, 'Intent is required'),
    location: z.string().min(1, 'Location is required').max(200),
    price: z.number({ coerce: true }).positive('Price must be positive'),
    phone: z.string().regex(phoneRegex, 'Invalid phone number'),
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
