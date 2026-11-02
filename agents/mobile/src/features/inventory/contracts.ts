import { ApiError, array, number, object, optionalString, string } from '../../api/client';
export type Value = string | number | boolean | null | Value[] | { [key: string]: Value };
export function valueFrom(value: unknown): Value {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(valueFrom);
  return Object.fromEntries(Object.entries(object(value)).map(([key, v]) => [key, valueFrom(v)]));
}
export const fieldLabel = (key: string) => key === 'customer_price' ? 'Owner asking price (internal)' : key === 'display_price' ? 'Public display price' : humanize(key);
export const humanize = (key: string) => key.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
export function display(value: Value | undefined): string {
  if (value === undefined) return 'Restricted or unavailable';
  if (value === null || value === '') return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(display).join(' · ') : 'None';
  if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${humanize(k)}: ${display(v)}`).join('\n') || 'None';
  return String(value);
}
export type PropertyDocument = { id: string; title: string; mimeType: string; type?: string; fileName?: string; size?: number; createdAt?: string };
export type Actions = { edit: boolean; documents: boolean; share: boolean; transfer: boolean; ownership: boolean; delete: boolean; approve: boolean };
export type Property = { id: string; title: string; location?: string; status?: string; type?: string; intent?: string; price?: string; demandPrice?: string; displayPrice?: string; images: string[]; videos: string[];
  customerText?: string; documents?: PropertyDocument[]; canEdit: boolean; actions: Actions; restricted: string[]; fields: Record<string, Value>; specs: Record<string, Value> };
export const detailGroups: Record<string, readonly string[]> = {
  Classification: ['category', 'type', 'property_category', 'property_sub_category', 'property_type_link', 'property_configuration', 'flat_property_type', 'taxonomy_node', 'usage_type', 'investment_type', 'intent', 'status'],
  'Address and floors': ['flat_no', 'plot_no', 'apartment_name', 'full_address', 'location', 'sub_locality', 'locality', 'city', 'district', 'state', 'pincode', 'latitude', 'longitude', 'floor_number', 'floor_label', 'display_floor'],
  'Pricing and property': ['customer_price', 'display_price', 'price', 'price_unit', 'description', 'renovated', 'roof_rights', 'pre_rented', 'pre_rented_monthly_rent', 'commercial_use', 'commercial_use_type'],
  'People and collaboration': ['owner_name', 'contact', 'key_holder_type', 'key_holder_name', 'key_holder_phone', 'uploader_name', 'uploader_phone', 'uploader_email', 'uploaded_by_agent', 'assigned_agent', 'reference_agent', 'referral_partner', 'owning_manager', 'source', 'ownership_type', 'upload_source', 'lead_reference', 'shared_with_ids'],
  'Record and engagement': ['display_id', 'slug', 'completion_pct', 'is_enriched', 'needs_taxonomy_review', 'needs_owner_fix', 'created_at', 'updated_at', 'stats', '_count'],
};
export function propertyFrom(value: unknown): Property {
  const row = object(value), fields: Record<string, Value> = {};
  for (const key of Object.values(detailGroups).flat()) if (row[key] !== undefined) fields[key] = valueFrom(row[key]);
  const taxonomy = row.taxonomy_node ? object(row.taxonomy_node) : row.flat_property_type ? object(row.flat_property_type) : null;
  const canEdit = row.can_edit === true, a = row.actions === undefined ? {} : object(row.actions);
  return { id: string(row.id), title: optionalString(row.display_id) || optionalString(row.title) || 'Property', location: optionalString(row.full_address) || optionalString(row.location) || optionalString(row.locality),
    status: optionalString(row.status), type: taxonomy ? optionalString(taxonomy.name) : optionalString(row.type), intent: optionalString(row.intent), price: optionalString(row.formatted_price), demandPrice: optionalString(row.formatted_demand_price), displayPrice: optionalString(row.formatted_display_price),
    images: row.media_urls ? array(row.media_urls, string).filter(url => !isVideo(url)) : [], videos: [...new Set([...(row.video_urls ? array(row.video_urls, string) : []), ...(row.media_urls ? array(row.media_urls, string).filter(isVideo) : [])])],
    canEdit, customerText: optionalString(row.customer_share_text), restricted: row.restricted_fields ? array(row.restricted_fields, string) : [], actions: { edit: a.edit === true, documents: row.can_access_documents === true, share: a.share === true, transfer: a.transfer === true, ownership: a.ownership === true, delete: a.delete === true, approve: a.approve === true }, fields,
    specs: row.specs == null ? {} : Object.fromEntries(Object.entries(object(row.specs)).map(([k, v]) => [k, valueFrom(v)])),
    documents: row.documents === undefined ? undefined : array(row.documents, entry => { const d = object(entry); const doc: PropertyDocument = { id: string(d.id), title: string(d.title), mimeType: string(d.mime_type) };
      if (d.doc_type != null) doc.type = string(d.doc_type); if (d.file_name != null) doc.fileName = string(d.file_name); if (d.file_size != null) doc.size = number(d.file_size); if (d.created_at != null) doc.createdAt = string(d.created_at); return doc; }),
  };
}
export function propertiesFrom(value: unknown) { const data = object(value); return { rows: array(data.data, propertyFrom), total: number(data.total) }; }
export const isVideo = (url: string) => /\.(mp4|mov|webm|avi|mkv|m4v|3gp|ogg)(?:[?#]|$)/i.test(url);
export function mediaUri(origin: string, path: string): string | undefined {
  try { const url = new URL(path, origin); return !url.username && !url.password && (url.protocol === 'https:' || url.origin === origin) && !url.pathname.includes('/documents/') ? url.href : undefined; } catch { return undefined; }
}
export type Filter = Record<string, string>;
export function inventoryPath(page: number, search: string, filters: Filter) {
  const q = new URLSearchParams({ page: String(page), limit: '25', all: 'true', search, ...filters });
  return `/api/inventory?${q}`;
}
export function ensureSaved(value: unknown) {
  try {
    const row = object(value);
    if (row.error || row.success === false || !(row.success === true || typeof row.id === 'string' || typeof row.inventory_id === 'string' || typeof row.message === 'string' || Array.isArray(row.shared_with_ids) || Array.isArray(row.media_urls))) throw new Error('Unconfirmed save');
    return row;
  } catch { throw new ApiError('The change could not be confirmed. Refresh the record before retrying.', 0, true); }
}
export function savedIdentifier(value: unknown, keys: string[] = ['id']): string {
  const row = ensureSaved(value);
  for (const key of keys) if (typeof row[key] === 'string' && row[key].trim()) return row[key];
  throw new ApiError('The save outcome is unknown. Check the current records before retrying.', 0, true);
}
