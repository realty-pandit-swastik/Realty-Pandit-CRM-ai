
import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import prisma from './db';
import webhookRoutes from './routes/webhooks';
import apiRoutes from './routes/api';
import leadRoutes from './routes/leads';
import inventoryRouter from './routes/inventory';
import authRoutes from './routes/auth';
import publicRoutes from './routes/public';
import externalLeadRoutes from './routes/external_leads';
import agentRoutes from './routes/agent';
import partnerTeamRoutes from './routes/partner_team';
import builderRoutes from './routes/builder'; // PHASE 14: Builder Backend API
import nineNineAcresRoutes from './integrations/99acres';
import magicBricksRoutes from './integrations/magicbricks';
import housingRoutes from './integrations/housing';
import facebookRoutes from './integrations/facebook'; // Facebook Lead Ads webhook
import masterRoutes from './routes/master';
import staffCallRoutes from './routes/staff_calls';
import classificationRoutes from './routes/classification';
import taxonomyRoutes, { adminTaxonomyRouter } from './routes/taxonomy';
import userAuthRoutes from './routes/user_auth';
import aiChatRoutes from './routes/ai_chat';
import authOTPRoutes from './routes/auth_otp'; // Website chat OTP authentication
import calendarRoutes from './routes/calendar'; // Calendar system
import emailRoutes from './routes/email'; // Email system (Panditji AI)
import teamRoutes from './routes/team'; // Team management + bulk upload
import agentDashboardRoutes from './routes/agent_dashboard'; // Multi-agent dashboard
import transactionRoutes from './routes/transactions'; // Transaction Engine
import dealRoutes from './routes/deals'; // Deal Management (Phase 7)
import omnidimWebhookRouter from './routes/omnidim'; // Omnidim outbound calling webhook (DEC-003)
import workflowRoutes from './routes/workflow'; // Unified Inventory Workflow
import chatWorkflowRoutes from './routes/chat_workflow'; // Chat-based Inventory Workflow
import analyticsRoutes from './routes/analytics'; // Analytics for dashboard tabs
import reportsRoutes from './routes/reports'; // Comprehensive reports system
import workflowAutomationRoutes from './routes/workflows'; // Workflow automation system (Phase 3.1)
import marketingRoutes from './routes/marketing'; // Marketing Campaign & Template Builder (Phase 3.2)
import tasksRoutes from './routes/tasks'; // Task & Project Management (Phase 3.3)
import workflowTaskRoutes from './routes/workflow_tasks'; // Guided Lead-to-Deal Workflow Engine
import notificationsRoutes from './routes/notifications'; // Notification Preferences (Phase 4.2)
import agentLeadRoutes from './routes/agent_leads'; // Agent/Dealer buyer lead access
import integrationRoutes from './routes/integrations'; // Integration sync management (99acres poll API)
import paymentRoutes, { razorpayWebhookRouter } from './routes/payments'; // Razorpay Payment Gateway
import internalToolsRouter from './routes/internal_tools'; // Panditji voice bot internal tool endpoints
import { loginLimiter, authLimiter, publicLimiter, webhookLimiter, externalLimiter, agentLimiter, apiLimiter, workflowLimiter, chatLimiter } from './middleware/rate_limit';
import { verifyMetaSignature } from './middleware/verify_meta_signature';
import { csrfMiddleware } from './middleware/csrf';
import { requestLogger } from './middleware/request_logger';
import logger from './utils/logger';
import { errorHandler } from './middleware/error_handler';
import * as SentrySDK from '@sentry/node';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';

// GlitchTip is initialized in instrument.ts (loaded as the first import in server.ts).
// This module only references the SDK to mount the Express error handler.
const GLITCHTIP_DSN = process.env.GLITCHTIP_DSN || process.env.SENTRY_DSN;

const app = express();
app.set('trust proxy', 'loopback');

// Initialize Workflow Automation Engine (Phase 3.1)
import workflowEngine from './services/workflow_engine';
workflowEngine.initializeWorkflowEngine();

