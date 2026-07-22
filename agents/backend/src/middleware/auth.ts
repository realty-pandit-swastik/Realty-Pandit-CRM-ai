
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth';
import { generateCsrfToken, setCsrfCookie, CSRF_COOKIE_NAME } from './csrf';

const authService = new AuthService();

/** Name of the HttpOnly access-token cookie set on login. */
export const ACCESS_TOKEN_COOKIE = 'rp_access_token';

const IS_PROD = process.env.NODE_ENV === 'production';
// Cross-subdomain cookie scope — admin.realtypandit.in must read cookies set by api.realtypandit.in
const COOKIE_DOMAIN = IS_PROD ? '.realtypandit.in' : undefined;

/**
 * Set the HttpOnly access-token cookie, optional refresh-token cookie,
 * and a JS-readable CSRF cookie.  Call after any successful login or refresh.
 */
export function setAuthCookies(res: Response, accessToken: string, refreshToken?: string): void {
    // One-time migration: clear any legacy cookies set without the domain attribute
    // (those are scoped to api.realtypandit.in only and cause cookie-overlap with the new ones)
    if (IS_PROD) {
        res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
        res.clearCookie('rp_refresh_token', { path: '/auth/refresh' });
        res.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
    }

    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: 'lax',
        domain: COOKIE_DOMAIN,
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
    });
    if (refreshToken) {
        res.cookie('rp_refresh_token', refreshToken, {
            httpOnly: true,
            secure: IS_PROD,
            sameSite: 'lax',
            domain: COOKIE_DOMAIN,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/auth/refresh',
        });
    }
    setCsrfCookie(res, generateCsrfToken());
}

/**
 * Clear all auth cookies — call on logout.
 */
export function clearAuthCookies(res: Response): void {
    const base = { httpOnly: true, secure: IS_PROD, sameSite: 'lax' as const, domain: COOKIE_DOMAIN, path: '/' };
    res.clearCookie(ACCESS_TOKEN_COOKIE, base);
    res.clearCookie('rp_refresh_token', { ...base, path: '/auth/refresh' });
    res.clearCookie(CSRF_COOKIE_NAME, { httpOnly: false, secure: IS_PROD, sameSite: 'lax', domain: COOKIE_DOMAIN, path: '/' });
}

// Extend Express Request to include agent info
declare global {
    namespace Express {
        interface Request {
            agent?: {
                id: string;
                email: string;
                role: string;
                tenant_id: string;
            };
        }
    }
}

/**
 * JWT authentication middleware — dual-mode.
 *
 * Priority order:
 *   1. HttpOnly cookie `rp_access_token`  (browser SPA, most secure)
 *   2. Authorization: Bearer <token>       (API clients, legacy frontend)
 *
 * Both paths verify the same JWT; the difference is where the token is stored.
 * This lets us migrate clients progressively to HttpOnly cookies without a
 * hard cut-over.
 */
/**
 * PARTNER DEFAULT-DENY ALLOW-LIST (2026-07-12).
 *
 * An external partner agent (`role: 'partner'`) logs into the SAME admin app but must be
 * locked to an explicit set of routes. This list is DEFAULT-DENY: a partner token may reach
 * ONLY the {method, path} patterns below; every other authMiddleware-protected route returns
 * 403. This is the security backbone — a forgotten/new endpoint can never leak to a partner.
 * Routes are added here ONE PAGE AT A TIME as each screen's endpoints are partner-hardened
 * (scoped to the partner's own data + run through the partner redaction).
 *
 * `originalUrl` is the full path from the domain root (e.g. `/api/deals/123`).
 */
