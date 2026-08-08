/**
 * Verify Meta's `X-Hub-Signature-256` on the Facebook/Instagram webhook.
 *
 * WHY (2026-08-07): `/webhooks/facebook` accepted anything. `FB_APP_SECRET` was set in the
 * environment but never read anywhere in `src/` — so anyone who knew the URL could POST a
 * fake comment or DM and create a CRM lead (the social handlers write Contacts, Deals and
 * fire new-lead alerts). The WhatsApp route is not exposed this way because it is queued
 * behind a message-id dedup, but the social route ran the handlers directly.
 *
 * ⚠ SHIPS IN LOG-ONLY MODE. `META_SIGNATURE_ENFORCE` (default off) decides whether a bad
 * signature is rejected. Enforcing from day one risks black-holing every real webhook if
 * `FB_APP_SECRET` is wrong or `req.rawBody` is not populated — and a silently dead webhook
 * is exactly the failure mode this whole batch exists to fix. Watch the logs for a day,
 * confirm 100% match, then flip.
 *
 * Depends on the raw body captured by `express.json({ verify })` in app.ts (`req.rawBody`).
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import logger from '../utils/logger';

export function verifyMetaSignature(req: Request, res: Response, next: NextFunction): void {
    // Only POST payloads are signed. Meta's GET verification handshake carries no signature —
    // verifying it would 403 the handshake and break webhook re-verification. It is already
    // gated by hub.verify_token in the route itself.
    if (req.method !== 'POST') return next();

    const enforce = process.env.META_SIGNATURE_ENFORCE === 'true';
    const secret = process.env.FB_APP_SECRET;
    const header = req.get('x-hub-signature-256');
    const raw = (req as any).rawBody as Buffer | undefined;

    const fail = (reason: string): void => {
        if (enforce) {
            logger.error(`[MetaSig] REJECTED webhook — ${reason}`);
            res.sendStatus(403);
            return;
        }
        logger.warn(`[MetaSig] would reject (log-only mode) — ${reason}`);
        next();
    };

    if (!secret) return fail('FB_APP_SECRET not set');
    if (!header) return fail('no x-hub-signature-256 header');
    if (!raw || !raw.length) return fail('raw body unavailable (check express.json verify hook)');

    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');

    // timingSafeEqual throws on length mismatch, so guard first.
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!ok) return fail('signature mismatch');

    logger.debug('[MetaSig] signature OK');
    next();
}