// Request ID and logging
app.use(requestLogger);

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.realtypandit.in", "https://crm.realtypandit.in", "https://agents.realtypandit.in"],
        },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS - strict whitelist
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [
        'http://localhost:3001',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:7575',
        'http://localhost:7071',
        'https://admin.realtypandit.in',
        'http://admin.realtypandit.in',
        'https://realtypandit.in',
        'http://realtypandit.in',
        'https://www.realtypandit.in',
        'http://www.realtypandit.in',
        'https://agents.realtypandit.in', // Marketing / Agent+Builder portal
        'http://agents.realtypandit.in',
        'http://72.62.231.224:5173',  // Production admin IP
        'http://72.62.231.224:3000',  // Production website IP
      ];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: Origin ${origin} not allowed`));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // X-CSRF-Token: required for double-submit CSRF protection
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-CSRF-Token'],
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
}));

// Cookie parser — must come before CSRF middleware and auth middleware
app.use(cookieParser());

// CSRF protection — double-submit cookie pattern
// Exempts: safe methods, Bearer-authenticated requests, webhooks, public routes
app.use(csrfMiddleware);

// Response compression
app.use(compression());

// Body parsers — preserve raw body so the WhatsApp webhook forwarder can pass
// Meta's signed payload through to Pipecat without breaking the HMAC.
app.use(express.json({
    limit: '10mb',
    verify: (req: any, _res, buf: Buffer) => {
        req.rawBody = buf;
    },
}));
app.use(express.urlencoded({ extended: true }));

// Handle malformed JSON bodies — must come right after body parsers
app.use((err: any, req: any, res: any, next: any) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON in request body', detail: err.message });
    }
    next(err);
});

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Realty Pandit API Docs',
}));

// Root route - Secure API landing page
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Realty Pandit API</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e2e8f0;overflow:hidden}
.bg-grid{position:fixed;inset:0;background-image:linear-gradient(rgba(99,102,241,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.07) 1px,transparent 1px);background-size:60px 60px}
.container{position:relative;z-index:1;text-align:center;padding:2rem}
.lock-icon{width:80px;height:80px;margin:0 auto 2rem;background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:20px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 40px rgba(79,70,229,.3);animation:pulse 3s ease-in-out infinite}
.lock-icon svg{width:40px;height:40px;fill:#e2e8f0}
@keyframes pulse{0%,100%{box-shadow:0 0 40px rgba(79,70,229,.3)}50%{box-shadow:0 0 60px rgba(79,70,229,.5)}}
h1{font-size:1.75rem;font-weight:700;margin-bottom:.5rem;background:linear-gradient(135deg,#e2e8f0,#94a3b8);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.subtitle{color:#64748b;font-size:.95rem;margin-bottom:2.5rem}
.status-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.2);border-radius:50px;padding:8px 20px;font-size:.85rem;color:#4ade80;margin-bottom:2rem}
.status-dot{width:8px;height:8px;background:#4ade80;border-radius:50%;animation:blink 2s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}
.info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-top:2rem;max-width:500px;margin-left:auto;margin-right:auto}
.info-item{background:rgba(30,41,59,.6);border:1px solid rgba(51,65,85,.5);border-radius:12px;padding:1rem .75rem}
.info-item .label{font-size:.7rem;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:.25rem}
.info-item .value{font-size:.95rem;font-weight:600;color:#cbd5e1}
.footer{margin-top:2.5rem;color:#475569;font-size:.75rem}
.footer a{color:#6366f1;text-decoration:none}
.shield{position:fixed;opacity:.03;font-size:20rem;top:50%;left:50%;transform:translate(-50%,-50%)}
@media(max-width:480px){.info-grid{grid-template-columns:1fr;max-width:250px}h1{font-size:1.4rem}}
</style>
</head>
<body>
<div class="bg-grid"></div>
<div class="shield">&#128737;</div>
<div class="container">
<div class="lock-icon">
<svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>
</div>
<div class="status-badge"><span class="status-dot"></span> System Operational</div>
<h1>Realty Pandit API</h1>
<p class="subtitle">This is a secured API endpoint. Unauthorized access is prohibited.</p>
<div class="info-grid">
<div class="info-item"><div class="label">Protocol</div><div class="value">HTTPS</div></div>
<div class="info-item"><div class="label">Auth</div><div class="value">JWT</div></div>
<div class="info-item"><div class="label">Version</div><div class="value">v2.0</div></div>
</div>
<div class="footer">&copy; ${new Date().getFullYear()} Realty Pandit Technologies &bull; <a href="https://realtypandit.in">realtypandit.in</a></div>
</div>
</body>
</html>`);
});

