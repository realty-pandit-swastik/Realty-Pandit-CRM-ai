// src/middleware/require_super_boss.ts
//
// Thin guard for endpoints that are locked to the super_boss role (reassignment,
// manager deactivation, global overrides). Must run AFTER authMiddleware so that
// req.agent is populated.
//
// We already have the generic `requireRole('super_boss')` in auth.ts; this file
// exists as a named single-purpose middleware so route handlers read clearly:
//
//   router.post('/partners/:id/reassign', authMiddleware, requireSuperBoss, ...)

import { Request, Response, NextFunction } from 'express';

export function requireSuperBoss(req: Request, res: Response, next: NextFunction) {
    if (!req.agent) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.agent.role !== 'super_boss') {
        return res.status(403).json({ error: 'super_boss role required' });
    }
    next();
}
