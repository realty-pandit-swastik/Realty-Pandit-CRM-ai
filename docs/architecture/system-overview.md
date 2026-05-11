# Realty Pandit — System Overview

> Durable architecture facts. For exhaustive endpoint lists and component inventories, the source of truth is the code itself; this doc captures the durable shape so you don't have to grep from scratch.

## Three panels + their server processes

| Panel | Stack | Local path | Server path | PM2 process | Public URL |
|---|---|---|---|---|---|
| Website (public) | Next.js 16 App Router + React 19 + Tailwind v4 + Framer Motion | `agents/website/` | `/var/www/realty-pandit/website/` | `realty-website` | https://www.realtypandit.in |
| Backend (API) | Express 5 + Prisma + BullMQ + Redis | `agents/backend/` | `/var/www/realty-pandit/backend/` | `realty-backend` | https://api.realtypandit.in |
| Admin (CRM/PWA) | React 19 + Vite 7 + Vite Plugin PWA + CSS custom properties (no Tailwind) | `agents/frontend/` | `/var/www/realty-pandit/frontend/dist/` | `realty-admin` | https://admin.realtypandit.in |

**Server:** `root@72.62.231.224` (VPS, Ubuntu 24.04, Node 20.20.0, public IPv4/IPv6 direct, no NAT). Use this IP — `164.52.218.73` is unreachable via SSH.

**DB:** PostgreSQL on the same VPS, port 5432 (local-only).

## Inbound channels

| Source | Direction | Wired at |
|---|---|---|
| Admin CRM | HTTPS REST (JWT) | `agents/backend/src/routes/*.ts` |
| Public website | HTTPS REST (public + OTP-auth) | `agents/backend/src/routes/public.ts`, `ai_chat.ts` |
| WhatsApp inbound messages | Meta Cloud API webhook | `agents/backend/src/routes/webhooks.ts` → `/webhooks/whatsapp` |
| WhatsApp voice calls | Meta Cloud API webhook → Node forwards to Pipecat → Gemini Live | See [`whatsapp-voice-bot.md`](whatsapp-voice-bot.md) |
| 99acres leads | API key webhook | `/external/99acres/webhook` |
| MagicBricks leads | API key webhook | `/external/magicbricks/webhook` |
| Housing.com leads | API key webhook | `/external/housing/webhook` |
| Facebook leads | Verify-token webhook | `/webhooks/facebook` |
| External API partners | API key | `/external/leads`, `/external/leads/batch` |

## Outbound integrations

| System | Purpose | Env var(s) |
|---|---|---|
| Meta WhatsApp Cloud API | Template + freeform messages, voice calls | `WHATSAPP_*` (see [`../runbooks/meta-template-approval.md`](../runbooks/meta-template-approval.md)) |
| Google Gemini Live | Voice bot LLM | `GEMINI_API_KEY` |
| Google Gemini 2.5 Flash | Text LLM (admin AI + lead matching) | `GEMINI_API_KEY` |
| Razorpay | Subscription payments | `RAZORPAY_*` |
| GlitchTip (self-hosted) | Error tracking | DSN per service (hyphenless UUIDs only — Sentry SDK regex limitation) |

## Authentication shape

- **Admin agents** (CRM users): cookie+JWT auth via `/auth/login`, role-gated by `backend/src/config/permissions.ts` (RBAC matrix is code-based, not DB-based).
- **Public buyers/sellers**: phone-OTP via `/user/login-otp` + `/user/verify-otp`.
- **Partner agents** (external dealers): currently being wired — `agent_auth.ts` has `sendPartnerOTP()` ready; partner portal login route TBD.
- **External integrations** (99acres, MagicBricks, etc.): API key in header.
- **Cookies:** scoped to `.realtypandit.in` (with leading dot) + `sameSite: 'lax'`. See [`../precautions/`](../precautions/) for the CSRF cross-subdomain trap.

## Pipeline + AI automation

The Deal Pipeline is the unified workspace (My Task tab deprecated 2026-04-24 per ADR DEC-003). Six stages, each with its own AI behavior spec in [`../plans/`](../plans/):

1. NEW → [stage-01-new-kra](../plans/2026-04-24-pipeline-stage-01-new-kra.md)
2. QUALIFIED → [stage-02-qualified-kra](../plans/2026-04-24-pipeline-stage-02-qualified-kra.md)
3. MATCHING_APPOINTMENT → [stage-03](../plans/2026-04-24-pipeline-stage-03-matching-appointment-kra.md)
4. VISIT_SCHEDULED → [stage-04](../plans/2026-04-24-pipeline-stage-04-visit-scheduled-kra.md)
5. VISITED → [stage-05](../plans/2026-04-24-pipeline-stage-05-visited-kra.md)
6. NEGOTIATION → [stage-06](../plans/2026-04-24-pipeline-stage-06-negotiation-kra.md)

The AI never closes deals — only flips ON_HOLD or notifies the lead manager.

## Queues + scheduled jobs

- **BullMQ (primary):** scheduled WhatsApp templates, partner upload nudges, daily reports
- **node-cron (fallback):** same jobs if BullMQ is down

Worker file: `agents/backend/src/queues/workers/scheduled_worker.ts`.

## Where to grep when…

| Question | Start here |
|---|---|
| Which endpoint does X? | `agents/backend/src/routes/` then `index.ts` for mount paths |
| What's the DB schema for X? | `agents/backend/prisma/schema.prisma` |
| How does the admin show X? | `agents/frontend/src/components/` and `src/pages/` |
| What WhatsApp template fires when X happens? | `agents/backend/src/services/whatsapp_templates.ts` + grep callers |
| How is permission Y checked? | `agents/backend/src/config/permissions.ts` |
| Where's the Deal Pipeline UI? | `agents/frontend/src/components/DealPipeline.tsx` + `DealDetailModal.tsx` |
