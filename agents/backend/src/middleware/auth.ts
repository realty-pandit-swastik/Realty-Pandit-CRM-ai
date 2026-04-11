
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth';

const authService = new AuthService();

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
 * JWT authentication middleware.
 * Extracts and verifies the token from Authorization header.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = authService.verifyToken(token);
        req.agent = decoded;
        next();
    } catch (error) {
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
