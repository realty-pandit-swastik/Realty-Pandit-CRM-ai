import { resolveDemandTaxonomy } from '../utils/demand_taxonomy';
import { lakhsToRupees, reviewedContactFields } from './staff_call_processing';

/** Resolve extraction and shared-form edits through the same canonical demand contract. */
export async function approvedCallFields(data: Record<string, any>) {
    const resolved = await resolveDemandTaxonomy({
        property_type: data.propertyType, bhk: data.bhk,
        demand_taxonomy_node_id: data.demand_taxonomy_node_id,
    });
    if (data.demand_taxonomy_node_id && resolved.demand_taxonomy_node_id !== data.demand_taxonomy_node_id) {
        throw new Error('Unknown demand taxonomy node');
    }
    const schema = { ...(resolved.demand_schema_values || {}), ...(data.demand_schema_values || {}) };
    // Keep labels such as Studio and 5+ intact; legacy integer folding loses them.
    if (data.bhk !== undefined && !Object.prototype.hasOwnProperty.call(data, 'demand_schema_values')) {
        if (data.bhk) schema.bhk = String(data.bhk); else delete schema.bhk;
    }
    return {
        ...reviewedContactFields(data),
        demand_taxonomy_node_id: data.demand_taxonomy_node_id === null ? null : resolved.demand_taxonomy_node_id,
        demand_schema_values: schema,
        area_min: data.area_min, area_max: data.area_max,
        area_unit: data.area_unit, timeline: data.timeline,
        preferred_lat: data.preferred_lat, preferred_lng: data.preferred_lng,
        demand_budget_type: data.intent === 'RENT' || data.intent === 'LEASE' ? 'per_month' : 'one_time',
    };
}

export async function callMatchCriteria(data: Record<string, any>, tenantId: string) {
    const fields = await approvedCallFields(data);
    return { tenant_id: tenantId, intent: fields.intent, property_type: fields.property_type,
        preferred_location: fields.preferred_location,
        budget_min: lakhsToRupees(data.budgetMin), budget_max: lakhsToRupees(data.budgetMax),
        demand_taxonomy_node_id: fields.demand_taxonomy_node_id,
        demand_schema_values: fields.demand_schema_values,
        area_min: fields.area_min, area_max: fields.area_max, area_unit: fields.area_unit,
        preferred_lat: fields.preferred_lat, preferred_lng: fields.preferred_lng, budget_hard: true,
    };
}
