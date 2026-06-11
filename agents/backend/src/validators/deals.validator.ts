import { z } from 'zod';

export const createDealSchema = z.object({
    demand_contact_id: z.string().min(1, 'Demand contact ID is required'),
    demand_handler_type: z.enum(['PARTNER', 'TEAM_MEMBER', 'DIRECT'], { required_error: 'Handler type required' }),
    demand_handler_id: z.string().optional(),
    supply_contact_id: z.string().optional(),
    supply_handler_type: z.enum(['PARTNER', 'TEAM_MEMBER']).optional(),
    supply_handler_id: z.string().optional(),
    inventory_id: z.string().optional(),
    type: z.enum(['SALE', 'RENT'], { required_error: 'Transaction type required' }),
    source: z.string().max(100).optional(),
    demand_intent: z.string().max(50).optional(),
    demand_category: z.string().max(50).optional(),
    demand_type_slug: z.string().max(100).optional(),
    demand_property_type: z.string().max(100).optional(),
    demand_location: z.string().max(200).optional(),
    demand_budget_min: z.number({ coerce: true }).nonnegative().optional(),
    demand_budget_max: z.number({ coerce: true }).positive().optional(),
    demand_budget_type: z.string().max(50).optional(),
    demand_bedrooms: z.string().max(20).optional(),
    demand_notes: z.string().max(2000).optional(),
    demand_amenities: z.any().optional(),
});

export const matchPropertySchema = z.object({
    inventory_id: z.string().min(1, 'Inventory ID is required'),
    supply_contact_id: z.string().min(1, 'Supply contact ID is required'),
    supply_handler_type: z.enum(['PARTNER', 'TEAM_MEMBER'], { required_error: 'Supply handler type required' }),
    supply_handler_id: z.string().min(1, 'Supply handler ID is required'),
});

export const updateDealStatusSchema = z.object({
    status: z.enum(['NEW', 'MATCHED', 'QUALIFIED', 'MATCHING_APPOINTMENT', 'VISIT_SCHEDULED', 'VISITED', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD'], { // MATCHING_APPOINTMENT kept for legacy deal updates
        required_error: 'Status is required',
    }),
    reason: z.string().max(1000).optional(),
});

export const createDealQuerySchema = z.object({
    subject: z.string().min(1, 'Subject is required').max(200),
    message: z.string().min(1, 'Message is required').max(5000),
});

export const answerDealQuerySchema = z.object({
    answer: z.string().min(1, 'Answer is required').max(5000),
});

// Partner-submitted deal (simpler — BOTH customer name and phone optional: partners often won't share
// their client's identity. The lead is attributed to the partner and worked through them.)
export const partnerCreateDealSchema = z.object({
    customer_name: z.string().max(100).optional(),
    customer_phone: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number').optional(),
    type: z.enum(['SALE', 'RENT'], { required_error: 'Transaction type required' }),
    demand_intent: z.string().max(50).optional(),
    demand_category: z.string().max(50).optional(),
    demand_type_slug: z.string().max(100).optional(),
    demand_property_type: z.string().max(100).optional(),
    demand_location: z.string().max(200).optional(),
    demand_budget_min: z.number({ coerce: true }).nonnegative().optional(),
    demand_budget_max: z.number({ coerce: true }).positive().optional(),
    demand_budget_type: z.string().max(50).optional(),
    demand_notes: z.string().max(2000).optional(),
});
