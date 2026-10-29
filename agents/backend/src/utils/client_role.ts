/**
 * Client-role vocabulary — who a person IS (Contact.client_role, primary) or the role they
 * play FOR ONE ENQUIRY (Transaction.client_role_override, temporary).
 *
 * Codes and labels come from data/contact_catalog.ts, also imported by the CRM.
 * Existing identifiers (including CHOKIDAR) remain unchanged.
 *
 * Deliberately separate from ContactType, which is load-bearing for lead queues, visibility
 * scopes and filters (BUYER/TENANT/...). A CHECK constraint / Prisma enum can replace the
 * code-level validation later; for now every writer MUST go through parseClientRole so no
 * arbitrary string reaches the column or the tile label.
 */
import { CONTACT_ROLES } from '../data/contact_catalog';
export const VALID_CLIENT_ROLES = CONTACT_ROLES.map(role => role.code);

export type ClientRole = typeof VALID_CLIENT_ROLES[number];

/**
 * Normalise a caller-supplied role to an allow-listed code, or null when absent/invalid.
 * Writers store the return value (or omit the field when null) — never the raw input.
 */
export function parseClientRole(raw: unknown): ClientRole | null {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const code = raw.trim().toUpperCase().slice(0, 40);
    return (VALID_CLIENT_ROLES as readonly string[]).includes(code) ? (code as ClientRole) : null;
}
