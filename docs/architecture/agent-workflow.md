---
name: Master Agent Workflow System
description: Complete agent roster, roles, inter-agent communication, self-healing deploy loop, and task routing rules for Realty Pandit
type: project
---

# Realty Pandit — Master Agent Workflow System

## Self-Healing Deploy → QA → Fix Loop (MANDATORY)

Every code change MUST follow this loop. No exceptions.

```
User Task → [Orchestrator] routes to correct agent(s)
  ↓
[Dev Agent: Frontend/Backend] → makes code changes locally
  ↓
[Deploy Agent] → mcp__realty-pandit-qa__deploy(component)
  ↓
[Browser QA Agent] → mcp__realty-pandit-qa__qa_verify_task(description, checks)
  ↓
PASS? → Done ✓ → Notify user
FAIL? → [Dev Agent] auto-reads error → fixes code → re-deploy → re-verify
  ↓
Max 3 retry loops. If still failing after 3 → stop and report to user with error details.
```

**QA check shorthand:** `exists:/page#selector`, `text:/page:text`, `noerrors:/page`, `api:/endpoint:200`, `loads:/page:ms`, `responsive:/page`

---

## Agent Roster

### Category 1: Development Agents

| Agent | Location | Owns | Triggers |
|-------|----------|------|----------|
| **Frontend Agent** | `agents/frontend/` + `agents/website/` | Next.js website (port 3000), React admin (port 5173), UI components, pages, styles | Any task about website UI, pages, components, styling, client-side logic |
| **Backend Agent** | `agents/backend/` | Express.js API (port 7071), Prisma models, services, routes, middleware | Any task about APIs, database, models, business logic, server-side |
| **API Agent** | Part of Backend Agent | REST endpoints, request/response schemas, validation, rate limiting | New endpoint creation, API changes, external integrations |

### Category 2: QA & Infrastructure Agents

| Agent | Location | Owns | Triggers |
|-------|----------|------|----------|
| **Browser QA Agent** | `agents/browser-qa/` | Playwright testing, visual checks, error detection, page load verification | Automatically after EVERY deploy — no manual trigger needed |
| **Deploy Agent** | `agents/deployment/` | tar packaging, SCP upload, remote build, PM2 restart | After dev agent completes code changes |
| **Monitor Agent** | `agents/monitor/` | Server health, PM2 status, disk/memory/CPU, uptime checks | Periodic health checks, before/after deploys |
| **Security Agent** | `agents/security/` | Rate limiters, JWT validation, CORS, Helmet, Zod schemas, vulnerability scans | Hourly automated scans, before any auth-related changes |
| **Backup Agent** | `agents/backup/` | Full server backup, code backup, database backup | Before risky deploys, scheduled backups |

### Category 3: Communication & AI Agents

| Agent | Location | Owns | Triggers |
|-------|----------|------|----------|
| **WhatsApp Agent** | `agents/whatsapp/` | WhatsApp Cloud API v17.0, message templates, inbound handling, 24h session window | Any WhatsApp-related task, lead notifications via WA |
| **Voice/VAPI Agent** | `agents/voice_vapi/` | VAPI voice calls, call routing, IVR, call recordings | Voice call features, Panditji voice bot |
| **Email Agent** | `agents/email/` | SMTP (Nodemailer), email templates, transactional emails | Email notifications, reports, welcome emails |
| **Notification Agent** | NEW — to build | **Unified notification dispatch** — routes to WhatsApp/Email/Push/SMS based on user preference and context | Any outbound notification — this agent decides the channel |

### Category 4: Marketing & Social Agents

| Agent | Location | Owns | Triggers |
|-------|----------|------|----------|
| **Meta/Facebook Agent** | NEW — to build | Facebook Lead Ads ingestion, pixel tracking, property catalog sync, ad campaign management | Facebook lead webhooks, ad creation, retargeting |
| **Instagram Agent** | NEW — to build | Property post automation, story templates, Reels creation, DM auto-reply | New property listed → auto-create IG post, story scheduling |
| **SEO Agent** | NEW — to build | Meta tags, sitemaps, JSON-LD schema, city/locality page generation, Google indexing | New property/page added → auto-generate SEO assets |

### Category 5: Business Logic Agents

