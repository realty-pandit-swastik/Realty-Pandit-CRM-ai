# Errors, Issues & Recommendations

> **Reality Pandit** - Comprehensive Error Audit & Issue Tracker
> Generated: February 26, 2026
> Scope: Full codebase scan of `agents/backend/`, `agents/frontend/`, `agents/website/`

---

## Table of Contents

1. [Priority 1: Critical Issues](#priority-1-critical-issues)
2. [Priority 2: High Issues](#priority-2-high-issues)
3. [Priority 3: Medium Issues](#priority-3-medium-issues)
4. [Priority 4: Low Issues](#priority-4-low-issues)
5. [All TODO Comments](#all-todo-comments)
6. [Fire-and-Forget Async Patterns](#fire-and-forget-async-patterns)
7. [Silent Catch Blocks](#silent-catch-blocks)
8. [Incomplete Features](#incomplete-features)
9. [Security Audit](#security-audit)
10. [Frontend Issues](#frontend-issues)
11. [Performance Concerns](#performance-concerns)
12. [Recommendations Summary](#recommendations-summary)

---

## Priority 1: Critical Issues

### 1.1 SMS Verification Not Implemented

| Field | Detail |
|-------|--------|
| **File** | `agents/backend/src/routes/ai_chat.ts` |
| **Lines** | 125-172 |
| **Issue** | Phone verification endpoint generates a mock 6-digit code but does NOT actually send it via SMS. The TODO comment confirms this: "Integrate with SMS service (Twilio, AWS SNS, etc.)" |
| **Impact** | **Public API phone verification is non-functional.** Users requesting phone-verified chat cannot receive OTP codes. The endpoint returns success with a mock code, misleading the client. |
| **Code** |
```typescript
// Line 125: TODO: Integrate with SMS service (Twilio, AWS SNS, etc.)
// Line 150: TODO: Generate and send SMS confirmation code
const code = Math.floor(100000 + Math.random() * 900000).toString();
// Code is generated but NEVER sent
```
| **Fix** | Integrate Twilio or AWS SNS. Estimated effort: **Medium** (2-4 hours). Add SMS provider config to `.env`, create `services/sms.ts`, wire into the OTP route. Alternatively, mark the endpoint as unavailable until SMS is configured. |

---

### 1.2 Message Deduplication Lost After Server Restart

| Field | Detail |
|-------|--------|
| **File** | `agents/backend/src/routes/webhooks.ts` |
| **Lines** | 44-52 |
| **Issue** | WhatsApp message dedup uses Redis with a 120-second TTL as primary, and an in-memory `Set` as fallback. If PM2 restarts the process, the in-memory Set is cleared, and any messages received during the brief Redis-unavailable window can be processed twice. |
| **Impact** | **Duplicate messages processed after crashes.** WhatsApp users may see duplicate AI responses. While rare (requires both restart AND rapid message), it's a production reliability concern. |
| **Code** |
```typescript
const processedMessageIdsFallback = new Set<string>(); // Lost on restart
```
| **Fix** | Remove in-memory fallback entirely. If Redis is unavailable, reject the message and let WhatsApp retry (Meta retries webhooks on 5xx). Estimated effort: **Low** (1 hour). |

---

### 1.3 Gemini API Key Missing = Silent Fallback to Mock

| Field | Detail |
|-------|--------|
| **File** | `agents/backend/src/services/llm.ts` |
| **Lines** | 58-69 |
| **Issue** | When `GEMINI_API_KEY` is not set, the LLM service silently falls back to a mock model that returns "This is a mock AI response." The error is only logged, not thrown. The server continues running as if everything works. |
| **Impact** | **AI features appear broken with no clear error.** All classifications return fallback values (UNKNOWN, GENERAL, english), and chat responses say "mock AI response." Users and admins may not realize AI is down. |
| **Code** |
```typescript
if (!apiKey) {
    console.error('[LLMService] GEMINI_API_KEY is missing! Using Mock Mode.');
    this.model = { generateContent: async () => ({
        response: { text: () => "This is a mock AI response." }
    })};
}
```
| **Fix** | Fail fast at server startup if `GEMINI_API_KEY` is missing and `NODE_ENV=production`. Add to the startup validation in `server.ts`. Estimated effort: **Low** (30 minutes). |

---

## Priority 2: High Issues

### 2.1 Fire-and-Forget Webhook Fallback

| Field | Detail |
|-------|--------|
| **File** | `agents/backend/src/routes/webhooks.ts` |
| **Lines** | ~86-88 |
| **Issue** | When BullMQ queue is unavailable, the webhook falls back to synchronous processing with `.catch(err => logger.error())`. If both queue AND sync fail, the message is lost forever with only a log entry. |
| **Impact** | Messages can be permanently lost in a double-failure scenario (BullMQ down + processing error). |
| **Fix** | Write failed messages to a dead-letter DB table for manual retry. Estimated effort: **Medium** (3-4 hours). |

---

### 2.2 Redis No Reconnection Strategy

| Field | Detail |
|-------|--------|
| **File** | `agents/backend/src/utils/redis.ts` |
| **Lines** | 35-38 |
| **Issue** | Redis connects once at startup. If it fails, `redis` is set to `null` and all cache operations silently fail for the entire server lifetime. No reconnection attempts are made. |
| **Impact** | If Redis goes down briefly during startup, the entire caching layer is disabled permanently until manual restart. In production, this means 3x more Gemini API calls (no caching), slower responses, and potential rate limit exhaustion. |
| **Code** |
```typescript
redis.connect().catch(() => {
    logger.warn('Redis unavailable, running without cache');
    redis = null; // Never retried
});
```
| **Fix** | Use ioredis built-in reconnection with exponential backoff (`retryStrategy`). Estimated effort: **Low** (1-2 hours). |

---

### 2.3 Calendar Service Fire-and-Forget Coordination

| Field | Detail |
|-------|--------|
| **File** | `agents/backend/src/services/calendar.ts` |
| **Lines** | 147, 198, 321 |
| **Issue** | Three coordination agent calls use `.catch(err => logger.error())` pattern. If the coordination agent fails, appointment confirmations, reschedule notifications, and seller notifications are silently dropped. |
| **Impact** | Appointment stakeholders may not be notified of changes. |
| **Fix** | Add retry mechanism or queue the notification for later delivery. Estimated effort: **Medium** (2-3 hours). |

---

### 2.4 Team WhatsApp Welcome Message Fire-and-Forget

| Field | Detail |
|-------|--------|
| **File** | `agents/backend/src/routes/team.ts` |
| **Lines** | 181, 308 |
| **Issue** | WhatsApp welcome messages and password reset links sent to new team members use `.catch(err => logger.warn())`. If WhatsApp is down, new team members never receive their setup link. |
| **Impact** | New employees may not receive setup instructions. |
| **Fix** | Queue for retry or fallback to email delivery. Estimated effort: **Low** (1-2 hours). |

---

## Priority 3: Medium Issues

### 3.1 HTTP Status Code Inconsistency

| File | Issue |
|------|-------|
| Multiple routes | Some error responses return HTTP 200 with `{ success: false }` instead of proper 4xx/5xx codes. Clients relying on HTTP status for error detection may miss these. |
| **Fix** | Audit all routes and use proper status codes (400 for validation, 404 for not found, 500 for server errors). Estimated effort: **Medium** (4-6 hours across all routes). |

---

### 3.2 Circular Dependency Workaround

| Field | Detail |
|-------|--------|
| **File** | `agents/backend/src/utils/alerter.ts` |
| **Line** | ~57 |
| **Issue** | Uses dynamic `await import('../services/whatsapp')` to avoid circular dependency with `circuit_breaker.ts`. While functional, this is fragile and can break during refactoring. |
| **Fix** | Extract the alert sending into a separate module that doesn't depend on circuit_breaker. Estimated effort: **Low** (1-2 hours). |

---

### 3.3 Missing Input Validation in Some Routes

| File | Issue |
|------|-------|
| `routes/ai_chat.ts` | `searchProperties()` accepts user-provided filters (location, type) without sanitization. Prisma parameterization prevents SQL injection, but malformed data could cause unexpected query behavior. |
| `routes/marketing.ts` | Campaign creation accepts freeform `content` without length limits or content sanitization. |
| **Fix** | Add Zod validation schemas for all public-facing endpoints. Estimated effort: **Medium** (4-6 hours). |

---

### 3.4 Workflow Rejected Files Not Handled

| Field | Detail |
|-------|--------|
| **File** | `agents/backend/src/routes/workflow.ts` |
| **Line** | 380 |
| **Issue** | TODO comment: "If rejected files are part of a workflow, mark inventory as PENDING_REVIEW". Currently, rejected media files during inventory workflow don't update the inventory status. |
| **Impact** | Properties with rejected documents may remain in active status. |
| **Fix** | Implement PENDING_REVIEW status transition on file rejection. Estimated effort: **Low** (1-2 hours). |

---

### 3.5 Owner Service WhatsApp Notification Placeholder

| Field | Detail |
|-------|--------|
| **File** | `agents/backend/src/services/owner.ts` |
| **Line** | 231 |
| **Issue** | TODO: "Send WhatsApp notification to owner" when subscription is created. Currently only creates the DB record. |
| **Impact** | New owners don't receive welcome/confirmation via WhatsApp. |
| **Fix** | Wire into NotificationAgent.sendTemplate(). Estimated effort: **Low** (1 hour). |

---

## Priority 4: Low Issues

### 4.1 Console.log Statements in Production Code

| Files | Count | Description |
|-------|-------|-------------|
| `services/llm.ts` | 4 | Debug logs for API key check and model initialization |
| `scripts/geocode-properties.ts` | 7 | Expected in scripts |
| `scripts/verify_db.ts` | 3 | Expected in scripts |
| `scripts/test_workflows.ts` | 5 | Expected in scripts |
| `scripts/seed_buyer.ts` | 2 | Expected in scripts |
| `jobs/cleanup_uploads.ts` | 1 | Should use logger |
| **Total** | ~22 | Only 5 in non-script production code |

**Fix**: Replace `console.log/error` with Winston `logger` in production files. Estimated effort: **Low** (30 minutes).

---

### 4.2 Large Component Files

| Component | Lines | Concern |
|-----------|-------|---------|
| `AdvancedAnalytics.tsx` | ~1,050 | Could be split into sub-tab components |
| `CallLog.tsx` | ~750 | Audio player + transcript could be separate |
| `NotificationSettings.tsx` | ~750 | Channel sections could be separate |
| `PropertyMapView.tsx` | ~622 | Map + sidebar could be split |
| `DashboardLayout.tsx` | ~450 | Sidebar nav items could be extracted |

**Fix**: Refactor into smaller components when time permits. Not urgent — all work correctly. Estimated effort: **Medium** (8-12 hours).

---

### 4.3 Non-Blocking Audit Logging

| Field | Detail |
|-------|--------|
| **File** | `agents/backend/src/routes/team.ts` |
| **Line** | 372 |
| **Issue** | `catch { /* non-blocking audit */ }` — audit log creation failures are completely swallowed. |
| **Impact** | Very low — audit trail may have gaps, but core functionality unaffected. |
| **Fix** | Log the error instead of swallowing it. Estimated effort: **Low** (15 minutes). |

---

## All TODO Comments

Complete list of every TODO comment found in the backend codebase:

| # | File | Line | TODO Description |
|---|------|------|-----------------|
| 1 | `routes/ai_chat.ts` | 125 | Integrate with SMS service (Twilio, AWS SNS, etc.) |
| 2 | `routes/ai_chat.ts` | 150 | Generate and send SMS confirmation code |
| 3 | `routes/builder.ts` | 108 | Send welcome WhatsApp message to new builder |
| 4 | `routes/builder.ts` | 145 | Send OTP via WhatsApp to builder |
| 5 | `routes/builder.ts` | 1113 | Send WhatsApp notification to buyer for appointment |
| 6 | `routes/marketing.ts` | 389 | Implement actual sending logic via NotificationAgent |
| 7 | `routes/marketing.ts` | 449 | Trigger actual sending via MarketingAgent |
| 8 | `routes/notifications.ts` | 91 | Add notification_preferences JSON column to Agent table |
| 9 | `routes/notifications.ts` | 130 | Implement actual notification sending via NotificationAgent |
| 10 | `routes/workflow.ts` | 380 | Mark inventory as PENDING_REVIEW if rejected files |
| 11 | `services/subscription.ts` | 94 | Send WhatsApp notification on subscription creation |
| 12 | `services/subscription.ts` | 95 | Update priority scores for existing listings |
| 13 | `services/subscription.ts` | 96 | Integrate with payment gateway if paid plan |
| 14 | `services/subscription.ts` | 151 | Send WhatsApp confirmation on plan change |
| 15 | `services/subscription.ts` | 250 | Send WhatsApp notification about expiry and downgrade |
| 16 | `services/subscription.ts` | 294 | Send WhatsApp confirmation on renewal |
| 17 | `services/owner.ts` | 231 | Send WhatsApp notification to owner |

**Total: 17 TODO comments** across 7 files.

**Frontend & Website**: No TODO/FIXME/HACK comments found (clean).

---

## Fire-and-Forget Async Patterns

These are `.catch()` handlers that log errors but don't retry or escalate:

| # | File | Line | Pattern | Risk |
|---|------|------|---------|------|
| 1 | `routes/webhooks.ts` | ~86 | `processInboundMessage().catch(err => logger.error())` | **High** — message lost |
| 2 | `services/calendar.ts` | 147 | `coordinationAgent.execute().catch(err => logger.error())` | **Medium** — notification dropped |
| 3 | `services/calendar.ts` | 198 | `coordinationAgent.execute().catch(err => logger.error())` | **Medium** — reschedule notification dropped |
| 4 | `services/calendar.ts` | 321 | `coordinationAgent.execute().catch(err => logger.error())` | **Medium** — seller notification dropped |
| 5 | `routes/team.ts` | 181 | `whatsappService.sendTemplate().catch(err => logger.warn())` | **Low** — welcome message dropped |
| 6 | `routes/team.ts` | 308 | `whatsappService.sendTemplate().catch(err => logger.warn())` | **Low** — reset link dropped |

**Total: 6 fire-and-forget patterns** in production code.

---

## Silent Catch Blocks

These catch blocks swallow errors completely without logging:

| # | File | Line | Context |
|---|------|------|---------|
| 1 | `middleware/cache.ts` | 26 | Cache read failure — silently returns cache miss (acceptable) |
| 2 | `routes/workflow.ts` | 264 | JSON parse failure — falls back to default (acceptable) |
| 3 | `routes/auth.ts` | 31 | JSON parse failure — returns null (acceptable) |
| 4 | `routes/team.ts` | 372 | Audit log creation — swallowed completely |
| 5 | `queues/index.ts` | 67 | Queue stats retrieval — returns empty stats (acceptable) |
| 6 | `utils/redis.ts` | 41, 52, 62, 75 | All Redis operations — returns null/undefined (by design) |
| 7 | `agents/prompt_engineer_agent.ts` | 164 | JSON parse of LLM output — retries with fallback (acceptable) |
| 8 | `agents/audit_agent.ts` | 177 | Skip individual conversation analysis — continues batch (acceptable) |
| 9 | `services/email_provisioner.ts` | 38 | Email validation — returns false (acceptable) |
| 10 | `services/llm.ts` | 210, 381 | Cache JSON parse — re-classifies (acceptable) |
| 11 | `services/email_service.ts` | 224 | Email threading parse — continues without thread (acceptable) |
| 12 | `services/pending_message_queue.ts` | 97 | Message send failure — continues with next (acceptable) |

**Assessment**: Most silent catches are **by design** for graceful degradation. Only #4 (team.ts:372) should be changed to log the error.

---

## Incomplete Features

Features that are partially implemented or use placeholder logic:

| # | Feature | Status | Location | Blocker |
|---|---------|--------|----------|---------|
| 1 | **SMS/OTP Sending** | Placeholder | `routes/ai_chat.ts` | No SMS provider configured |
| 2 | **Marketing Campaign Sending** | Placeholder | `routes/marketing.ts:389,449` | NotificationAgent integration pending |
| 3 | **Notification Preferences** | Placeholder | `routes/notifications.ts:91,130` | DB column not added, sending not wired |
| 4 | **Builder WhatsApp Messages** | Placeholder | `routes/builder.ts:108,145,1113` | WhatsApp templates not configured |
| 5 | **Subscription WhatsApp Alerts** | Placeholder | `services/subscription.ts` (6 TODOs) | WhatsApp Business API credentials needed |
| 6 | **Payment Gateway** | Placeholder | `services/subscription.ts:96` | Razorpay integration not implemented |
| 7 | **Owner WhatsApp Notifications** | Placeholder | `services/owner.ts:231` | WhatsApp integration pending |
| 8 | **Photo Upload (Cloudinary)** | Not configured | N/A | Client has not provided Cloudinary API keys |
| 9 | **Google Analytics** | Not configured | N/A | Client has not provided GA tracking ID |
| 10 | **WhatsApp Business API** | Not configured | Config exists but credentials needed | Client has NOT provided Meta Business API credentials |

### External Dependency Status

| Dependency | Status | Impact |
|-----------|--------|--------|
| WhatsApp Business API credentials | **NOT PROVIDED** by client | WhatsApp sending non-functional |
| Cloudinary API keys | **NOT PROVIDED** by client | Photo upload unavailable |
| Google Analytics ID | **NOT PROVIDED** by client | Traffic tracking unavailable |
| SMS provider (Twilio/AWS SNS) | **NOT CONFIGURED** | OTP verification non-functional |
| Razorpay keys | **NOT CONFIGURED** | Payment processing unavailable |
| Google Maps API key | **CONFIGURED** | Working for property maps |
| Gemini API key | **CONFIGURED** | Working for AI features |

---

## Security Audit

### Strengths (Well-Implemented)

| Area | Implementation | Status |
|------|---------------|--------|
| **CORS** | Strict whitelist with 12 allowed origins | Good |
| **Helmet** | Security headers enabled (CSP, CORP) | Good |
| **Rate Limiting** | 7 separate limiters for different route groups | Good |
| **JWT Auth** | Separate secrets for admin, agent, user tokens | Good |
| **Password Hashing** | bcrypt with salt rounds | Good |
| **SQL Injection** | Prisma ORM with parameterized queries | Good |
| **XSS Prevention** | Helmet CSP + React/Next.js auto-escaping | Good |
| **Input Validation** | Zod schemas on critical routes | Good |
| **Circuit Breaker** | External service protection (Gemini, WhatsApp) | Good |
| **Request Logging** | All requests logged with UUID tracing | Good |

### Potential Concerns

| # | Area | Concern | Risk Level | Detail |
|---|------|---------|-----------|--------|
| 1 | **API Key in Config** | `config/api_keys.json` contains plaintext API keys | **Medium** | Should use environment variables only. Config file is in `.gitignore` but could be accidentally committed. |
| 2 | **CORS IP Whitelist** | Production server IP (`72.62.231.224`) is hardcoded in CORS | **Low** | Works but should be in environment config. |
| 3 | **Trust Proxy** | `app.set('trust proxy', 'loopback')` — only trusts localhost | **Low** | Correct for Nginx reverse proxy on same host. |
| 4 | **File Upload Path** | `/uploads` served statically without strict path validation | **Low** | Express `static` middleware handles path traversal. Pending uploads cached for 1 hour only. |
| 5 | **Webhook Verification** | WhatsApp webhook verify token compared with `===` | **Good** | Timing-safe comparison not critical for webhook verification. |
| 6 | **Agent JWT Secret** | Separate from admin JWT (`AGENT_JWT_SECRET`) | **Good** | Prevents token cross-use between panels. |
| 7 | **Setup Token** | One-time use tokens for password setup with expiry | **Good** | Tokens are unique and expire. |
| 8 | **Body Size Limit** | `express.json({ limit: '10mb' })` | **Low** | 10MB is generous. Consider reducing to 2MB for API routes, keeping 10MB for upload routes only. |

### Recommendations

1. **Move all API keys to environment variables** — Remove `config/api_keys.json` dependency
2. **Add CORS origins to environment config** — Remove hardcoded IPs
3. **Reduce JSON body size limit** — 2MB for API routes, 10MB for upload routes
4. **Add rate limiting to webhook routes** — Currently 200 req/15min, consider tightening

---

## Frontend Issues

### Admin Dashboard (agents/frontend/)

| # | Issue | File | Severity |
|---|-------|------|----------|
| 1 | `console.error` for failed API calls — no user-facing error toast | `App.tsx:196,205,215,226` | **Low** |
| 2 | `confirm()` used for destructive actions (no-show report) | `App.tsx:220` | **Low** — works but not branded |
| 3 | `alert()` used for success/error feedback | `App.tsx:224,227` | **Low** — works but not branded |
| 4 | Large inline styles throughout — no CSS modules or utility classes | Multiple components | **Low** — works, harder to maintain |
| 5 | No error boundary component — React errors crash entire app | App-wide | **Medium** — add React ErrorBoundary |

### Public Website (agents/website/)

| # | Issue | Severity |
|---|-------|----------|
| 1 | No TODO/FIXME comments — codebase is clean | N/A |
| 2 | No visible error handling issues | N/A |
| **Status** | **Clean** — No issues found | |

---

## Performance Concerns

| # | Area | Concern | Impact | Recommendation |
|---|------|---------|--------|----------------|
| 1 | **Contact Loading** | `getContacts()` loads ALL contacts on dashboard mount | **Medium** for large datasets | Add pagination or virtual scrolling |
| 2 | **Interaction Loading** | Loads all interactions per contact (no limit in frontend) | **Low** — backend limits to last 50 | Fine for now |
| 3 | **Dashboard Tabs** | All 5 dashboard sub-tabs render analytics data on mount | **Low** | Could lazy-load inactive tabs |
| 4 | **Property Map** | Loads all properties for map markers | **Medium** for >500 properties | Add clustering (already implemented) + viewport filtering |
| 5 | **Reports** | Some reports query large date ranges without pagination | **Low** | Add date range limits and pagination |

---

## Recommendations Summary

### Quick Wins (< 2 hours each)

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 1 | Fail fast if `GEMINI_API_KEY` missing in production | Prevents silent AI failure | 30 min |
| 2 | Remove in-memory dedup fallback, use Redis-only | Prevents duplicate messages | 1 hour |
| 3 | Replace `console.log` with `logger` in `llm.ts` | Cleaner production logs | 30 min |
| 4 | Log swallowed error in `team.ts:372` | Better audit trail | 15 min |
| 5 | Add React ErrorBoundary to admin dashboard | Prevents full-page crashes | 1 hour |
| 6 | Reduce JSON body size to 2MB for API routes | Security hardening | 30 min |

### Medium Priority (2-8 hours each)

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 7 | Wire NotificationAgent into marketing campaigns | Complete campaign feature | 3-4 hours |
| 8 | Add notification_preferences column + sending | Complete notifications | 4-6 hours |
| 9 | Implement dead-letter table for failed webhooks | Prevent message loss | 3-4 hours |
| 10 | Add Redis reconnection with exponential backoff | Cache resilience | 1-2 hours |
| 11 | Wire builder WhatsApp messages (3 TODOs) | Complete builder portal | 2-3 hours |
| 12 | Wire subscription WhatsApp notifications (6 TODOs) | Complete subscription flow | 3-4 hours |

### Needs External Dependencies

| # | Action | Blocker | Who |
|---|--------|---------|-----|
| 13 | SMS OTP sending | Need Twilio/AWS SNS account | Developer + Client |
| 14 | WhatsApp Business API | Need Meta Business credentials | **Client** |
| 15 | Cloudinary photo upload | Need Cloudinary API keys | **Client** |
| 16 | Google Analytics | Need GA tracking ID | **Client** |
| 17 | Razorpay payment gateway | Need Razorpay keys | **Client** |

---

## Error Handling Architecture (Reference)

The project has a well-structured error handling system:

### Global Error Handler
**File**: `agents/backend/src/middleware/error_handler.ts`

```
Custom Error Classes:
├── AppError (base)
│   ├── ValidationError (400)
│   ├── AuthError (401)
│   ├── ForbiddenError (403)
│   └── NotFoundError (404)
└── Unhandled Errors → errorHandler() → logs + alerts
```

### Circuit Breaker Pattern
**File**: `agents/backend/src/utils/circuit_breaker.ts`

| Circuit | Failure Threshold | Reset Timeout | Call Timeout |
|---------|------------------|---------------|-------------|
| Gemini | 5 failures | 30 seconds | 15 seconds |
| WhatsApp | 3 failures | 20 seconds | 10 seconds |

States: **CLOSED** (normal) → **OPEN** (failing, returns fallback) → **HALF_OPEN** (testing recovery)

### Process-Level Handlers
**File**: `agents/backend/src/server.ts`

```typescript
process.on('uncaughtException', ...)  // Log + alert + exit(1)
process.on('unhandledRejection', ...) // Log + alert (continues)
process.on('SIGTERM', ...)            // Graceful shutdown (5s grace)
process.on('SIGINT', ...)             // Graceful shutdown (5s grace)
```

---

## Overall Assessment

| Metric | Score | Notes |
|--------|-------|-------|
| **Error Handling** | 8/10 | Comprehensive global handler, circuit breaker, graceful degradation |
| **Security** | 8/10 | CORS, Helmet, rate limiting, JWT separation, Prisma parameterization |
| **Code Quality** | 7/10 | Clean frontend, 17 TODOs in backend, 6 fire-and-forget patterns |
| **Completeness** | 7/10 | Core features complete, 10 placeholder features pending external deps |
| **Reliability** | 8/10 | Circuit breaker, BullMQ retry, Redis caching. Minor gaps in dedup + reconnection |
| **Production Readiness** | 7.5/10 | Fully functional CRM with AI. WhatsApp + payment integrations pending client credentials |

**Bottom Line**: The codebase is well-architected with solid error handling patterns. The main gaps are:
1. **17 TODO placeholders** mostly around WhatsApp notifications (blocked by client not providing credentials)
2. **6 fire-and-forget patterns** that could silently lose notifications
3. **10 incomplete features** mostly blocked by external API credentials not yet provided by the client

The project is **production-ready for core CRM + AI features**. WhatsApp, SMS, payment, and photo upload features require client-provided API credentials to complete.