// Static file serving for uploaded property media
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    immutable: process.env.NODE_ENV === 'production',
    setHeaders: (res, filepath) => {
        // Pending uploads should not be cached aggressively (can be replaced/deleted)
        if (filepath.includes('/pending/')) {
            res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour only
        }
    }
}));

// CSP violation report endpoint — receives reports from Content-Security-Policy-Report-Only header
// No auth required; accept JSON and csp-report content types
app.post('/csp-report', express.json({ type: ['application/json', 'application/csp-report'] }), (req, res) => {
    const report = req.body?.['csp-report'] ?? req.body;
    if (report && report['blocked-uri']) {
        const logger = require('./utils/logger').default;
        logger.warn('[CSP] Violation report', {
            blocked: report['blocked-uri'],
            directive: report['violated-directive'],
            document: report['document-uri'],
            source: report['source-file'],
            line: report['line-number'],
        });
    }
    res.status(204).end();
});

// Public Routes (no auth required)
// loginLimiter is applied only to POST /auth/login (5/min per IP)
app.post('/auth/login', loginLimiter);
app.use('/auth', authLimiter, authRoutes);
app.use('/user', publicLimiter, userAuthRoutes); // Customer user authentication
app.use('/webhooks', webhookLimiter, webhookRoutes);
app.use('/webhooks/internal/tools', webhookLimiter, internalToolsRouter); // Panditji voice bot internal tools
app.use('/webhooks', webhookLimiter, razorpayWebhookRouter); // Razorpay payment webhooks
app.use('/webhooks/omnidim', webhookLimiter, omnidimWebhookRouter); // Omnidim AI calling provider
app.use('/public', publicLimiter, publicRoutes);
app.use('/public', publicLimiter, aiChatRoutes); // AI Chat for property search
app.use('/public/auth', authLimiter, authOTPRoutes); // Website chat OTP authentication
app.use('/public/master', publicLimiter, masterRoutes);
app.use('/public', publicLimiter, classificationRoutes); // Property Classification API (legacy 3-tier)
app.use('/public/taxonomy', publicLimiter, taxonomyRoutes); // Canonical taxonomy read (Phase 1a)
app.use('/api/taxonomy', apiLimiter, adminTaxonomyRouter); // Taxonomy admin — super_boss only (Phase 1c)
app.use('/api/workflow', workflowLimiter, workflowRoutes); // Unified Inventory Workflow (high volume: 2 calls per step)
app.use('/api/chat', chatLimiter, chatWorkflowRoutes); // Chat-based Inventory Workflow

// Partner TEAMS (2026-07-13): a partner company manages its own sub-agents. Under /api so it sits
// behind authMiddleware + the PARTNER_ALLOWLIST default-deny backbone (unlike the retired /agent/*).
app.use('/api/partner', apiLimiter, partnerTeamRoutes);

// ─── Partner (external agent) routes ────────────────────────────────────────
// SECURITY (2026-07-13): routes/agent.ts guards itself with its OWN `authenticateAgent`, NOT
// `authMiddleware` — so it has no role check and, critically, NO partner default-deny allow-list.
// It reads the same `rp_access_token` cookie, so every authenticated /agent/* route (/agent/team,
// /agent/deals, /agent/inventory, /agent/leads, /agent/commissions…) was a SECOND, ungoverned door
// into partner data, sitting outside the allow-list that protects everything else.
//
// The old partner-portal SPA that consumed those routes was deleted; partners now use the admin app.
// The only /agent endpoints still in use are the PUBLIC sign-in ones (LoginPage.tsx) plus public
// self-registration. Everything else is retired with 410 Gone — a one-line, instantly-revertable
// change that closes the hole today and turns "is this route dead?" into a production observation:
// watch the 410 counter; if it stays at zero, delete the authenticated half of routes/agent.ts.
const AGENT_PUBLIC_PATHS = /^\/(login-otp|verify-otp|login-password|register)(\/|$)/;
app.use('/agent', agentLimiter, (req, res, next) => {
    if (AGENT_PUBLIC_PATHS.test(req.path)) return next();
    logger.warn(`[AgentRetired] 410 for ${req.method} /agent${req.path}`);
    return res.status(410).json({
        error: 'The partner portal API has been retired. Partners now use the admin app.',
    });
}, agentRoutes);

// Builder Routes (builder JWT auth) - PHASE 14
app.use('/builder', agentLimiter, builderRoutes);

