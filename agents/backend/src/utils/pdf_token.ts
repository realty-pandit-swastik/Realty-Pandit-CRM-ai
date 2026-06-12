import { createHmac } from 'crypto';

/**
 * Sign/verify the public per-inventory brochure-PDF link. The link is shared into
 * WhatsApp (and may be forwarded by a dealer to their buyer), so it must be
 * unguessable but need no login. The token binds the inventory id + variant + an
 * expiry, signed with a server secret — tampering any of the three invalidates it.
 */
const SECRET = process.env.PDF_LINK_SECRET || process.env.JWT_SECRET || 'rp-pdf-dev-secret';

export function signPdfToken(id: string, variant: string, exp: number): string {
    const payload = `${id}|${variant}|${exp}`;
    const sig = createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 32);
    return `${exp}.${sig}`;
}

export function verifyPdfToken(id: string, variant: string, token: string): boolean {
    const [expStr, sig] = (token || '').split('.');
    const exp = Number(expStr);
    if (!exp || !sig || exp < Math.floor(Date.now() / 1000)) return false;
    return signPdfToken(id, variant, exp) === `${exp}.${sig}`;
}