| Agent | Location | Owns | Triggers |
|-------|----------|------|----------|
| **Leads/CRM Agent** | `agents/connection_api/` + leads_system | Lead scoring, lifecycle management, source tracking, assignment, follow-ups | New lead from any channel → score → assign → track |
| **Matching/Connection Agent** | Uses MatchingEngine service | Buyer-seller matching, property recommendations, deal suggestions | Lead qualified → find matching inventory → notify agent |
| **Deals Agent** | Backend `deals.ts` + `transactions.ts` | Deal pipeline, negotiation tracking, document management, commission calculation | Match accepted → create deal → track through closing |
| **Payment Agent (Razorpay)** | NEW — to build | Subscription payments, commission collection, refunds, payment links | Subscription renewal, deal closing, agent onboarding |
| **Analytics Agent** | Backend `analytics.ts` + `reports.ts` | Dashboard metrics, conversion funnels, agent performance, lead source ROI | Scheduled reports, on-demand analytics queries |
| **Cron/Scheduler Agent** | Backend BullMQ jobs | All 10+ scheduled jobs — follow-ups, reports, health checks, AI Boss cycle | Time-based triggers (see cron schedule in project_architecture.md) |

### Category 6: Workflow Agents (Existing)

| Agent | Location | Owns |
|-------|----------|------|
| **Buyer Workflow** | `agents/buyer_workflow/` | Buyer journey: search → shortlist → visit → negotiate → close |
| **Seller Workflow** | `agents/seller_workflow/` | Seller journey: list → verify → show → negotiate → close |
| **Dealer Workflow** | `agents/dealer_workflow/` | Agent/dealer operations within the platform |
| **AI Automation** | `agents/ai_automation/` | Gemini-powered auto-responses, classification, intent detection |
| **Master Inspector** | `agents/master_inspector/` | Cross-agent quality checks, data integrity |

---

## Task Routing Rules (How Orchestrator Decides)

```
IF task mentions "page", "UI", "component", "style", "layout", "button", "form"
  → Frontend Agent

IF task mentions "API", "endpoint", "database", "model", "route", "Prisma", "service"
  → Backend Agent

IF task mentions "deploy", "push", "release", "go live"
  → Deploy Agent → then Browser QA Agent (auto)

IF task mentions "lead", "CRM", "contact", "scoring", "assignment"
  → Leads/CRM Agent

IF task mentions "deal", "commission", "transaction", "negotiation"
  → Deals Agent

IF task mentions "match", "recommend", "connect buyer"
  → Matching Agent

IF task mentions "WhatsApp", "message template", "WA"
  → WhatsApp Agent

IF task mentions "payment", "Razorpay", "subscription", "billing"
  → Payment Agent

IF task mentions "Facebook", "Meta", "Instagram", "social media", "ad"
  → Meta/Instagram Agent

IF task mentions "notification", "alert", "remind"
  → Notification Agent

IF task mentions "security", "auth", "JWT", "rate limit", "vulnerability"
  → Security Agent

IF task mentions "backup", "restore"
  → Backup Agent

IF task mentions "monitor", "health", "server", "disk", "memory"
  → Monitor Agent

IF task mentions "SEO", "sitemap", "meta tags", "indexing"
  → SEO Agent

IF task involves multiple areas → Orchestrator splits into sub-tasks for each agent
```

---

## Inter-Agent Communication Flows

### Flow 1: New Lead (any source)
```
[WhatsApp/Website/Facebook/99acres/MagicBricks/Housing]
  → Leads/CRM Agent (create contact, score, classify)
  → Matching Agent (find matching inventory)
  → Notification Agent (notify assigned agent via WhatsApp + Email)
```

### Flow 2: Property Listed
```
[Frontend Agent] (property form submitted)
  → Backend Agent (save to DB, validate, moderate images)
  → SEO Agent (generate meta, JSON-LD, add to sitemap)
  → Meta/Instagram Agent (auto-post to social media)
  → Matching Agent (find matching buyers → notify them)
```

### Flow 3: Visit Scheduled
```
[Leads/CRM Agent] (visit booked via chat/form)
  → Notification Agent (confirm to buyer via WhatsApp + Email)
  → Notification Agent (alert agent with visit details)
  → Cron Agent (schedule reminder 1hr before)
  → [After visit] Leads/CRM Agent (update lifecycle → VISITED)
```

