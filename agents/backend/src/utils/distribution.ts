// src/utils/distribution.ts
//
// Pure inference of a lead's distribution route for the Team Performance distribution panel.
// The routing METHOD (round-robin vs sub-user match vs uploader) is NOT persisted anywhere —
// so "route" here = Partner / acquisition-channel / Other, which IS derivable from existing
// columns. The precise method split needs a new persisted column at the assignment sites.

export interface RouteContact {
  source?: string | null;
  lead_type?: string | null;
  referral_partner_id?: string | null;
}

const CHANNEL: Record<string, string> = {
  '99acres': '99acres',
  magicbricks: 'MagicBricks',
  housing: 'Housing',
  facebook: 'Facebook',
  website: 'Website',
  whatsapp: 'WhatsApp',
  voice: 'Voice',
  manual: 'Manual',
};

export function classifyRoute(c: RouteContact): string {
  if (c.lead_type === 'PARTNER_REFERRAL' || c.referral_partner_id) return 'Partner';
  const s = (c.source || '').toLowerCase();
  return CHANNEL[s] || 'Other';
}

// Phase 5C — the PERSISTED routing method (contacts.assignment_method), for the "By Routing Method"
// panel. Legacy rows (assigned before the migration) + unassigned contacts read as "Unknown (legacy)".
const METHOD_LABEL: Record<string, string> = {
  sub_user: 'Sub-user (listing owner)',
  uploader: 'Property uploader',
  round_robin: 'Round-robin',
  manager_review: 'Manager review',
  manual: 'Manual',
  partner: 'Partner',
  other: 'Other / default',
};

export function methodLabel(m: string | null | undefined): string {
  if (!m) return 'Unknown (legacy)';
  return METHOD_LABEL[m] || 'Other / default';
}
