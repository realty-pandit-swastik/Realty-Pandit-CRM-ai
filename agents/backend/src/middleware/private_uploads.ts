import path from 'path';
import { Request, Response, NextFunction } from 'express';

/** Property paperwork is served by authorized document routes, never the public media tree. */
export function blockPrivateUploads(req: Request, res: Response, next: NextFunction) {
    let pathname: string;
    try { pathname = path.posix.normalize(decodeURIComponent(req.path)); }
    catch { return res.sendStatus(400); }
    if (/^\/properties\/[^/]+\/documents(?:\/|$)/i.test(pathname)) return res.sendStatus(404);
    next();
}