### Flow 4: Deal Lifecycle
```
[Matching Agent] (buyer interested in property)
  → Deals Agent (create deal, set stage: NEGOTIATION)
  → Notification Agent (notify both parties)
  → Payment Agent (generate payment link when agreed)
  → Deals Agent (close deal, calculate commission)
  → Analytics Agent (update conversion metrics)
```

### Flow 5: Error Recovery (Self-Healing)
```
[Monitor Agent] (detects server issue / high error rate)
  → Notification Agent (alert dev team)
  → Backend/Frontend Agent (auto-diagnose from error logs)
  → Deploy Agent (hotfix deploy)
  → Browser QA Agent (verify fix)
```

### Flow 6: Deploy Any Component
```
[Dev Agent] completes changes
  → Deploy Agent: mcp__realty-pandit-qa__deploy("website"|"backend"|"frontend")
  → Browser QA Agent: mcp__realty-pandit-qa__qa_verify_task(description, checks[])
  → IF FAIL: Dev Agent reads errors → fixes → re-deploy → re-verify (max 3x)
  → IF PASS: Done. Report success to user.
```

---

## MCP Tool Mapping

| MCP Tool | Used By |
|----------|---------|
| `mcp__realty-pandit-qa__deploy` | Deploy Agent |
| `mcp__realty-pandit-qa__qa_verify_task` | Browser QA Agent |
| `mcp__realty-pandit-qa__qa_scan` | Browser QA Agent (full site scan) |
| `mcp__realty-pandit-qa__qa_report` | Browser QA Agent (generate report) |
| `mcp__realty-pandit-qa__server_health` | Monitor Agent |

---

## Agent Build Status (as of 2026-03-23)

All 6 agents BUILT:

1. **Payment Agent (Razorpay)** — BUILT
   - Backend: `services/payment.ts` (order creation, verification, webhooks, payment links, refunds)
   - Routes: `routes/payments.ts` → mounted at `/api/payments` + `/webhooks/razorpay`
   - Agent: `agents/payment/run.js` (status, plans)
   - Orchestrator: `payment`, `payment:plans`
   - **Needs**: `npm install razorpay` on server + env vars: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`

2. **Notification Agent** — BUILT (wrapper for existing backend service)
   - Backend: already exists in `agents/notification_agent.ts` (13+ templates, multi-channel)
   - Agent: `agents/notification/run.js` (status, templates)
   - Orchestrator: `notify`, `notify:templates`

3. **Meta/Facebook Agent** — BUILT
   - Backend: `integrations/facebook.ts` (Lead Ads webhook with Graph API fetch)
   - Routes: mounted at `/external/facebook` (GET webhook verify + POST lead ingest)
   - Agent: `agents/meta/run.js` (status, leads)
   - Orchestrator: `meta`, `meta:leads`
   - **Needs**: env vars: `FB_APP_ID`, `FB_APP_SECRET`, `FB_ACCESS_TOKEN`, `FB_PAGE_ID`, `FB_PIXEL_ID`, `FB_WEBHOOK_VERIFY_TOKEN`

4. **Instagram Agent** — BUILT
   - Agent: `agents/instagram/run.js` (status, auto-post from property listings)
   - Uses Instagram Graph API via Meta Business Suite
   - Orchestrator: `instagram`, `instagram:post`
   - **Needs**: env vars: `IG_ACCESS_TOKEN` (or shares `FB_ACCESS_TOKEN`), `IG_BUSINESS_ACCOUNT_ID`

5. **SEO Agent** — BUILT
   - Agent: `agents/seo/run.js` (status check, full audit of all public pages)
   - Checks: robots.txt, sitemap.xml, meta tags, OG tags, JSON-LD, canonical, H1, page load times
   - Orchestrator: `seo`, `seo:audit`
   - **Note**: Sitemap generation should be added in Next.js (`app/sitemap.ts`)

6. **Analytics Agent** — BUILT (wrapper for existing backend endpoints)
   - Backend: already exists in `analytics.ts` (6 endpoints) + `reports.ts` (26 endpoints)
   - Agent: `agents/analytics/run.js` (status overview)
   - Orchestrator: `analytics`

**How to apply:** All agents are registered in orchestrator.js. Run via `node orchestrator.js <command>`. Backend routes need deploy to server. Env vars need to be set on server.