// External Integration Routes (API key auth)
app.use('/external', externalLimiter, externalLeadRoutes);
app.use('/external/99acres', externalLimiter, nineNineAcresRoutes);
app.use('/external/magicbricks', externalLimiter, magicBricksRoutes);
app.use('/external/housing', externalLimiter, housingRoutes);
// Facebook Lead Ads — mounted under /webhooks (not /external) because FB uses its own verify token, not our API key.
// verifyMetaSignature (2026-08-07) authenticates the POST payload against FB_APP_SECRET; it runs in
// LOG-ONLY mode until META_SIGNATURE_ENFORCE=true. The GET handshake carries no signature and is
// let through by the middleware's own header check.
app.use('/webhooks/facebook', webhookLimiter, verifyMetaSignature, facebookRoutes);

// Public team endpoints (must be before the /api auth middleware)
app.get('/api/team/inventory/bulk-template', publicLimiter, (_req, res) => {
    const template = [
        'type,category,intent,state,district,locality,pincode,price,price_unit,bedrooms,bathrooms,area,area_unit,owner_phone,owner_name,status,furnishing,floor_number,total_floors,facing,property_age,key_holder_type,amenities,category_slug,sub_category_slug,type_slug,configuration_slug',
        'flat,residential,sell,Uttar Pradesh,Gautam Buddh Nagar,"Sector 18, Noida",201301,5500000,Lakh,2,2,1200,sqft,9999999999,Rahul Sharma,active,semi_furnished,3,12,north,1-3_years,UPLOADER,"parking,lift,security",residential,apartment,flat,2_bhk',
        'house,residential,rent,Haryana,Gurgaon,"DLF Phase 2",122002,45000,,3,3,2500,sqft,9888888888,Priya Singh,active,fully_furnished,,,east,,OWNER,"parking,garden,security",residential,individual_housing,independent_house,',
        'plot,commercial,sell,Uttar Pradesh,Gautam Buddh Nagar,"Noida Extension",201306,8000000,Lakh,,,2000,sqyd,9777777777,Amit Kumar,active,,,,,new_construction,EXTERNAL,"",commercial,,,',
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory_template.csv"');
    res.send(template);
});

/**
 * GET /api/team/google/callback — Google OAuth redirect target (PUBLIC, 2026-05-18).
 *
 * Hoisted here (above the `/api` JWT auth) for the same reason as the
 * bulk-template route: Google hits this with no auth cookie/header. Identity +
 * CSRF come from the signed `state` JWT we minted in /me/google/connect. On
 * success we store the AES-256-GCM-encrypted refresh token and bounce the
 * member back to their profile in the admin panel.
 */
app.get('/api/team/google/callback', publicLimiter, async (req, res) => {
    const ADMIN_PANEL_URL = process.env.ADMIN_PANEL_URL || 'https://admin.realtypandit.in';
    const back = (qs: string) => res.redirect(`${ADMIN_PANEL_URL}/profile?${qs}`);
    const { default: logger } = await import('./utils/logger');
    try {
        const { code, state, error } = req.query || {};
        if (error) return back('google=denied');
        if (!code || !state) return back('google=error');

        const { verifyState, exchangeCode } = await import('./services/google_oauth');

        let agentId: string;
        try {
            ({ agentId } = verifyState(String(state)));
        } catch {
            return back('google=expired');
        }

        const { refreshToken, email } = await exchangeCode(String(code));
        const { encryptSecret } = await import('./utils/crypto');

        await prisma.agent.update({
            where: { id: agentId },
            data: {
                google_refresh_token: encryptSecret(refreshToken),
                google_email: email,
                google_connected_at: new Date(),
                google_sync_enabled: true,
            },
        });

        logger.info(`[TeamAPI] Google connected for agent ${agentId} (${email || 'unknown email'})`);
        return back('google=connected');
    } catch (err: any) {
        try {
            const { captureRouteError } = await import('./utils/capture');
            captureRouteError(err, req, { route: 'team#google-callback' });
        } catch { /* capture is best-effort */ }
        logger.error('[TeamAPI] google callback error:', err);
        return back('google=error');
    }
});

// API Routes (JWT auth)
app.use('/api', apiLimiter, apiRoutes);
app.use('/api/leads', apiLimiter, leadRoutes);
app.use('/api/calls', apiLimiter, staffCallRoutes); // Staff Call Intelligence
app.use('/api/calendar', apiLimiter, calendarRoutes); // Calendar system
app.use('/api/email', apiLimiter, emailRoutes); // Email system (Panditji AI controls all)
app.use('/api/team', apiLimiter, teamRoutes); // Team management + bulk inventory upload
// app.use('/api/master', masterRoutes); // Moved to public
app.use('/api/agent-dashboard', apiLimiter, agentDashboardRoutes); // Multi-agent monitoring
app.use('/api/transactions', apiLimiter, transactionRoutes); // Transaction Engine
app.use('/api/deals', apiLimiter, dealRoutes); // Deal Management (Phase 7)
app.use('/api/analytics', apiLimiter, analyticsRoutes); // Analytics for dashboard visualizations
app.use('/api/reports', apiLimiter, reportsRoutes); // Comprehensive reports system (8 categories, 26 endpoints)
app.use('/api/workflows', apiLimiter, workflowAutomationRoutes); // Workflow automation system (Phase 3.1)
app.use('/api/marketing', apiLimiter, marketingRoutes); // Marketing Campaign & Template Builder (Phase 3.2)
app.use('/api/notifications', apiLimiter, notificationsRoutes); // Notification Preferences (Phase 4.2)
app.use('/api', apiLimiter, tasksRoutes); // Task & Project Management (Phase 3.3) - mounts /api/tasks and /api/projects
app.use('/api/workflow-tasks', apiLimiter, workflowTaskRoutes); // Guided Lead-to-Deal Workflow Engine
app.use('/api/agent-leads', apiLimiter, agentLeadRoutes); // Agent/Dealer buyer lead access
app.use('/api/integrations', apiLimiter, integrationRoutes); // Integration sync management (99acres pull API)
app.use('/api/payments', apiLimiter, paymentRoutes); // Razorpay Payment Gateway (Phase 7)
app.use('/public/payments', publicLimiter, paymentRoutes); // Public access to plans/pricing (no auth)
app.use('/inventory', apiLimiter, inventoryRouter);
app.use('/api/inventory', apiLimiter, inventoryRouter); // Also mount under /api/ for admin panel proxy

// Health Check — Enhanced with circuit breaker + memory stats + queue stats
import { geminiCircuit, whatsappCircuit } from './utils/circuit_breaker';
import { cacheGet } from './utils/redis';
import { getQueueStats } from './queues/index';

app.get('/health', async (req, res) => {
    const checks: Record<string, any> = {
        status: 'ok',
        agent: 'Realty Pandit Backend',
        instance: process.env.NODE_APP_INSTANCE || 'single',
        uptime_seconds: Math.floor(process.uptime()),
    };

    let isHealthy = true;

    // Database check
    try {
        const start = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        checks.db = { status: 'connected', latency_ms: Date.now() - start };
    } catch (error) {
        checks.db = { status: 'disconnected', error: (error as Error).message };
        isHealthy = false;
    }

    // Redis check
    try {
        const start = Date.now();
        const pong = await cacheGet('health_ping');
        checks.redis = { status: pong !== null || true ? 'connected' : 'unknown', latency_ms: Date.now() - start };
    } catch {
        checks.redis = { status: 'unavailable' };
    }

    // Circuit breaker states
    checks.circuits = {
        gemini: geminiCircuit.getStats(),
        whatsapp: whatsappCircuit.getStats(),
    };

    // Memory usage
    const mem = process.memoryUsage();
    checks.memory = {
        rss_mb: Math.round(mem.rss / 1024 / 1024),
        heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    };

    // BullMQ queue stats
    checks.queues = await getQueueStats();

    if (!isHealthy) {
        checks.status = 'degraded';
        return res.status(503).json(checks);
    }

    res.json(checks);
});

// GlitchTip Express error handler — must come before custom errorHandler, after all routes.
// shouldHandleError filters out 4xx and known operational errors so we only report real 5xx.
if (GLITCHTIP_DSN) {
  SentrySDK.setupExpressErrorHandler(app, {
    shouldHandleError(err: any) {
      // Multer upload errors are handled by errorHandler -> clean 4xx response. Don't report.
      if (err?.name === 'MulterError') return false;
      // CORS rejections are operational, not bugs.
      if (typeof err?.message === 'string' && err.message.startsWith('CORS:')) return false;
      // Only report 5xx (and errors without a status, which default to 500).
      const status = err?.status ?? err?.statusCode ?? 500;
      return status >= 500;
    },
  });
}

// Global error handler (must be last)
app.use(errorHandler);

export default app;
