---
name: Complete Project Reference — URLs, APIs, Credentials, Contacts
description: Every URL, API endpoint, credential location, service, contact, and external integration for Realty Pandit — verified from server 2026-04-06
type: reference
---

# Realty Pandit — Complete Reference (Verified 2026-04-06)

## Client & Project
- **Client**: Sunny Sharma
- **Project**: Realty Pandit — Indian real estate platform (buy/sell/rent properties)
- **Phases 1-6**: Complete
- **Phase 7 (Deal Pipeline)**: Backend + Admin UI built (DealPipeline.tsx, deal_service.ts, transaction_state_machine.ts). 8 stages: NEW→MATCHED→VISIT_SCHEDULED→VISITED→NEGOTIATION→CLOSED_WON/CLOSED_LOST/ON_HOLD
- **Partner Marketplace**: Admin UI exists (PartnerManagement.tsx), backend routes exist. Needs real-world testing.

## Live URLs
| Service | URL | Port | Nginx |
|---------|-----|------|-------|
| **Website** | https://www.realtypandit.in | 3000 | realtypandit.in |
| **Backend API** | https://api.realtypandit.in | 7071 | api.realtypandit.in |
| **Admin Panel** | https://admin.realtypandit.in | 5173 (static serve) | admin.realtypandit.in |
| **Health Check** | https://api.realtypandit.in/health | 7071 | — |

All 3 subdomains on same Let's Encrypt cert (`/etc/letsencrypt/live/realtypandit.in/`).

## Server
- **IP**: 72.62.231.224
- **OS**: Ubuntu 24.04
- **SSH**: `ssh -i ~/.ssh/realty_pandit_key -F /dev/null root@72.62.231.224`
- **SSH Key**: `~/.ssh/realty_pandit_key` (use `fs.copyFileSync` in Node, NOT shell `cp`)
- **Web Root**: `/var/www/realty-pandit/`
- **Disk**: 96GB (15% used, 83GB free)
- **RAM**: 7.8GB (1.7GB used, 6.0GB available)
- **Uptime**: 49 days (as of 2026-04-06)
- **Node**: v20.20.0, npm 10.8.2

## PM2 Processes (all running as root)
| Process | Mode | Memory | Restarts |
|---------|------|--------|----------|
| realty-backend (x2) | cluster | 283+294 MB | 36 each |
| realty-website | fork | 63 MB | 0 |
| realty-admin | fork (serve -s dist) | 72 MB | 40 |
| pm2-logrotate | module | 71 MB | 0 |

Backend ecosystem: 2 cluster instances, 1GB max memory restart, only instance 0 runs BullMQ workers.

## Local Code Paths
| Component | Local Path | Server Path |
|-----------|-----------|-------------|
| Website (Next.js 16.1.6) | `agents/website/` | `/var/www/realty-pandit/website/` |
| Backend (Express 5.2.1+Prisma) | `agents/backend/` | `/var/www/realty-pandit/backend/` |
| Admin (React 19.2+Vite 7.2) | `agents/frontend/` | `/var/www/realty-pandit/frontend/` |

## Database
- **DB**: PostgreSQL on localhost:5432
- **Name**: reality_pandit
- **User**: realty_user
- **Connection**: TCP (peer auth fails, must use `-h localhost`)
- **Tables**: 58 total (57 user + 1 _prisma_migrations)
- **ORM**: Prisma 5.10.0
- **Top data**: 1,829 interactions, 1,288 notifications, 699 contacts, 445 emails, 382 chat sessions, 152 inventory
- **~20 empty tables**: campaigns, voice_calls, website_leads, projects, etc. (features built, no real usage yet)

## External Services & Env Var Status

