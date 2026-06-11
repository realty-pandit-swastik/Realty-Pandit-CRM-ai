/**
 * Symmetric secret encryption for at-rest credentials (e.g. per-agent email
 * app passwords — T9b, 2026-05-16).
 *
 * AES-256-GCM. The key is derived from JWT_SECRET via scrypt so we don't add a
 * new env var; rotating JWT_SECRET invalidates stored secrets (acceptable —
 * users simply re-enter their email password).
 *
 * Format: base64( salt(16) | iv(12) | authTag(16) | ciphertext ).
 */

import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || 'rp-fallback-dev-secret-change-me';

function deriveKey(salt: Buffer): Buffer {
    return crypto.scryptSync(SECRET, salt, 32);
}

export function encryptSecret(plain: string): string {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = deriveKey(salt);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([salt, iv, tag, enc]).toString('base64');
}

export function decryptSecret(payload: string): string {
    const raw = Buffer.from(payload, 'base64');
    const salt = raw.subarray(0, 16);
    const iv = raw.subarray(16, 28);
    const tag = raw.subarray(28, 44);
    const enc = raw.subarray(44);
    const key = deriveKey(salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** True if the string looks like our encrypted payload (best-effort guard). */
export function isEncrypted(s: string | null | undefined): boolean {
    if (!s) return false;
    try {
        return Buffer.from(s, 'base64').length > 44;
    } catch {
        return false;
    }
}
