/**
 * Per-member Google account OAuth2 (2026-05-18).
 *
 * A team member connects their OWN personal Google account from their CRM
 * profile so their self-set deal reminders (T8) and visit appointments also
 * land in their Google Calendar + Google Tasks (built P2/P3).
 *
 * P1 = the OAuth handshake + at-rest refresh-token storage only.
 *
 * Lightweight on purpose: this file uses only `google-auth-library`
 * (OAuth2Client + id-token verification). The heavier `googleapis` package
 * (Calendar v3 / Tasks v1) is added in P2 where the actual API calls live —
 * keeping the P1 deploy surface small.
 *
 * Secrets: the Google refresh token is AES-256-GCM ciphertext via
 * utils/crypto (same pattern as the T9b per-agent email password). It is
 * NEVER returned to the client.
 *
 * See docs/plans/2026-05-18-google-calendar-task-reminder-sync.md
 */

import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { decryptSecret } from '../utils/crypto';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
// Calendar/Tasks "connect" callback (distinct from the P1b Sign-In redirect).
const OAUTH_REDIRECT =
    process.env.GOOGLE_OAUTH_REDIRECT ||
    'https://api.realtypandit.in/api/team/google/callback';
// P1b "Sign in with Google" callback — a DIFFERENT redirect URI (must match
// the token exchange exactly, and is registered separately in the OAuth client).
const SIGNIN_REDIRECT =
    process.env.GOOGLE_SIGNIN_REDIRECT ||
    'https://api.realtypandit.in/auth/google/callback';

const JWT_SECRET = process.env.JWT_SECRET || 'rp-fallback-dev-secret-change-me';

/**
 * Minimal scopes (least privilege):
 *  - calendar.events : create/patch/delete the member's own events only
 *  - tasks           : the checklist mirror of each reminder
 *  - openid/email/profile : to capture which Gmail they connected
 */
export const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/tasks',
    'openid',
    'email',
    'profile',
];

/** True only when the prod env actually carries the OAuth client creds. */
export function isGoogleOAuthConfigured(): boolean {
    return Boolean(CLIENT_ID && CLIENT_SECRET);
}

/** A fresh OAuth2 client bound to the connect-callback redirect URI. */
function newOAuthClient(): OAuth2Client {
    return new OAuth2Client(CLIENT_ID, CLIENT_SECRET, OAUTH_REDIRECT);
}

// ---------------------------------------------------------------------------
// Signed `state` — carries the agent id through the *public* callback and
// doubles as CSRF protection. Short-lived, purpose-scoped so it can never be
// confused with (or replayed as) a normal auth token.
// ---------------------------------------------------------------------------

const STATE_PURPOSE = 'google_connect';

export function signState(agentId: string): string {
    return jwt.sign({ aid: agentId, p: STATE_PURPOSE }, JWT_SECRET, {
        expiresIn: '10m',
    });
}

export function verifyState(state: string): { agentId: string } {
    const decoded: any = jwt.verify(state, JWT_SECRET);
    if (decoded?.p !== STATE_PURPOSE || !decoded?.aid) {
        throw new Error('Invalid OAuth state');
    }
    return { agentId: String(decoded.aid) };
}

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

/**
 * The Google consent URL the member is sent to.
 * `access_type=offline` + `prompt=consent` force a refresh token every time
 * (without prompt, Google omits it on re-consent and sync would silently die).
 */
export function buildConnectUrl(state: string): string {
    return newOAuthClient().generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: GOOGLE_SCOPES,
        include_granted_scopes: true,
        state,
    });
}

export interface ExchangedTokens {
    refreshToken: string;
    email: string | null;
}

/**
 * Exchange the authorization `code` for tokens. Returns the refresh token
 * (plaintext — caller encrypts before storing) and the connected Gmail
 * address (from the id_token, no extra API call).
 */
export async function exchangeCode(code: string): Promise<ExchangedTokens> {
    const client = newOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
        // Happens if the user previously consented and Google declined to
        // re-issue one. prompt=consent above should prevent this; surface it
        // loudly so the route can tell the member to retry.
        throw new Error(
            'Google did not return a refresh token — please disconnect and reconnect.'
        );
    }

    let email: string | null = null;
    if (tokens.id_token) {
        try {
            const ticket = await client.verifyIdToken({
                idToken: tokens.id_token,
                audience: CLIENT_ID,
            });
            email = ticket.getPayload()?.email ?? null;
        } catch {
            // Non-fatal: we still have a working refresh token; email is cosmetic.
            email = null;
        }
    }

    return { refreshToken: tokens.refresh_token, email };
}

/**
 * Build an authenticated OAuth2 client for an agent from their stored
 * (encrypted) refresh token. Used by P2/P3 to call Calendar/Tasks.
 * Throws if the ciphertext can't be decrypted (e.g. JWT_SECRET rotated).
 */
export function getAuthedClient(refreshTokenCipher: string): OAuth2Client {
    const refreshToken = decryptSecret(refreshTokenCipher);
    const client = newOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    return client;
}

/**
 * Best-effort revoke at Google on disconnect. Never throws — the caller still
 * wipes the local columns regardless of Google's response.
 */
export async function revokeRefreshToken(refreshTokenCipher: string): Promise<void> {
    try {
        const refreshToken = decryptSecret(refreshTokenCipher);
        await newOAuthClient().revokeToken(refreshToken);
    } catch {
        /* token may already be invalid/revoked — ignore */
    }
}

// ===========================================================================
// P1b — "Sign in with Google" (identity only; no Calendar/Tasks).
//
// A member can only sign in this way AFTER they connected Google from their
// profile (gate enforced in AuthService.loginByGoogleEmail by requiring a
// stored google_refresh_token). We only need their email here, so request the
// minimal identity scopes and use the separate sign-in redirect URI.
// ===========================================================================

const SIGNIN_SCOPES = ['openid', 'email', 'profile'];
const SIGNIN_STATE_PURPOSE = 'google_signin';

function newSignInClient(): OAuth2Client {
    return new OAuth2Client(CLIENT_ID, CLIENT_SECRET, SIGNIN_REDIRECT);
}

/** CSRF state for the sign-in flow (no agent id — identity comes from Google). */
export function signSignInState(): string {
    return jwt.sign({ p: SIGNIN_STATE_PURPOSE }, JWT_SECRET, { expiresIn: '10m' });
}

export function verifySignInState(state: string): void {
    const decoded: any = jwt.verify(state, JWT_SECRET);
    if (decoded?.p !== SIGNIN_STATE_PURPOSE) {
        throw new Error('Invalid sign-in state');
    }
}

export function buildSignInUrl(state: string): string {
    return newSignInClient().generateAuthUrl({
        scope: SIGNIN_SCOPES,
        prompt: 'select_account',
        state,
    });
}

/** Exchange the sign-in code; returns the verified Google email (lowercased). */
export async function exchangeSignInCode(code: string): Promise<string | null> {
    const client = newSignInClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) return null;
    const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: CLIENT_ID,
    });
    const payload = ticket.getPayload();
    // Require a verified email so a member can't be impersonated via an
    // unverified Google address.
    if (!payload?.email || payload.email_verified === false) return null;
    return payload.email.toLowerCase();
}
