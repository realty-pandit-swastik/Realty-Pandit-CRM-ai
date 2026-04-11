/**
 * Email Utility — Realty Pandit
 *
 * 99acres sends phone numbers in the email field for ~33% of leads.
 * Use isRealEmail() before storing or overwriting an email value.
 */

/**
 * Returns true if the given string looks like a real email address.
 * A "fake" email is any string that does not contain '@' — this covers
 * the common 99acres pattern where a phone number is placed in the email field.
 */
export function isRealEmail(value: string | null | undefined): boolean {
    if (!value) return false;
    return value.includes('@');
}
