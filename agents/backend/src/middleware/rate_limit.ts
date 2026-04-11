import rateLimit from 'express-rate-limit';

// Auth routes - strict on /auth/login, but /auth/me is called frequently by the SPA
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/me' || req.path === '/refresh', // don't rate-limit token refreshes
});

// Public API - generous for website browsing (properties page makes multiple API calls per load)
export const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Webhooks - high traffic (WhatsApp sends many)
export const webhookLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Rate limit exceeded.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// External integrations - per API key
export const externalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'API rate limit exceeded. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Agent portal
export const agentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Internal API (authenticated staff) - high limit for admin panels with many concurrent API calls
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { error: 'Too many requests.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Workflow API - high volume (2 calls per step × 30+ steps per session)
export const workflowLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Chat Workflow API - conversational UI (1 call per message + uploads)
export const chatLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
