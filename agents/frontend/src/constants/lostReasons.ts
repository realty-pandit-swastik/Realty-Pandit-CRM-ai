/**
 * Canonical lost-lead reasons (per dashboard spec). Stored verbatim in
 * contacts.lost_reason so the Lead Intelligence "Lost Reasons" widget can render
 * them directly. Keep in sync with the backend copy in routes/leads.ts.
 */
export const LOST_REASONS = [
  'Budget Issue',
  'Location Issue',
  'Property Mismatch',
  'Not Interested',
  'Purchased Elsewhere',
  'No Response',
  'Wrong Number',
  'Duplicate Lead',
  'Competitor Chosen',
  'Other',
] as const;

export type LostReason = typeof LOST_REASONS[number];