const PARTNER_ALLOWLIST: Array<{ method: string; re: RegExp }> = [
    // Auth essentials (needed for the SPA to boot + log out).
    { method: 'GET', re: /^\/auth\/me(\/|$|\?)/ },
    { method: 'POST', re: /^\/auth\/logout(\/|$|\?)/ },
    { method: 'GET', re: /^\/auth\/csrf(\/|$|\?)/ },
    // --- Page 1: Inventory (hardened 2026-07-12) ---
    // List: partner-scoped (active catalogue + own listings) and partner-redacted in routes/inventory.ts.
    { method: 'GET', re: /^\/api\/inventory(\?|$)/ },
    // Single listing by UUID: active-or-own guard + partner redaction. (Named subroutes like
    // /api/inventory/filter-counts are deliberately NOT matched — UUID only.)
    { method: 'GET', re: /^\/api\/inventory\/[0-9a-fA-F-]{36}(\?|$)/ },
    // Add-Property wizard media/doc uploads. (The wizard's step endpoints — definition/next-step/
    // validate/summary — are public, and /api/workflow/commit does its own token decode where the
    // partner path is handled: referral_partner_id = partner, owning_manager_id = their coordinator,
    // status = pending_approval, and NEVER uploaded_by_agent_id.)
    { method: 'POST', re: /^\/api\/workflow\/upload-media(\?|$)/ },
    { method: 'POST', re: /^\/api\/workflow\/upload-video(\?|$)/ },
    { method: 'POST', re: /^\/api\/workflow\/upload-document(\?|$)/ },
    // Match Clients — scoped in routes/inventory.ts to the partner's OWN leads only (deals they
    // handle / leads they referred). They can never see a team or other-partner lead here.
    { method: 'GET', re: /^\/api\/inventory\/[0-9a-fA-F-]{36}\/matching-clients(\?|$)/ },
    // Share a property to THEIR client. Partner may share any ACTIVE listing or their own; the share
    // is recorded under their coordinator (PropertyShare.agent_id is an Agent FK).
    { method: 'POST', re: /^\/api\/inventory\/[0-9a-fA-F-]{36}\/share-to-client(\?|$)/ },
    { method: 'GET', re: /^\/api\/inventory\/[0-9a-fA-F-]{36}\/share-link(\?|$)/ },
    // Edit + documents on the partner's OWN listing only — every one of these is additionally guarded by
    // partnerMayMutateInventory() in routes/inventory.ts (403 unless the listing is theirs).
    { method: 'PATCH', re: /^\/api\/inventory\/[0-9a-fA-F-]{36}(\?|$)/ },
    { method: 'POST', re: /^\/api\/inventory\/[0-9a-fA-F-]{36}\/documents(\?|$)/ },
    { method: 'PATCH', re: /^\/api\/inventory\/[0-9a-fA-F-]{36}\/documents\/[0-9a-fA-F-]{36}(\?|$)/ },
    { method: 'DELETE', re: /^\/api\/inventory\/[0-9a-fA-F-]{36}\/documents\/[0-9a-fA-F-]{36}(\?|$)/ },
    { method: 'POST', re: /^\/api\/inventory\/[0-9a-fA-F-]{36}\/documents\/[0-9a-fA-F-]{36}\/share(\?|$)/ },
    // --- Page 2: Leads (hardened 2026-07-12) ---
    // Every one of these is additionally scoped/guarded in routes/leads.ts: the list is filtered to
    // `referral_partner_id in [partner + sub-agents]`, and each per-lead route 403s unless the partner
    // referred that lead. The phone pattern deliberately matches ONLY phone-shaped params, so team
    // subroutes (/pending-partner-claims, /bulk-reassign, /by-source, /search-agents…) stay DENIED.
    // Reassign / assign / bulk-reassign / partner-claims are intentionally NOT allow-listed.
    { method: 'GET', re: /^\/api\/leads\/recent-external(\?|$)/ },
    { method: 'GET', re: /^\/api\/leads\/search(\?|$)/ },
    // A lead key is NOT always a phone — partner-referral leads carry a `PENDING-…` placeholder
    // (the middleman model withholds the real number). So match any key EXCEPT the named team
    // subroutes below, which must stay denied (several of them only check `edit_inventory`, which
    // partners DO have — so the allow-list, not the permission, is what protects them).
    { method: 'GET', re: /^\/api\/leads\/(?!recent-external|search|by-source|pending-partner-claims|bulk-reassign)[^/?]+(\?|$)/i },
    { method: 'GET', re: /^\/api\/leads\/(?!recent-external|search|by-source|pending-partner-claims|bulk-reassign)[^/?]+\/(session|score)(\?|$)/i },
    { method: 'PATCH', re: /^\/api\/leads\/(?!recent-external|search|by-source|pending-partner-claims|bulk-reassign)[^/?]+(\?|$)/i },
    { method: 'PATCH', re: /^\/api\/leads\/(?!recent-external|search|by-source|pending-partner-claims|bulk-reassign)[^/?]+\/(status|requirements|mark-lost|delay-reason)(\?|$)/i },
    { method: 'POST', re: /^\/api\/leads\/(?!recent-external|search|by-source|pending-partner-claims|bulk-reassign)[^/?]+\/match(\?|$)/i },
    // Partner adds their OWN lead — routes/leads.ts forces referral_partner_id = the partner,
    // lead_type = PARTNER_REFERRAL, and assigns it to their coordinator (Agent FKs).
    { method: 'POST', re: /^\/api\/leads(\?|$)/ },
    // --- Page 3: Deal Pipeline (hardened 2026-07-13) ---
    // Every per-deal route below is additionally guarded by partnerOwnsDealOr403() in routes/deals.ts
    // (403 unless the deal is theirs: handled by them/their sub-agents, or from a lead they referred).
    // The list + pipeline stats are scoped via filters.partner_ids in services/deal_service.ts.
    // NOT allow-listed (team-only): PATCH /:id/reassign, commission-entries, POST /api/deals (create).
    { method: 'GET', re: /^\/api\/deals(\?|$)/ },
    { method: 'GET', re: /^\/api\/deals\/pipeline(\?|$)/ },
    { method: 'POST', re: /^\/api\/deals\/match-counts(\?|$)/ },
    { method: 'GET', re: /^\/api\/deals\/[0-9a-fA-F-]{36}(\?|$)/ },
    { method: 'GET', re: /^\/api\/deals\/[0-9a-fA-F-]{36}\/(timeline|queries|matched-inventory|property-shares)(\?|$)/ },
    { method: 'PATCH', re: /^\/api\/deals\/[0-9a-fA-F-]{36}\/(status|requirements|match)(\?|$)/ },
    { method: 'POST', re: /^\/api\/deals\/[0-9a-fA-F-]{36}\/(log-call|log-action|reminder|share-properties|share-next-property|book-appointment|visit-outcome|query)(\?|$)/ },
    // --- Partner Teams (2026-07-13) ---
    // OWNER-ONLY: each route additionally runs requirePartnerOwner() (ACTIVE + COMPANY + no parent),
    // so a SUB-AGENT that reaches them still gets 403. The allow-list is the outer fence only.
    { method: 'GET', re: /^\/api\/partner\/team(\?|$)/ },
    { method: 'GET', re: /^\/api\/partner\/team\/assignable(\?|$)/ },
    { method: 'POST', re: /^\/api\/partner\/team(\?|$)/ },
    { method: 'PATCH', re: /^\/api\/partner\/team\/[0-9a-fA-F-]{36}(\?|$)/ },
    // Assign a lead / deal / listing to one of the owner's OWN sub-agents (or unassign).
    // Each runs the entity's ownership guard FIRST, then assertPartnerOwnerCanAssign (ACTIVE COMPANY
    // OWNER + target must be their own ACTIVE sub-agent). A sub-agent hitting these still 403s.
    { method: 'POST', re: /^\/api\/leads\/(?!recent-external|search|by-source|pending-partner-claims|bulk-reassign)[^/?]+\/partner-assign(\?|$)/i },
    { method: 'POST', re: /^\/api\/deals\/[0-9a-fA-F-]{36}\/partner-assign(\?|$)/ },
    { method: 'POST', re: /^\/api\/inventory\/[0-9a-fA-F-]{36}\/partner-assign(\?|$)/ },
];

