
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
