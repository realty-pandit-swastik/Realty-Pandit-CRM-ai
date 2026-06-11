/**
 * GlitchTip / Sentry-SDK instrumentation.
 *
 * MUST be imported FIRST — before any other module — so that @sentry/node's
 * OpenTelemetry auto-instrumentation can patch http/express/prisma/etc.
 * before they are loaded.
 *
 * Imported as: `import './instrument';` from server.ts (line 1).
 */

import 'dotenv/config';
import * as SentrySDK from '@sentry/node';
import * as fs from 'fs';
import * as path from 'path';

// Accepts GLITCHTIP_DSN (new) or SENTRY_DSN (legacy server .env name) — remove the legacy fallback once all servers are migrated.
const GLITCHTIP_DSN = process.env.GLITCHTIP_DSN || process.env.SENTRY_DSN;

/**
 * Read the deploy release tag (git short SHA written by deploy script to .release.txt).
 * Falls back to GIT_SHA env var, then 'unknown'.
 */
function readRelease(): string {
    try {
        const releaseFile = path.join(__dirname, '..', '.release.txt');
        if (fs.existsSync(releaseFile)) {
            return fs.readFileSync(releaseFile, 'utf8').trim();
        }
    } catch {
        // ignore — fall through
    }
    return process.env.GIT_SHA || 'unknown';
}

/**
 * Mask phone-like strings: keep last 4 digits, mask the rest.
 * Matches international and Indian formats. Used in scrub paths only.
 */
function maskPhone(value: string): string {
    if (typeof value !== 'string') return value;
    const cleaned = value.replace(/[\s-]/g, '');
    if (!/^[+]?\d{10,15}$/.test(cleaned)) return value;
    const last4 = cleaned.slice(-4);
    return cleaned.slice(0, -4).replace(/./g, '*') + last4;
}

/**
 * Recursively scrub a request body / breadcrumb data object.
 * Mutates in-place — caller must own the object.
 */
const REDACT_KEYS = new Set([
    'password',
    'password_confirm',
    'new_password',
    'old_password',
    'token',
    'refresh_token',
    'access_token',
    'auth_token',
    'jwt',
    'otp',
    'csrf_token',
    'razorpay_payment_id',
    'razorpay_order_id',
    'razorpay_signature',
]);
const PHONE_KEY_HINTS = ['phone', 'mobile', 'whatsapp', 'msisdn', 'contact_number', 'phone_number'];

function scrubObject(obj: any, depth = 0): void {
    if (!obj || typeof obj !== 'object' || depth > 5) return;
    for (const key of Object.keys(obj)) {
        const lower = key.toLowerCase();
        if (REDACT_KEYS.has(lower)) {
            obj[key] = '[REDACTED]';
            continue;
        }
        if (PHONE_KEY_HINTS.some(h => lower.includes(h)) && typeof obj[key] === 'string') {
            obj[key] = maskPhone(obj[key]);
            continue;
        }
        if (typeof obj[key] === 'object') {
            scrubObject(obj[key], depth + 1);
        }
    }
}

if (GLITCHTIP_DSN) {
    SentrySDK.init({
        dsn: GLITCHTIP_DSN,
        environment: process.env.NODE_ENV || 'production',
        release: readRelease(),
        tracesSampleRate: 0.1,
        // Tag every event so this project can host multiple services (backend +
        // pipecat + android share a project — `service:` lets us filter).
        initialScope: { tags: { service: 'backend' } },
        integrations: [SentrySDK.httpIntegration()],
        beforeSend(event) {
            // Scrub headers
            if (event.request?.headers) {
                const h = event.request.headers as Record<string, any>;
                delete h['authorization'];
                delete h['cookie'];
                delete h['x-csrf-token'];
                delete h['x-api-key'];
            }
            // Scrub request body
            if (event.request?.data && typeof event.request.data === 'object') {
                scrubObject(event.request.data);
            }
            // Scrub extras / contexts
            if (event.extra) scrubObject(event.extra);
            if (event.contexts) scrubObject(event.contexts);
            return event;
        },
        beforeBreadcrumb(breadcrumb) {
            // Mask phone numbers in URLs (path params like /api/leads/+919876543210)
            if (breadcrumb.data?.url && typeof breadcrumb.data.url === 'string') {
                breadcrumb.data.url = breadcrumb.data.url.replace(
                    /([+]?\d{10,15})/g,
                    (m) => maskPhone(m),
                );
            }
            return breadcrumb;
        },
    });
}

export { SentrySDK };
