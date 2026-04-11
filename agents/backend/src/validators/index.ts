import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Express middleware factory for Zod validation.
 * Validates req.body against the provided schema.
 */
export function validate(schema: z.ZodType) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);
        if (result.success) {
            req.body = result.data;
            next();
        } else {
            const messages = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`);
            res.status(400).json({
                error: 'Validation failed',
                details: messages,
            });
        }
    };
}
