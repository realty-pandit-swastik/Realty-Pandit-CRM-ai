import { Request, Response, NextFunction } from 'express';
import { AgentAuthService } from '../services/agent_auth';
import logger from '../utils/logger';

const agentAuthService = new AgentAuthService();

// Extend Express Request to include external agent data
declare global {
    namespace Express {
        interface Request {
            externalAgent?: {
                agent_id: string;
                phone: string;
                name: string;
                package_type: 'FREE' | 'PRO' | 'ADVANCE_PRO';
                status: string;
                role: string;
            };
        }
    }
}

/**
 * Middleware to authenticate agent via JWT
 * Usage: Add to any route that requires agent authentication
 */
export const agentAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No authorization token provided' });
        }

        const token = authHeader.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Invalid authorization format' });
        }

        // Verify token
        const decoded = agentAuthService.verifyAgentToken(token);

        // Check if agent still exists and is active
        const agent = await agentAuthService.getAgentById(decoded.agent_id);
        if (!agent) {
            return res.status(401).json({ error: 'Agent not found' });
        }

        if (agent.status === 'SUSPENDED') {
            return res.status(403).json({ error: 'Your account has been suspended' });
        }

        if (agent.status === 'EXPIRED') {
            return res.status(403).json({ error: 'Your subscription has expired. Please renew.' });
        }

        // Attach agent data to request
        req.externalAgent = {
            agent_id: agent.id,
            phone: agent.phone_number,
            name: agent.name,
            package_type: agent.package_type,
            status: agent.status,
            role: 'EXTERNAL_AGENT'
        };

        next();
    } catch (error) {
        logger.error('[AgentAuth] Middleware error:', (error as Error).message);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

/**
 * Middleware to require specific package type
 * Usage: requirePackage('PRO') or requirePackage(['PRO', 'ADVANCE_PRO'])
 */
export const requirePackage = (allowedPackages: string | string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.externalAgent) {
            return res.status(401).json({ error: 'Agent not authenticated' });
        }

        const packages = Array.isArray(allowedPackages) ? allowedPackages : [allowedPackages];

        if (!packages.includes(req.externalAgent.package_type)) {
            return res.status(403).json({
                error: `This feature requires ${packages.join(' or ')} package`,
                current_package: req.externalAgent.package_type,
                upgrade_url: '/agent/subscription'
            });
        }

        next();
    };
};

/**
 * Middleware to check if agent has reached listing limit
 * Usage: Add before POST /agent/inventory
 */
export const checkListingLimit = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.externalAgent) {
            return res.status(401).json({ error: 'Agent not authenticated' });
        }

        const canAdd = await agentAuthService.checkListingLimit(req.externalAgent.agent_id);

        if (!canAdd) {
            const agent = await agentAuthService.getAgentById(req.externalAgent.agent_id);
            return res.status(403).json({
                error: 'Listing limit reached',
                current_package: req.externalAgent.package_type,
                listing_limit: agent.listing_limit,
                message: 'You have reached your listing limit. Upgrade to add more properties.',
                upgrade_url: '/agent/subscription'
            });
        }

        next();
    } catch (error) {
        logger.error('[AgentAuth] Listing limit check error:', (error as Error).message);
        return res.status(500).json({ error: 'Failed to check listing limit' });
    }
};

/**
 * Middleware to block FREE agents from accessing buyer contact info
 * Sets a flag on request that API routes can use to mask data
 */
export const maskBuyerDataForFree = (req: Request, res: Response, next: NextFunction) => {
    if (req.externalAgent && req.externalAgent.package_type === 'FREE') {
        // Set a flag that response handlers can check
        (req as any).maskBuyerInfo = true;
    }
    next();
};
