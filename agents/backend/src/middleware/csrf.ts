import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';

export const CSRF_COOKIE_NAME = 'rp_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';

// Methods that do not mutate state are safe — CSRF not required
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Generate a cryptographically random 64-char hex CSRF token.
 */
export function generateCsrfToken(): string {
    return randomBytes(32).toString('hex');
}

/**
 * Set the CSRF cookie.
 * intentionally NOT HttpOnly — the browser JS must be able to read it
 * so it can attach it as the X-CSRF-Token request header.
 */
export function setCsrfCookie(res: Response, token: string): void {
    const isProduction = process.env.NODE_ENV === 'production';
    // Cross-subdomain scope so admin.realtypandit.in JS can read cookies set by api.realtypandit.in
    const cookieDomain = isProduction ? '.realtypandit.in' : undefined;
    res.cookie(CSRF_COOKIE_NAME, token, {
        httpOnly: false,     // JS must read this to send as header
        secure: isProduction,
        sameSite: 'lax',     // lax (not strict) so cookie flows on cross-origin XHR within same-site
        domain: cookieDomain,
        maxAge: 24 * 60 * 60 * 1000, // 24 h — match access token lifetime
        path: '/',
    });
}

/**
 * CSRF protection middleware — double-submit cookie pattern.
 *
 * Logic:
 * 1. Safe methods (GET/HEAD/OPTIONS) → always pass through.
 * 2. Requests that carry a Bearer token → skip CSRF. Browsers do NOT
 *    automatically add the Authorization header, so Bearer-authenticated
 *    requests are inherently CSRF-safe.
 * 3. Webhook routes → skip. WhatsApp / Razorpay sign their own payloads.
 * 4. Explicitly exempt public / pre-login routes.
 * 5. Everything else: require X-CSRF-Token header === rp_csrf cookie value.
 */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
    // (1) Safe HTTP methods
    if (SAFE_METHODS.has(req.method)) {
        return next();
    }

    // (2) Bearer-authenticated API clients — CSRF not applicable
    if (req.headers.authorization?.startsWith('Bearer ')) {
        return next();
    }

    // (3) Webhook routes — signed by the sending provider
    if (req.path.startsWith('/webhooks')) {
        return next();
    }

    // (4) Pre-login / public routes that don't have a CSRF token yet
    const csrfExempt = [
        '/auth/login',
        '/auth/setup',
        // /auth/refresh is CSRF-safe via cookie scoping alone:
        // rp_refresh_token has sameSite=lax + httpOnly + path=/auth/refresh, so
        // cross-origin POSTs can't trigger it. Required because the frontend's
        // refresh call uses raw axios (no CSRF interceptor) — see bug fix 2026-05-12.
        '/auth/refresh',
        '/auth/forgot-password',
        '/auth/verify-reset-otp',
        '/auth/resend-otp',
        '/auth/setup-password',
        '/auth/validate-setup-token',
        '/public/',
        '/user/',
        '/external/',
        // Public website "post property" chat is an anonymous, session-less, pre-login flow
        // (no auth cookie, so no rp_csrf cookie can exist → double-submit is impossible).
        // Same rationale as /public/ above. (Phase 1d v2 — 2026-05-24)
        '/api/chat/',
        '/csp-report',
        // Partner agent pre-login endpoints (self-signup + OTP)
        '/agent/register',
        '/agent/login-otp',
        '/agent/verify-otp',
        '/agent/login-password',
        '/agent/forgot-password',
        '/agent/verify-reset-otp',
        '/agent/reset-password',
    ];
    if (csrfExempt.some(p => req.path.startsWith(p))) {
        return next();
    }

    // (5) Double-submit cookie check
    const cookieToken: string | undefined = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        res.status(403).json({
            error: 'CSRF validation failed. Refresh the page and try again.',
        });
        return;
    }

    next();
}
