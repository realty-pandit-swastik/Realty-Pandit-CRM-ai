/**
 * Canonical active-lead delay (stagnation) reasons — why an open lead is stuck
 * (per dashboard spec). Stored verbatim in contacts.stagnation_reason so the
 * Lead Intelligence "Delay Reasons" widget renders them directly. Keep in sync
 * with the backend copy in routes/leads.ts.
 */
export const DELAY_REASONS = [
  'Client Not Responding',
  'Waiting For Budget Approval',
  'Waiting For Family Decision',
  'Property Not Available',
  'Site Visit Pending',
  'Loan Approval Pending',
  'Documentation Pending',
  'Future Purchase Plan',
  'Negotiation Ongoing',
  'Other',
] as const;

export type DelayReason = typeof DELAY_REASONS[number];