function isPartnerAllowed(req: Request): boolean {
    const path = (req.originalUrl || req.url).split('?')[0];
    const method = req.method.toUpperCase();
    return PARTNER_ALLOWLIST.some(r => r.method === method && r.re.test(path));
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    // Prefer HttpOnly cookie (set by /auth/login for browser clients)
    const cookieToken: string | undefined = req.cookies?.[ACCESS_TOKEN_COOKIE];

    // Fall back to Authorization Bearer header (API / legacy clients)
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

    const token = cookieToken ?? bearerToken;

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const decoded = authService.verifyToken(token);
        req.agent = decoded;
        // Partner default-deny: partners can reach ONLY the explicit allow-list above.
        if (decoded.role === 'partner' && !isPartnerAllowed(req)) {
            return res.status(403).json({ error: 'This section is not available for partner accounts.' });
        }
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

/**
 * Role-based access control middleware.
 * Must be used AFTER authMiddleware.
 */
export function requireRole(...allowedRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.agent) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!allowedRoles.includes(req.agent.role)) {
            return res.status(403).json({ error: `Access denied. Required role: ${allowedRoles.join(' or ')}` });
        }

        next();
    };
}

import { PERMISSIONS } from '../config/permissions';

/**
 * Permission-based access control middleware.
 * Must be used AFTER authMiddleware.
 */
export function checkPermission(permission: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.agent) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const role = req.agent.role;
        const rolePermissions = PERMISSIONS[role];

        if (!rolePermissions || !rolePermissions.includes(permission)) {
            return res.status(403).json({ error: `Access denied. Missing permission: ${permission}` });
        }

        next();
    };
}