### Active (configured in .env)
| Service | Env Vars | Status |
|---------|----------|--------|
| **WhatsApp Cloud API v17.0** | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` (1021151161081768), `WHATSAPP_BUSINESS_ACCOUNT_ID` (2124684824933246), `META_APP_ID`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Active |
| **Google Gemini 2.5 Flash** | `GEMINI_API_KEY` | Active (500RPM of 1000RPM paid tier) |
| **Redis** | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Active (BullMQ + caching) |
| **Google Maps** | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Active |
| **Google Analytics** | `G-WJF3Y3SXM3` | Active |
| **Google Tag Manager** | `GTM-TBFWLRD7` | Active |
| **VAPID Push** | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Active |
| **99acres Pull API** | `NINETY_NINE_ACRES_USERNAME` (REALTY.PUNDIT2), password configured, poller runs every 10min | Credentials exist, polling active |

### Not Configured (missing from .env)
| Service | Missing Env Vars | Impact |
|---------|-----------------|--------|
| **VAPI (Voice)** | `VAPI_PRIVATE_KEY` | Voice calls won't work |
| **Razorpay (Payments)** | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Payment gateway disabled |
| **Cloudinary (Media CDN)** | `CLOUDINARY_*` | Image upload to CDN disabled (local only?) |
| **Facebook Lead Ads** | `FB_WEBHOOK_VERIFY_TOKEN` | Facebook lead integration disabled |
| **SMTP (Email)** | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Email sending may not work |
| **External API Keys** | `EXTERNAL_API_KEYS` | External lead webhook auth disabled |

### Payment Plans (Razorpay, code exists but not configured)
BASIC = 999 INR, PRO = 2499 INR, PREMIUM = 4999 INR, ENTERPRISE = 9999 INR

## Webhook Endpoints
| Endpoint | Source | Auth |
|----------|--------|------|
| `/webhooks/whatsapp` | WhatsApp Cloud API | Verify token |
| `/webhooks/voice` | VAPI | Webhook |
| `/external/99acres/webhook` | 99acres | API key |
| `/external/magicbricks/webhook` | MagicBricks | API key |
| `/external/housing/webhook` | Housing.com | API key |
| `/webhooks/facebook/webhook` | Facebook Lead Ads | Verify token |

## AI/Bot System — Panditji
- **Engine**: Google Gemini 2.5 Flash (@google/generative-ai 0.24.1)
- **Channels**: WhatsApp (text), VAPI (voice — not configured)
- **14 AI Agents**: Classifier, Sales, Partner, Admin, Inventory, QA, Coordination, Matching, Security, Notification, Marketing, Audit, PromptEngineer, AI Boss (2AM IST)
- **Rate Limit**: 500RPM, MD5 response cache, circuit breaker (1s/2s/4s retry)
- **Self-improving**: AI Boss daily at 2AM → audit → prompt improvements → PromptOverride table → email report

## Admin Panel — 21 Views
dashboard, chats, calendar, emails, calls, inventory, property-map, live-status, deals, leads, buyer-chat, partners, team, reports, ai-dashboard, agent-logs, override, workflows, marketing, tasks, analytics

**Key permissions**: `view_inventory`, `manage_agents`, `view_reports`
**Roles**: super_boss, manager, employee
**Styling**: CSS custom properties (NOT Tailwind), inline style objects
**Routing**: State-based view switching (react-router-dom installed but unused)
**Mobile**: 10 dedicated mobile components (MobileLayout, MobileDashboard, etc.)
**Reports**: 26 types across 8 categories, export to CSV/Excel/PDF
**Charts**: recharts library

## CORS Allowed Origins
`realtypandit.in`, `www.realtypandit.in`, `api.realtypandit.in`, `admin.realtypandit.in`, `localhost:3001`, `localhost:5173`, `localhost:3000`, `72.62.231.224:5173`, `72.62.231.224:3000`

## Company Contact
- **Phone**: +918178491914
- **Email**: info@realtypandit.in
- **Support**: support@realtypandit.in (VAPID subject)

## Windows Development Environment (CRITICAL)
- **Shell**: Must use `BASH_SHELL = 'C:/Program Files/Git/bin/bash.exe'` for execSync
- **SSH Key**: Use `fs.copyFileSync` + `fs.chmodSync`, NOT shell `cp`
- **SSH Config**: Always use `-F /dev/null` to bypass Windows SSH config permission errors

## Deploy Workflow (MANDATORY)
```
Code change → mcp__realty-pandit-qa__deploy(component)
  → mcp__realty-pandit-qa__qa_verify_task(description, checks[])
  → PASS: Done
  → FAIL: Auto-fix → re-deploy → re-verify (max 3 retries)
```

**QA check shorthand**: `exists:/page#selector`, `text:/page:text`, `noerrors:/page`, `api:/endpoint:200`, `loads:/page:ms`, `responsive:/page`

## MCP Servers (configured in .mcp.json)
| MCP Server | Tools | Purpose |
|------------|-------|---------|
| **realty-pandit-qa** | deploy, qa_verify_task, qa_scan, qa_report, server_health | Browser QA, deploy, health |
| **stitch** | Google Stitch UI design | UI design tool |
| **claude_ai_Gmail** | gmail_search_messages, gmail_read_message, gmail_create_draft, etc. | Gmail integration |

## Nginx Rate Limits
- `api_limit` — for api.realtypandit.in (burst=50)
- `web_limit` — for realtypandit.in (burst=30)

## Duplicate src/ Directory Warning
Server has `/var/www/realty-pandit/backend/src/src/` — accidental nested copy. Canonical source is `src/`.
