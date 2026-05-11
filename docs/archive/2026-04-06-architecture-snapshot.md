# Realty Pandit — Full Architecture Map (Verified 2026-04-06)

## Tech Stack

| Component | Stack | Version |
|-----------|-------|---------|
| **Website** | Next.js (App Router) + React + Tailwind v4 + Framer Motion | Next 16.1.6, React 19.2.3 |
| **Backend** | Express 5 + Prisma + BullMQ + Redis | Express 5.2.1, Prisma 5.10.0 |
| **Admin** | React + Vite + CSS Custom Properties (no Tailwind) | React 19.2, Vite 7.2 |
| **AI** | Google Gemini 2.5 Flash | @google/generative-ai 0.24.1 |
| **DB** | PostgreSQL | localhost:5432 |
| **Queue** | BullMQ (primary) + node-cron (fallback) | bullmq 5.69.3 |
| **Server** | Ubuntu 24.04, Node 20.20.0 | 96GB disk, 7.8GB RAM |
| **VPS SSH IP** | `72.62.231.224` (use this — `164.52.218.73` is unreachable via SSH) | root@72.62.231.224 |

## Backend Routes (33 route files, 343+ endpoints)

### Public Routes (no auth)

| Mount Path | File | Key Endpoints |
|-----------|------|---------------|
| `/auth` | auth.ts | POST /login, /register, /refresh, /setup, /forgot-password, /verify-reset-otp, /change-password, /setup-password; GET /me, /validate-setup-token |
| `/user` | user_auth.ts | POST /login-otp, /verify-otp, /logout; GET /me |
| `/webhooks` | webhooks.ts | POST /whatsapp, /voice; GET /whatsapp (verification) |
| `/public` | public.ts | GET /properties, /properties/:id, /featured-properties, /similar-properties/:id, /locations, /stats, /testimonials, /matches, /projects, /agents, /geo/*; POST /contact, /lead, /lead-requirements, /newsletter, /schedule-visit, /save-property, /share-property-whatsapp, /post-property, /track-property-view |
| `/public` | ai_chat.ts | POST /ai-chat, /ai-chat/book-visit |
| `/public/auth` | auth_otp.ts | POST /send-confirmation; GET /check-status |
| `/public/master` | master.ts | GET /categories, /subcategories, /types, /configurations, /usage-types, /investment-types, /tree |
| `/public` | classification.ts | GET — 7 classification endpoints |
| `/api/workflow` | workflow.ts | GET /definition; POST /next-step, /previous-step, /validate, /options, /visible-steps, /summary, /commit, /upload-media, /upload-video, /upload-document |
| `/api/chat` | chat_workflow.ts | POST /start, /message, /upload-media, /confirm, /buyer/action, /buyer/book; GET /session/:id |

### Authenticated Routes (Admin JWT)

| Mount Path | File | Key Endpoints |
|-----------|------|---------------|
| `/api` | api.ts | Contacts CRUD, agents, dashboard stats, partners CRUD, commissions |
| `/api/leads` | leads.ts | Lead management: by-source, search, scoring, matching, assignment |
| `/api/calls` | staff_calls.ts | Call upload, processing, voice logs |
| `/api/calendar` | calendar.ts | Appointments CRUD + summary |
| `/api/email` | email.ts | Email send/receive, bulk-send, search |
| `/api/team` | team.ts | Team CRUD, password management, bulk inventory upload |
| `/api/agent-dashboard` | agent_dashboard.ts | Health, metrics, funnel, logs, QA, campaigns |
| `/api/transactions` | transactions.ts | Transaction pipeline, reassignment |
| `/api/deals` | deals.ts | Deal CRUD, pipeline, timeline, queries |
| `/api/analytics` | analytics.ts | Market trends, performance, lead sources, property trends, financial |
| `/api/reports` | reports.ts | 26 report endpoints across 8 categories |
| `/api/workflows` | workflows.ts | Workflow automation CRUD + toggle + test |
| `/api/marketing` | marketing.ts | Templates + campaigns CRUD, A/B testing, launch |
| `/api/tasks` | tasks.ts | Projects + tasks CRUD, bulk-import |
| `/api/notifications` | notifications.ts | Preferences, push subscribe, history, read/click |
| `/api/agent-leads` | agent_leads.ts | Buyer leads, appointments |
| `/api/integrations` | integrations.ts | 99acres sync, sync status |
| `/api/payments` | payments.ts | Razorpay: plans, create-order, verify, refund |
| `/inventory` + `/api/inventory` | inventory.ts | Full inventory CRUD, media, documents, enrichment, share, transfer, approve/reject |
| `/health` | health.ts | Circuit breaker status, reset |

### External Routes

| Mount Path | File | Auth |
|-----------|------|------|
| `/agent` | agent.ts | Agent JWT — dashboard, inventory, leads, deals, appointments, team |
| `/builder` | builder.ts | Builder JWT — projects, leads, appointments, dashboard |
| `/external` | external_leads.ts | API Key — POST /leads, /leads/batch |
| `/external/99acres` | 99acres.ts | API Key — POST /webhook |
| `/external/magicbricks` | magicbricks.ts | API Key — POST /webhook |
| `/external/housing` | housing.ts | API Key — POST /webhook |
| `/webhooks/facebook` | facebook.ts | Verify token — GET/POST /webhook |

## Database (58 tables, PostgreSQL)

### Active Tables (by row count, 2026-04-06)

| Table | Rows | Purpose |
|-------|------|---------|
| interactions | 1,829 | All communication logs |
| notifications | 1,288 | In-app + push notifications |
| contacts | 699 | SSOT for all people (PK=phone_number) |
| emails | 445 | Email records |
| chat_workflow_sessions | 382 | Chat-based property intake sessions |
| inventory | 152 | Properties |
| pending_messages | 91 | Queued WhatsApp messages (24h window) |
| tasks_followups | 91 | Scheduled follow-ups |
| master_property_types | 59 | Property type classifications |
| owners | 42 | Property owners |
| flat_property_types | 38 | 37 flat types (11 res + 25 comm + 1 agri) |
| subscriptions | 36 | Agent subscription plans |
| agents | 32 | Internal staff |
| audit_reports | 25 | AI Boss daily findings |
| agent_action_logs | 25 | Multi-agent audit trail |
| property_shares | 23 | Property share tracking |
| transaction_logs | 23 | Deal state change audit |
| master_sub_categories | 22 | Property sub-categories |
| conversation_sessions | 15 | WhatsApp workflow sessions |
| partner_agents | 11 | External marketplace agents |
| master_configurations | 9 | BHK configs |
| prompt_overrides | 8 | AI-learned prompt rules |
| transactions | 5 | Active deals |

### Empty Tables (features built but unused)

campaigns, campaign_templates, voice_calls, whatsapp_messages, website_leads, projects, project_units, project_media, builder_leads, builder_appointments, builder_onboarding_sessions, agent_onboarding_sessions, workflow_executions, workflows, push_subscriptions, scheduled_visits, staff_calls, newsletter_subscribers, appointments, deal_queries, commissions, work_projects, tasks, notification_preferences

## Prisma Models — Grouped

**CRM (9):** Contact, Interaction, WhatsAppMessage, VoiceCall, Email, WebsiteLead, NewsletterSubscriber, LeadScore, TaskFollowup

**Users (4):** Agent, Tenant, Owner, PartnerAgent

**Property (12):** Inventory, InventoryDocument, InventoryCounter, FlatPropertyType, PropertyCategory, PropertySubCategory, PropertyType, PropertyConfiguration, UsageType, InvestmentType, PropertyShare, SavedProperty

**Builder Projects (5):** Project, ProjectUnit, ProjectMedia, BuilderLead, BuilderAppointment

**Calendar (2):** Appointment, ScheduledVisit

**Deals (3):** Transaction, TransactionLog, DealQuery

**Subscriptions (2):** Subscription, Commission

**AI/Chat (5):** ConversationSession, ChatWorkflowSession, BuilderOnboardingSession, AgentOnboardingSession, PromptOverride

**Workflow (4):** Workflow, WorkflowExecution, WorkProject, Task

**Marketing (2):** CampaignTemplate, Campaign

**Staff/Monitoring (3):** StaffCall, AgentActionLog, QALog, AuditReport

**Notifications (3):** Notification, NotificationPreference, PushSubscription

**System (2):** PendingMessage, IntegrationSync

**20+ Enums:** ContactType, KeyHolderType, OwnershipType, CallStatus, AgentPackage, AgentStatus, PartnerCategory, OwnerScope, ExternalOwnerType, OwnerStatus, PlanType, SubscriptionStatus, ProjectType, ProjectStatus, ProjectListingStatus, MediaType, BuilderLeadStatus, BuilderAppointmentStatus, AppointmentType, AppointmentStatus, TransactionType, TransactionStatus, RoleContext, TransactionLogAction

## Services (50+ files)

### Core

| Service | Purpose |
|---------|---------|
| `message_router.ts` | Master Orchestrator — routes to correct AI agent by contact type + domain |
| `webhook_processor.ts` | Core message processing (BullMQ worker or sync fallback) |
| `chat_handler.ts` | WhatsApp property search, filtering, visit booking |
| `decision_engine.ts` | Auto-triggers calls/messages, handles missed calls, schedules follow-ups |
| `interaction_engine.ts` | Probability-based engagement, monitors silence periods |
| `matching_engine.ts` | Budget fit, location match, type match, subscription priority, freshness |
| `transaction_state_machine.ts` | Strict deal transitions: NEW→MATCHED→VISIT_SCHEDULED→VISITED→NEGOTIATION→CLOSED |
| `lead_score.ts` | Scoring: intent + engagement + reliability + urgency + no-show tracking |
| `lead_assignment.ts` | Round-robin lead distribution |

### AI/ML

| Service | Purpose |
|---------|---------|
| `llm.ts` | Gemini 2.5 Flash — 500RPM limit, circuit breaker, Redis cache, token bucket |
| `ai_boss.ts` | Daily 2AM: audit conversations → auto-deploy prompt improvements → email report |
| `system_prompt.ts` | Dynamic prompts with DB-stored overrides |
| `image_moderation.ts` | Gemini vision: explicit content, phone numbers, watermarks |
| `call_extractor.ts` | AI extraction from call transcripts (intent, location, budget) |

### Communication

| Service | Purpose |
|---------|---------|
| `whatsapp.ts` | Meta Graph API v17.0, circuit breaker, retry, 24h session tracking |
| `voice.ts` | VAPI — outbound calls, webhooks, transcripts, 24h spam cooldown |
| `email_service.ts` | Nodemailer SMTP |
| `push_service.ts` | Web push via VAPID |
| `notify.ts` | Unified dispatcher (WhatsApp + email + push) |
| `pending_message_queue.ts` | Queue for expired WhatsApp sessions |

### Business Logic

| Service | Purpose |
|---------|---------|
| `deal_service.ts` | Deal management, visibility, notifications |
| `payment.ts` | Razorpay: BASIC=999, PRO=2499, PREMIUM=4999, ENTERPRISE=9999 INR |
| `subscription.ts` | Plan management (FREE/BASIC/PRO/PREMIUM) |
| `commission.ts` | Agent commissions |
| `calendar.ts` | Appointments |
| `workflow_engine.ts` | Configurable automation (triggers → conditions → actions) |
| `storage.ts` | Cloudinary file storage |
| `ninety_nine_acres_poller.ts` | XML API polling every 10min (max 6 req/hr, 2-day window) |

## 14 AI Agents

| # | Agent | Purpose |
|---|-------|---------|
| 1 | `classifier_agent.ts` | Classifies messages by domain intent |
| 2 | `sales_agent.ts` | Buyer/seller conversations |
| 3 | `partner_agent.ts` | External partner/dealer interactions |
| 4 | `admin_agent.ts` | Management/admin queries |
| 5 | `inventory_agent.ts` | Property listing management |
| 6 | `matching_agent.ts` | Property-buyer matching |
| 7 | `coordination_agent.ts` | Cross-party deal coordination |
| 8 | `notification_agent.ts` | Smart notification decisions |
| 9 | `marketing_agent.ts` | Campaign management |
| 10 | `security_agent.ts` | Anomaly detection, hourly scans |
| 11 | `qa_agent.ts` | Quality scoring, daily health, data integrity |
| 12 | `audit_agent.ts` | Conversation auditing (AI Boss input) |
| 13 | `prompt_engineer_agent.ts` | Auto-improves system prompts from audit |
| 14 | AI Boss (`ai_boss.ts`) | Orchestrator: daily audit → prompt deploy → email report |

**Architecture:** Agents receive `AgentContext` and return `AgentResponse`. They do NOT access Prisma directly — MessageRouter handles all DB ops.

## Middleware (7 files)

| File | Purpose |
|------|---------|
| `auth.ts` | JWT auth, role-based (`requireRole`), permission-based (`checkPermission`) |
| `agent_auth.ts` | Agent JWT, package check, listing limit, buyer data masking for FREE tier |
| `apikey.ts` | X-API-Key for external integrations |
| `rate_limit.ts` | 8 rate limiters: auth(100), public(200), webhook(200), external(100), agent(100), api(500), workflow(300), chat(300) per 15min |
| `cache.ts` | Response caching (300s-86400s TTLs on public routes) |
| `error_handler.ts` | Global error handler |
| `request_logger.ts` | Request logging with request IDs |

## BullMQ Scheduled Jobs (instance 0 only)

| Job | Schedule | Purpose |
|-----|----------|---------|
| pending-actions | Every 60s | Check contacts with pending next_action_at |
| daily-report | 9:00 PM IST | Lead + interaction summary via WhatsApp |
| subscription-expiry | 12:00 AM IST | Expire partner subscriptions |
| qa-health-report | 9:00 AM IST | QA daily health report |
| qa-integrity-check | 3:00 AM IST | Data integrity check |
| ai-boss-cycle | 2:00 AM IST | Self-improvement cycle |
| followup-check | Every hour | Due follow-ups |
| call-processor | Every 10s | Transcribe + AI-extract staff calls |
| interaction-triggers | Every hour | Silence-based engagement triggers |
| security-scan | Every hour | Anomaly detection |
| 99acres-poll | Every 10min | Fetch leads from XML API |
| lead-escalation | On-demand (20min) | Escalate uncontacted leads to super_boss |
| appointment-reminders | Every 15min | Notify agents about upcoming appointments |
| task-due-reminders | 9:00 AM IST | Tasks due today |
| task-overdue-alerts | 9:00 AM IST | Overdue task alerts |
| daily-summary-digest | 9:05 AM IST | Stats to managers/super_boss |

## 4 Auth Systems

| System | JWT Secret | Token Key | Login Flow |
|--------|-----------|-----------|------------|
| Admin | `JWT_SECRET` | `token` + `refreshToken` | Phone + password |
| User | `USER_JWT_SECRET` | `user_token` | OTP via phone |
| Agent | `AGENT_JWT_SECRET` | `agent_token` | OTP or password |
| Builder | `BUILDER_JWT_SECRET` | `builder_token` | OTP |

## Security

Helmet, CORS whitelist (6 origins), 8 rate limiters, 4 JWT secrets, bcrypt passwords, Zod validation, API key auth for external, permission engine with phone/name masking for non-super_boss, circuit breakers on Gemini + WhatsApp.

## Missing/Unconfigured Env Vars

`VAPI_PRIVATE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `CLOUDINARY_*`, `FB_WEBHOOK_VERIFY_TOKEN`, `EXTERNAL_API_KEYS`

**Why:** Payment gateway, Cloudinary CDN, and Facebook integration are deferred.
**How to apply:** Skip these unless user specifically asks to configure them.
