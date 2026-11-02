import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ACCESS_TOKEN_COOKIE } from './auth_cookie';
import { AuthService } from '../services/auth';
import { verifyMobileAccess } from '../services/mobile_session';

const auth = new AuthService();

// Some public workflows decode optional staff identity themselves; native revocation must cover those too.
export async function mobileCredentialBoundary(req: Request, res: Response, next: NextFunction) {
    const authorization = req.headers.authorization || '';
    // Inspect the first credential even when legacy routes would ignore trailing header components.
    const bearer = /^Bearer\s+(\S+)/i.exec(authorization)?.[1];
    for (const token of [req.cookies?.[ACCESS_TOKEN_COOKIE], bearer]) {
        if (typeof token !== 'string') continue;
        const claims = jwt.decode(token);
        if (!claims || typeof claims === 'string' || (!claims.mobile_session_id && !(typeof claims.token_use === 'string' && claims.token_use.startsWith('mobile_')))) continue;
        try {
            if (token === bearer && !/^Bearer\s+\S+$/i.test(authorization)) throw new Error('Malformed native authorization');
            await verifyMobileAccess(auth.verifyToken(token));
        } catch {
            return res.status(401).json({ error: 'Invalid or expired native session' });
        }
    }
    next();
}
