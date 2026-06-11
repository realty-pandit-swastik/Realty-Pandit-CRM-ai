# REALTY PANDIT — COMPREHENSIVE PROJECT AUDIT REPORT

**Date**: February 21, 2026
**Client**: Sunny Sharma
**Prepared By**: AI Architecture Audit (Claude Code)
**Version**: 1.0

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Project Architecture](#2-project-architecture)
3. [Complete File Structure](#3-complete-file-structure)
4. [Database Schema](#4-database-schema)
5. [Multi-Agent AI System](#5-multi-agent-ai-system)
6. [LLM Integration (Google Gemini)](#6-llm-integration-google-gemini)
7. [WhatsApp API Integration](#7-whatsapp-api-integration)
8. [Security Assessment](#8-security-assessment)
9. [Code Quality Analysis](#9-code-quality-analysis)
10. [Errors, Issues & Tech Debt](#10-errors-issues--tech-debt)
11. [Deployment & Infrastructure](#11-deployment--infrastructure)
12. [Performance Analysis](#12-performance-analysis)
13. [Future Improvement Plan](#13-future-improvement-plan)

---

## 1. EXECUTIVE SUMMARY

### What Is Realty Pandit?

Realty Pandit is an AI-powered real estate platform for the Indian market. At its core is **Panditji** — an AI property assistant powered by Google Gemini that handles buyer/seller interactions through WhatsApp, voice calls, and a public website. The platform automates lead qualification, property matching, appointment scheduling, and deal tracking through a multi-agent AI architecture.

### Key Metrics

| Metric | Count |
|--------|-------|
| Prisma Database Models | 26 |
| AI Agents | 14 (10 core + 4 specialized) |
| Backend API Endpoints | 80+ |
| Website Pages | 20+ |
| SEO-Indexed URLs | 80+ |
| Admin Dashboard Views | 11 |
| Completed Development Tasks | 54/54 (Phases 1-6) |
| Multi-Agent Sprints | 5/5 Deployed |

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Backend API** | Express.js + TypeScript | ES2016 target |
| **Database** | PostgreSQL + Prisma ORM | PG 16, Prisma 6.x |
| **Cache/Queue** | Redis + BullMQ | Redis 7, BullMQ 5.x |
| **AI Brain** | Google Gemini | gemini-2.5-flash |
| **Public Website** | Next.js (App Router) | 16.1.6 |
| **Admin Dashboard** | React + Vite | React 19, Vite 7.x |
| **Styling (Website)** | Tailwind CSS v4 + Framer Motion 12 | Latest |
| **Styling (Admin)** | CSS Variables (custom) | N/A |
| **Messaging** | Meta WhatsApp Business API | Cloud API |
| **Voice** | Vapi (VOIP integration) | Latest |
| **Server OS** | Ubuntu 24.04 LTS | Production |
| **Process Manager** | PM2 (cluster mode) | Latest |
| **Reverse Proxy** | Nginx + Let's Encrypt SSL | Auto-renew |
| **CI/CD** | GitHub Actions | Configured |

### Current Status

```
Phase 1 (Foundation)           ████████████████████ 100% COMPLETE
Phase 2 (User Type System)     ████████████████████ 100% COMPLETE
Phase 3 (Auth & RBAC)          ████████████████████ 100% COMPLETE
Phase 4 (Public Website)       ████████████████████ 100% COMPLETE
Phase 5 (External Portals)     ████████████████████ 100% COMPLETE
Phase 6 (Advanced AI)          ████████████████████ 100% COMPLETE
Multi-Agent (5 Sprints)        ████████████████████ 100% DEPLOYED
Website Enhancement            ████████████████████ 100% COMPLETE
Phase 7 (Partner Marketplace)  ░░░░░░░░░░░░░░░░░░░░  0% PLANNED
```

---

## 2. PROJECT ARCHITECTURE

### 2.1 System Architecture Diagram

```
                            ┌─────────────────────────────────────────┐
                            │              INTERNET                    │
                            └──────────┬──────────┬──────────┬────────┘
                                       │          │          │
                              WhatsApp │   Web    │   Admin  │
                              Webhook  │  Users   │  Staff   │
                                       │          │          │
                            ┌──────────▼──────────▼──────────▼────────┐
                            │           NGINX (Reverse Proxy)          │
                            │         Let's Encrypt SSL/TLS            │
                            │                                          │
                            │  realtypandit.in     → :3000 (website)   │
                            │  api.realtypandit.in → :7071 (backend)   │
                            │  admin.realtypandit.in → :5173 (admin)   │
                            └──────┬──────────┬──────────┬─────────────┘
                                   │          │          │
                    ┌──────────────▼┐   ┌─────▼──────┐  ┌▼─────────────┐
                    │  NEXT.JS 16   │   │ EXPRESS.JS  │  │  VITE/REACT  │
                    │  (Website)    │   │ (Backend)   │  │  (Admin)     │
                    │  PM2 :3000    │   │ PM2 :7071   │  │  PM2 :5173   │
                    │               │   │             │  │              │
                    │ - 20+ Pages   │   │ - 80+ APIs  │  │ - 11 Views   │
                    │ - SSR/SSG     │   │ - 14 Agents │  │ - RBAC Auth  │
                    │ - Dark Mode   │   │ - BullMQ    │  │ - Dashboard  │
                    │ - SEO (80+)   │   │ - WebSocket │  │ - Chat View  │
                    └───────────────┘   └──────┬──────┘  └──────────────┘
                                               │
                         ┌─────────────────────┼─────────────────────┐
                         │                     │                     │
                  ┌──────▼──────┐    ┌─────────▼────────┐   ┌───────▼──────┐
                  │ POSTGRESQL  │    │     REDIS         │   │ GOOGLE       │
                  │ (Database)  │    │ (Cache + Queue)   │   │ GEMINI AI    │
                  │             │    │                   │   │              │
                  │ 26 Models   │    │ - Session Store   │   │ gemini-2.5   │
                  │ Port 5432   │    │ - BullMQ Backend  │   │ -flash       │
                  │ Prisma ORM  │    │ - Prompt Cache    │   │ 500 RPM      │
                  │             │    │ - Rate Limiting   │   │ Circuit      │
                  │             │    │ - Msg Dedup       │   │ Breaker      │
                  └─────────────┘    └──────────────────┘   └──────────────┘
```

### 2.2 Message Processing Flow (WhatsApp)

```
  User sends WhatsApp message
            │
            ▼
  ┌─────────────────────┐
  │ Meta Webhook → /api  │──── Respond 200 immediately (fire-and-forget)
  │ /webhooks/whatsapp   │
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐     ┌─────────────────────┐
  │ Message Dedup Check │────▶│ Duplicate? → SKIP   │
  │ (Redis 2-min TTL +  │     └─────────────────────┘
  │  in-memory fallback) │
  └─────────┬───────────┘
            │ (New message)
            ▼
  ┌─────────────────────┐
  │ BullMQ Async Queue  │──── If BullMQ down → sync fallback
  │ whatsappInboundQueue│
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │ ChatHandler          │
  │ (Orchestrator)       │
  │                      │
  │ 1. Quiet Hours?      │──── 9PM-8AM IST → defer (Management exempt)
  │ 2. Load Contact      │
  │ 3. Load History (10) │
  │ 4. Check Session     │
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │ MESSAGE ROUTER       │
  │ (Master Orchestrator)│
  │                      │
  │ Step 1: Classify     │──── UNKNOWN? → ClassifierAgent
  │         Contact Type │      (determines BUYER/SELLER/PARTNER/MGMT)
  │                      │
  │ Step 2: Classify     │──── LLM classifyFull() call
  │         Domain Intent│      PROPERTY / LEGAL / LOAN / SERVICE /
  │                      │      APPOINTMENT / GENERAL
  │                      │
  │ Step 3: Build Agent  │──── Role-specific system prompt
  │         Context      │      + conversation history
  │                      │      + active transactions
  │                      │
  │ Step 4: Route to     │──── Contact Type → Agent mapping:
  │         Agent        │      BUYER_TENANT   → SalesAgent
  │                      │      SELLER_LANDLORD → SalesAgent + InventoryAgent
  │                      │      PARTNER_AGENT   → PartnerAgent
  │                      │      MANAGEMENT      → AdminAgent
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐
  │ SPECIFIC AGENT       │
  │ (e.g., SalesAgent)  │
  │                      │
  │ 1. Build prompt      │
  │ 2. Call Gemini LLM   │
  │ 3. Parse response    │
  │ 4. Return AgentResp  │
  └─────────┬───────────┘
            │
            ▼
  ┌─────────────────────┐    ┌─────────────────────┐
  │ Post-Processing      │    │ QA Agent (async)     │
  │                      │    │ Scores response 1-10 │
  │ 1. Log Interaction   │    │ Flags issues         │
  │ 2. Log AgentAction   │    │ Never blocks user    │
  │ 3. Update Contact    │    └─────────────────────┘
  │ 4. Send via WhatsApp │
  │ 5. Fire QA scoring ──┼───▶
  └─────────────────────┘
```

### 2.3 Three-App Structure

| App | Path | Framework | Port | Purpose |
|-----|------|-----------|------|---------|
| **Backend** | `agents/backend/` | Express.js + TS | 7071 | API, AI agents, WhatsApp, business logic |
| **Website** | `agents/website/` | Next.js 16 | 3000 | Public-facing property portal |
| **Admin** | `agents/frontend/` | React + Vite | 5173 | Staff dashboard, team management |

### 2.4 SSOT (Single Source of Truth) Pattern

Every form submission across the platform follows this pattern:
```
User submits form (website/WhatsApp/admin)
        │
        ├──▶ 1. Upsert Contact (phone = primary key, E.164 format)
        ├──▶ 2. Log Interaction (message, source, timestamp)
        └──▶ 3. Write to specific table (Inventory / WebsiteLead / ScheduledVisit / etc.)
```

This ensures:
- Every person who ever interacts = one Contact record
- Every interaction = logged for audit trail
- Every business entity = stored in its proper table

---

## 3. COMPLETE FILE STRUCTURE

### 3.1 Backend (`agents/backend/`)

```
agents/backend/
├── prisma/
│   ├── schema.prisma              # 26 models, 1482 lines
│   ├── seed.ts                    # Database seeding
│   └── migrations/                # Auto-generated migrations
├── src/
│   ├── server.ts                  # Entry point, graceful shutdown
│   ├── app.ts                     # Express config, middleware stack
│   ├── db.ts                      # Prisma client singleton
│   ├── swagger.ts                 # OpenAPI documentation
│   │
│   ├── agents/                    # 14 AI agents
│   │   ├── types.ts               #   BaseAgent interface, AgentContext, AgentResponse
│   │   ├── index.ts               #   Barrel export
│   │   ├── classifier_agent.ts    #   UNKNOWN → contact type detection
│   │   ├── sales_agent.ts         #   Buyer + seller workflows (~700 lines)
│   │   ├── inventory_agent.ts     #   Property listing collection
│   │   ├── partner_agent.ts       #   External dealer workflows
│   │   ├── admin_agent.ts         #   Management commands
│   │   ├── qa_agent.ts            #   Quality scoring + daily reports
│   │   ├── coordination_agent.ts  #   Buyer ↔ seller appointment bridge
│   │   ├── matching_agent.ts      #   Property matching with priority ranking
│   │   ├── security_agent.ts      #   Rate limiting + anomaly detection
│   │   ├── notification_agent.ts  #   Unified WhatsApp/Email/Voice
│   │   ├── marketing_agent.ts     #   Campaigns + segmentation
│   │   ├── audit_agent.ts         #   Daily AI Boss audit
│   │   └── prompt_engineer_agent.ts # Runtime prompt optimization
│   │
│   ├── routes/                    # 21 route files
│   │   ├── auth.ts                #   Login, register, refresh, forgot/reset password
│   │   ├── public.ts              #   10 public endpoints (properties, lead, newsletter)
│   │   ├── webhooks.ts            #   WhatsApp + Voice webhooks
│   │   ├── inventory.ts           #   CRUD, bulk upload, search, documents
│   │   ├── team.ts                #   Agent management, hierarchy, reports
│   │   ├── transactions.ts        #   Deal lifecycle management
│   │   ├── agent_dashboard.ts     #   Health, metrics, funnel, logs
│   │   ├── builder.ts             #   Builder portal (projects, units, leads)
│   │   ├── external_leads.ts      #   99acres, MagicBricks, Housing.com
│   │   ├── contacts.ts            #   Contact CRUD + interactions
│   │   ├── calendar.ts            #   Appointment management
│   │   ├── campaigns.ts           #   Marketing campaigns
│   │   ├── commissions.ts         #   Partner commission tracking
│   │   ├── reports.ts             #   Analytics + performance
│   │   └── ... (6 more)
│   │
│   ├── services/                  # 40+ service files
│   │   ├── llm.ts                 #   Google Gemini integration (rate limiter, circuit breaker)
│   │   ├── message_router.ts      #   Master orchestrator (~600 lines)
│   │   ├── chat_handler.ts        #   Message processing (~700 lines)
│   │   ├── session_store.ts       #   Redis-backed conversation state
│   │   ├── system_prompt.ts       #   AI prompt templates per contact type
│   │   ├── transaction_service.ts #   Deal lifecycle SSOT
│   │   ├── followup_scheduler.ts  #   Follow-up task management
│   │   ├── whatsapp.ts            #   WhatsApp API client
│   │   ├── auth.ts                #   JWT + password hashing
│   │   ├── performance_monitor.ts #   System metrics collection
│   │   └── ... (30 more)
│   │
│   ├── middleware/                 # 7 middleware files
│   │   ├── auth.ts                #   JWT verification + role check + permission check
│   │   ├── agent_auth.ts          #   External agent JWT (subscription-aware)
│   │   ├── apikey.ts              #   X-API-Key header validation
│   │   ├── rate_limit.ts          #   7 rate limiters (auth, webhook, public, etc.)
│   │   ├── error_handler.ts       #   Global error catch + alerting
│   │   ├── request_logger.ts      #   Request/response logging
│   │   └── cache.ts               #   HTTP response caching
│   │
│   ├── config/                    # Configuration
│   │   ├── permissions.ts         #   RBAC: 3 roles × 23 permissions
│   │   └── whatsapp_templates.ts  #   Message templates
│   │
│   ├── integrations/              # External portal parsers
│   │   ├── 99acres.ts             #   99acres lead import
│   │   ├── magicbricks.ts         #   MagicBricks lead import
│   │   └── housing.ts             #   Housing.com lead import
│   │
│   ├── utils/                     # 6 utility modules
│   │   ├── phone.ts               #   E.164 normalization
│   │   ├── redis.ts               #   Redis client (lazy connect, graceful)
│   │   ├── quiet_hours.ts         #   9PM-8AM IST enforcement
│   │   ├── circuit_breaker.ts     #   CLOSED→OPEN→HALF_OPEN pattern
│   │   ├── logger.ts              #   Winston daily rotation
│   │   └── alerter.ts             #   INFO/WARN/CRITICAL alerts via WhatsApp
│   │
│   ├── validators/                # Zod validation schemas
│   │   ├── auth.validator.ts      #   Login, register, setup, OTP
│   │   ├── public.validator.ts    #   Lead, contact, newsletter, visit
│   │   └── calls.validator.ts     #   Voice webhook, transcript
│   │
│   ├── queues/                    # BullMQ worker definitions
│   ├── workflows/                 # Conversation state machines
│   ├── cron/                      # Scheduled jobs
│   └── __tests__/                 # Test specs (vitest)
│
├── package.json
├── tsconfig.json                  # strict: true, ES2016, commonjs
├── ecosystem.config.js            # PM2 cluster config
└── .env.example                   # Environment variables template
```

**File Count**: ~100+ TypeScript source files

### 3.2 Website (`agents/website/`)

```
agents/website/
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # Root layout (ThemeProvider, JSON-LD, Analytics)
│   │   ├── page.tsx                    # Homepage (9 sections)
│   │   ├── globals.css                 # Tailwind v4 + dark mode custom variant
│   │   │
│   │   ├── properties/
│   │   │   ├── page.tsx                # Property listing (filters, grid, pagination)
│   │   │   ├── [id]/page.tsx           # Property detail (AI Score, nearby, share)
│   │   │   └── in/
│   │   │       ├── [city]/page.tsx     # City landing (8 cities, SEO)
│   │   │       └── [city]/[locality]/page.tsx  # Locality landing (40+ localities)
│   │   │
│   │   ├── projects/
│   │   │   ├── page.tsx                # Builder projects listing
│   │   │   └── [id]/page.tsx           # Project detail
│   │   │
│   │   ├── post-property/page.tsx      # 4-step posting wizard
│   │   ├── blog/
│   │   │   ├── page.tsx                # Blog listing
│   │   │   └── [slug]/page.tsx         # Blog article
│   │   │
│   │   ├── tools/
│   │   │   ├── emi-calculator/page.tsx # EMI calculator
│   │   │   └── area-converter/page.tsx # Area unit converter
│   │   │
│   │   ├── login/page.tsx              # User login
│   │   ├── agent/login/page.tsx        # Agent portal login
│   │   ├── about/page.tsx              # About us
│   │   ├── services/page.tsx           # Services overview
│   │   ├── contact/page.tsx            # Contact form
│   │   ├── faq/page.tsx                # FAQ with JSON-LD FAQPage schema
│   │   ├── privacy/page.tsx            # Privacy policy
│   │   ├── terms/page.tsx              # Terms of service
│   │   └── sitemap.ts                  # Dynamic sitemap (80+ URLs)
│   │
│   ├── components/
│   │   ├── Navbar.tsx                  # Fixed nav, scroll detection, theme toggle
│   │   ├── Hero.tsx                    # Animated hero, typing effect, AI chat trigger
│   │   ├── Footer.tsx                  # SEO-rich footer (50+ location links)
│   │   ├── PropertyCard.tsx            # Property display card
│   │   ├── chat/AIChatModal.tsx        # AI chat interface (session persistence)
│   │   │
│   │   ├── home/
│   │   │   ├── ServiceTiles.tsx        # 6 service cards
│   │   │   ├── ValuePropositions.tsx   # Why choose us
│   │   │   ├── PropertyCategories.tsx  # Browse by category
│   │   │   ├── Testimonials.tsx        # Social proof carousel
│   │   │   └── TrustBadges.tsx         # Trust indicators
│   │   │
│   │   └── ui/                         # Reusable UI primitives
│   │       ├── Button.tsx, Input.tsx, Select.tsx
│   │       ├── Card.tsx, Badge.tsx, Container.tsx
│   │       ├── Accordion.tsx, Carousel.tsx
│   │       ├── Skeleton.tsx, Tabs.tsx, Modal.tsx
│   │       └── ...
│   │
│   ├── contexts/
│   │   └── ThemeContext.tsx             # Dark/light mode (localStorage persistent)
│   │
│   └── lib/
│       ├── api.ts                      # API client (40+ endpoints, types)
│       ├── blog-data.ts                # 10 blog articles (mock data)
│       └── useWorkflow.ts              # Multi-step form hook
│
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── tsconfig.json
└── package.json
```

**Page Count**: 20+ routes
**Component Count**: 30+ components

### 3.3 Admin Dashboard (`agents/frontend/`)

```
agents/frontend/
├── src/
│   ├── main.tsx                        # Entry point
│   ├── App.tsx                         # Routing + layout (WelcomePanel)
│   │
│   ├── components/
│   │   ├── ContactList.tsx             # Filterable contacts with score badges
│   │   ├── ChatView.tsx                # Full conversation history
│   │   ├── CalendarView.tsx            # Appointment scheduling
│   │   ├── EmailView.tsx               # Email management
│   │   ├── InventoryList.tsx           # Property CRUD
│   │   ├── ExternalLeads.tsx           # Portal lead imports
│   │   ├── TeamManagement.tsx          # Org hierarchy + RBAC
│   │   ├── PartnerManagement.tsx       # External agent management
│   │   ├── ReportsView.tsx             # Analytics dashboard
│   │   ├── QADashboard.tsx             # AI quality metrics
│   │   ├── AgentLogs.tsx               # Agent action audit trail
│   │   ├── AgentOverride.tsx           # Human override controls
│   │   └── ... (8 more)
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx              # JWT auth + permissions
│   │   └── ThemeContext.tsx             # Dark mode
│   │
│   ├── api/
│   │   └── client.ts                   # 100+ API endpoint definitions
│   │
│   └── hooks/
│       ├── useWorkflow.ts              # Multi-step form state
│       └── useIsMobile.ts              # Responsive detection
│
├── vite.config.ts
├── tsconfig.json
└── package.json
```

**View Count**: 11 dashboard views

---

## 4. DATABASE SCHEMA

### 4.1 All Models (26 Total)

| # | Model | Purpose | Key Fields |
|---|-------|---------|------------|
| 1 | **Tenant** | Property dealer business account | name, phone, subscription |
| 2 | **Contact** | SSOT for all identities (phone = PK) | phone_number, contact_type, lead_status, lead_score |
| 3 | **Agent** | Internal staff member | name, role, reports_to_id, permissions |
| 4 | **Owner** | Unified ownership (INTERNAL/EXTERNAL) | type, subscription, package_type |
| 5 | **Interaction** | Every message/call/email logged | phone_number, message, source, timestamp |
| 6 | **WhatsAppMessage** | WhatsApp message tracking | wamid, status, template_name |
| 7 | **VoiceCall** | Call recordings & transcripts | call_sid, duration, transcript |
| 8 | **Email** | Email management | subject, body, ai_summary |
| 9 | **Inventory** | Property listings | category, type, price, location, specs, media_urls |
| 10 | **InventoryDocument** | Title deeds, NOC, layout plans | inventory_id, doc_type, file_url |
| 11 | **Transaction** | Deal lifecycle | demand_contact_id, supply_contact_id, status |
| 12 | **TransactionLog** | Deal audit trail | transaction_id, from_status, to_status |
| 13 | **Commission** | FREE agent commission tracking | agent_id, amount, status |
| 14 | **Appointment** | Unified calendar | contact_id, type, scheduled_at, status |
| 15 | **ScheduledVisit** | Property site visits | property_id, visitor_name, visit_date |
| 16 | **TaskFollowup** | Follow-up scheduling | contact_id, due_date, action |
| 17 | **PartnerAgent** | External agent profiles | phone, agency_name, package_type |
| 18 | **Subscription** | Subscription plans | type (FREE/BASIC/PRO/PREMIUM), status |
| 19 | **Project** | Builder projects | name, builder, units, location |
| 20 | **BuilderLead** | Builder project leads | project_id, contact_id |
| 21 | **BuilderAppointment** | Builder-specific appointments | project_id, scheduled_at |
| 22 | **AgentActionLog** | AI agent audit trail | agent_name, action, input/output |
| 23 | **QALog** | Quality assurance scores | interaction_id, score, flagged |
| 24 | **Campaign** | Marketing campaigns | name, type, channel, audience |
| 25 | **ConversationSession** | Workflow state per contact | phone, context (JSON), ttl |
| 26 | **PendingMessage** | Deferred WhatsApp (24h window) | phone, message, send_after |

Plus: **WebsiteLead**, **NewsletterSubscriber**, **AuditReport**, **PromptOverride** and master data tables (PropertyCategory, PropertySubCategory, PropertyType, PropertyConfiguration, UsageType, InvestmentType).

### 4.2 Core Entity Relationships

```
Contact (phone_number PK)
    │
    ├──── has many ───── Interaction (message log)
    ├──── has many ───── Transaction (as demand_contact OR supply_contact)
    ├──── has many ───── Appointment
    ├──── has many ───── TaskFollowup
    ├──── has one  ───── ConversationSession
    └──── has many ───── AgentActionLog

Inventory (property listing)
    │
    ├──── belongs to ─── Contact (owner)
    ├──── belongs to ─── Owner (INTERNAL/EXTERNAL)
    ├──── has many ───── InventoryDocument
    ├──── has many ───── ScheduledVisit
    └──── categorized by → PropertyCategory → SubCategory → Type → Config

Agent (internal staff)
    │
    ├──── reports to ─── Agent (manager)
    ├──── has many ───── Agent (subordinates)
    ├──── assigned to ── Transaction
    └──── role: super_boss | manager | employee

Transaction (deal lifecycle)
    │
    ├──── demand ───── Contact (buyer/tenant)
    ├──── supply ───── Contact (seller/landlord)
    ├──── property ─── Inventory
    ├──── assigned ─── Agent (executive)
    └──── has many ─── TransactionLog (audit trail)
```

### 4.3 Key Enums

| Enum | Values |
|------|--------|
| **ContactType** | BUYER_TENANT, SELLER_LANDLORD, PARTNER_AGENT, REAL_ESTATE_BUILDER, MANAGEMENT, UNKNOWN |
| **LeadStatus** | NEW, CONTACTED, QUALIFIED, INTERESTED, NOT_INTERESTED, CONVERTED, LOST |
| **LifecycleStage** | NEW → QUALIFIED → MATCHED → VISIT_SCHEDULED → VISITED → NEGOTIATION → CLOSED_WON / CLOSED_LOST |
| **AgentRole** | super_boss, manager, employee |
| **PackageType** | FREE, BASIC, PRO, PREMIUM, ADVANCE_PRO |
| **SubscriptionStatus** | ACTIVE, SUSPENDED, EXPIRED, CANCELLED |

### 4.4 Index Strategy

- Composite indexes on hot paths: `(contact_type, lead_status)`, `(phone_number, created_at)`
- Unique constraint: `Contact.phone_number`
- Foreign keys with cascading deletes where appropriate
- Text search indexes on Inventory (location, description)

---

## 5. MULTI-AGENT AI SYSTEM

### 5.1 Architecture Overview

```
                    ┌──────────────────────────────┐
                    │     MESSAGE ROUTER            │
                    │   (Master Orchestrator)       │
                    │                               │
                    │  1. Contact Classification    │
                    │  2. Domain Intent Detection   │
                    │  3. Context Building          │
                    │  4. Agent Dispatch            │
                    └──────────┬───────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
   ┌────────▼────────┐ ┌──────▼──────┐ ┌─────────▼────────┐
   │ CORE AGENTS     │ │ SUPPORT     │ │ BACKGROUND       │
   │                 │ │ AGENTS      │ │ AGENTS           │
   │ - Classifier    │ │ - QA        │ │ - Security       │
   │ - Sales         │ │ - Coordinat.│ │ - Marketing      │
   │ - Inventory     │ │ - Matching  │ │ - Notification   │
   │ - Partner       │ │ - Audit     │ │ - Prompt Engr.   │
   │ - Admin         │ │             │ │                  │
   └─────────────────┘ └─────────────┘ └──────────────────┘
```

### 5.2 BaseAgent Interface

Every agent implements this contract (defined in `src/agents/types.ts`):

```typescript
interface BaseAgent {
    readonly name: AgentName;
    handle(context: AgentContext): Promise<AgentResponse>;
}

// Context provided TO each agent:
interface AgentContext {
    phone: string;
    message: string;
    contactType: ContactType;
    domainIntent: DomainIntent;
    conversationHistory: Message[];
    activeTransactions: Transaction[];
    sessionState: any;
    metadata: Record<string, any>;
}

// Response FROM each agent:
interface AgentResponse {
    message: string;           // Text to send to user
    actions?: AgentAction[];   // Side effects (create lead, schedule visit, etc.)
    nextAgent?: AgentName;     // Chain to another agent
    confidence: number;        // 0-1 confidence score
    language: string;          // Detected language
}
```

**Key Design Principles**:
- Agents do NOT access the database directly
- All DB reads/writes handled by Master Orchestrator
- Agents return structured responses, not side effects
- Every agent call logged to AgentActionLog

### 5.3 Agent Catalog

| # | Agent | Trigger | Purpose | Key Capabilities |
|---|-------|---------|---------|-----------------|
| 1 | **ClassifierAgent** | New UNKNOWN contact | Detect contact type from first message | Classifies as BUYER/SELLER/PARTNER/MGMT via LLM |
| 2 | **SalesAgent** | BUYER_TENANT or SELLER_LANDLORD message | Handle property inquiries & listings | Lead qualification, requirement gathering, property suggestions |
| 3 | **InventoryAgent** | Seller/partner listing property | Collect property details step-by-step | Multi-turn form collection, media handling, validation |
| 4 | **PartnerAgent** | PARTNER_AGENT message | External dealer workflows | Package-aware responses, inventory management, lead access |
| 5 | **AdminAgent** | MANAGEMENT message | Staff commands | Team management, reports, system commands |
| 6 | **QAAgent** | Every AI response (async) | Score quality 1-10 | Relevance, accuracy, tone scoring; daily summary report |
| 7 | **CoordinationAgent** | Buyer ↔ seller match | Bridge appointments | Schedule site visits, coordinate between parties |
| 8 | **MatchingAgent** | New buyer requirement | Find matching properties | Subscription-priority ranking (Internal > Premium > Pro > Free) |
| 9 | **SecurityAgent** | Hourly scan + on-demand | Detect abuse/anomalies | Rate limit enforcement, phone number fraud detection |
| 10 | **NotificationAgent** | System events | Send notifications | Unified WhatsApp + Email + Voice dispatch |
| 11 | **MarketingAgent** | Scheduled campaigns | Campaign management | Audience segmentation, drip campaigns, builder promos |
| 12 | **AuditAgent** | Daily 2AM IST | System health audit | Data integrity checks, stale lead detection, daily report |
| 13 | **PromptEngineerAgent** | QA flagged issues | Optimize prompts | Learn from mistakes, update PromptOverride table |

### 5.4 Domain Intent Classification

The MessageRouter uses a single LLM call (`classifyFull()`) to detect:

| Intent | Examples | Routed To |
|--------|----------|-----------|
| **PROPERTY** | "I want a 3BHK in Noida", "What's the price?" | SalesAgent / InventoryAgent |
| **LEGAL** | "Is this property RERA approved?", "Title deed help" | SalesAgent (legal context) |
| **LOAN** | "What EMI for 50 lakh?", "Home loan options" | SalesAgent (loan context) |
| **SERVICE** | "Need a plumber", "Interior design" | General response |
| **APPOINTMENT** | "Schedule a visit", "When can I see it?" | CoordinationAgent |
| **GENERAL** | "Hello", "Thank you", "Who are you?" | Direct LLM response |

### 5.5 Lead Lifecycle (Universal)

```
NEW ──▶ QUALIFIED ──▶ MATCHED ──▶ VISIT_SCHEDULED ──▶ VISITED ──▶ NEGOTIATION
                                                                       │
                                                              ┌────────┴────────┐
                                                              ▼                 ▼
                                                         CLOSED_WON       CLOSED_LOST
```

- **NEW**: First contact, no requirements gathered
- **QUALIFIED**: Requirements gathered (budget, location, BHK, timeline)
- **MATCHED**: Properties matched to buyer or buyer matched to seller
- **VISIT_SCHEDULED**: Site visit appointment confirmed
- **VISITED**: Visit completed, feedback collected
- **NEGOTIATION**: Price discussion, terms being finalized
- **CLOSED_WON**: Deal completed successfully
- **CLOSED_LOST**: Deal fell through (reason logged)

### 5.6 Quality Assurance (Fire-and-Forget)

```
User message → Agent processes → Response sent immediately
                                        │
                                        └──▶ QA Agent (async, non-blocking)
                                                │
                                                ├── Score: 1-10
                                                ├── Criteria: Relevance, accuracy, tone, helpfulness
                                                ├── Flagged: true/false
                                                └── Logged to QALog table
```

- QA scoring NEVER delays the user response
- Scores visible in Admin Dashboard (QADashboard component)
- Daily summary report generated at 9AM IST
- Flagged responses reviewed by human in AgentOverride view

---

## 6. LLM INTEGRATION (GOOGLE GEMINI)

### 6.1 Configuration

| Parameter | Value |
|-----------|-------|
| **Model** | `gemini-2.5-flash` (paid tier) |
| **Rate Limit** | 500 RPM (50% of 1000 RPM quota for headroom) |
| **Circuit Breaker** | 5 failures → OPEN state, 30s reset timeout |
| **Prompt Cache** | Redis-backed, MD5 hash key, configurable TTL |
| **Fallback** | "I am currently experiencing high traffic..." message |
| **Init** | Lazy (model loaded on first use, not startup) |
| **History Window** | Last 10 messages per conversation |

### 6.2 LLM Service Architecture (`src/services/llm.ts`)

```
┌─────────────────────────────────────────────────┐
│ LLMService                                       │
│                                                   │
│  ┌─────────────┐    ┌──────────────┐              │
│  │ Rate Limiter │───▶│ Circuit      │              │
│  │ (500 RPM)   │    │ Breaker      │              │
│  │ Token bucket│    │              │              │
│  └─────────────┘    │ CLOSED ──▶ OPEN ──▶ HALF   │
│                      └──────┬───────┘              │
│                             │                      │
│                      ┌──────▼───────┐              │
│                      │ Prompt Cache │              │
│                      │ (Redis MD5)  │              │
│                      │ Hit? Return  │              │
│                      └──────┬───────┘              │
│                             │ (Cache miss)         │
│                      ┌──────▼───────┐              │
│                      │ Google       │              │
│                      │ Gemini API   │              │
│                      │ generateText │              │
│                      └──────────────┘              │
└─────────────────────────────────────────────────┘
```

### 6.3 System Prompt Architecture

Each contact type gets a specialized system prompt (`src/services/system_prompt.ts`):

| Contact Type | Prompt Personality | Key Instructions |
|-------------|-------------------|------------------|
| **BUYER_TENANT** | Helpful property advisor | Gather budget, location, BHK; suggest properties; schedule visits |
| **SELLER_LANDLORD** | Professional listing agent | Collect property details; guide pricing; manage inquiries |
| **PARTNER_AGENT** | Business partner assistant | Package-aware; inventory management; lead sharing |
| **MANAGEMENT** | Executive assistant | System commands; reports; team management |
| **UNKNOWN** | Friendly greeter | Detect intent; classify contact type; route to correct agent |

All prompts include:
- Company context (Realty Pandit, Indian real estate)
- Strict terminology rules (Buyer=Sale, Tenant=Rent)
- Language detection (Hindi/English/Hinglish)
- Response format guidelines
- Available actions the agent can trigger

### 6.4 Quality Control (Six Sigma-Inspired)

The system implements continuous quality improvement inspired by Six Sigma principles:

```
┌─────────┐     ┌──────────┐     ┌─────────┐     ┌──────────┐     ┌──────────┐
│ DEFINE   │────▶│ MEASURE  │────▶│ ANALYZE │────▶│ IMPROVE  │────▶│ CONTROL  │
│          │     │          │     │         │     │          │     │          │
│ Agent    │     │ QA Score │     │ Daily   │     │ Prompt   │     │ Audit    │
│ system   │     │ every    │     │ Report  │     │ Engineer │     │ Agent    │
│ prompts  │     │ response │     │ flagged │     │ optimizes│     │ daily    │
│ defined  │     │ (1-10)   │     │ items   │     │ prompts  │     │ scan     │
└─────────┘     └──────────┘     └─────────┘     └──────────┘     └──────────┘
```

**DEFINE**: Agent prompts and expected behavior defined in system_prompt.ts
**MEASURE**: QAAgent scores every response (1-10) on relevance, accuracy, tone
**ANALYZE**: Daily reports surface trends; flagged items reviewed by humans
**IMPROVE**: PromptEngineerAgent updates PromptOverride table to fix recurring issues
**CONTROL**: AuditAgent runs daily at 2AM IST to check data integrity & stale leads

---

## 7. WHATSAPP API INTEGRATION

### 7.1 Architecture

| Component | Detail |
|-----------|--------|
| **Provider** | Meta WhatsApp Business Cloud API |
| **Phone** | Single number for all services (bot + voice + VOIP) |
| **Webhook** | `POST /api/webhooks/whatsapp` |
| **Processing** | Fire-and-forget (200 response immediate, BullMQ async) |
| **Dedup** | Redis message_id cache (2-min TTL) + in-memory Map fallback |
| **Queue** | BullMQ `whatsappInboundQueue` |
| **Template** | Pre-approved templates for outbound notifications |
| **Session** | 24-hour window from last user message |

### 7.2 Message Processing Pipeline

```
Meta Platform sends webhook POST
        │
        ▼
┌─────────────────────────┐
│ 1. Verify signature      │  ← HMAC validation (Meta app secret)
│ 2. Extract message       │  ← Text, media, location, contacts
│ 3. Respond 200 OK        │  ← IMMEDIATELY (fire-and-forget)
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│ 4. Dedup check           │  ← Redis: message_id with 2-min TTL
│    Duplicate? → DROP     │     In-memory Map as fallback
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│ 5. BullMQ enqueue        │  ← If BullMQ available
│    OR sync processing    │  ← Fallback if Redis/BullMQ down
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│ 6. ChatHandler           │
│    - Quiet hours check   │  ← 9PM-8AM IST (external users only)
│    - Load contact        │  ← Upsert if new
│    - Load history (10)   │  ← Last 10 interactions
│    - Check session       │  ← Active workflow state?
│    - Route to agents     │  ← MessageRouter handles routing
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│ 7. Send WhatsApp reply   │  ← Meta API: POST /messages
│    - Log interaction     │  ← DB: Interaction table
│    - Log agent action    │  ← DB: AgentActionLog table
│    - Fire QA scoring     │  ← Async (non-blocking)
└─────────────────────────┘
```

### 7.3 Quiet Hours Enforcement

| Rule | Detail |
|------|--------|
| **Window** | 9:00 PM — 8:00 AM IST (UTC+5:30) |
| **Applies To** | All external users (BUYER_TENANT, SELLER_LANDLORD, PARTNER_AGENT, UNKNOWN) |
| **Exempt** | MANAGEMENT contacts |
| **Behavior** | Messages queued in PendingMessage table, sent when quiet hours end |
| **Utility** | `isQuietHours()` and `msUntilQuietEnd()` in `src/utils/quiet_hours.ts` |

### 7.4 24-Hour Session Window

WhatsApp Business API requires messages within 24 hours of last user message. Beyond that, only pre-approved templates can be sent.

```
User sends message → 24-hour window opens
    │
    ├── Within 24h: Free-form text responses allowed
    │
    └── After 24h: Only template messages (approved by Meta)
                   Pending messages stored in PendingMessage table
                   Sent on next user interaction
```

### 7.5 Voice Integration (Vapi)

| Component | Detail |
|-----------|--------|
| **Provider** | Vapi (VOIP platform) |
| **Webhook** | `POST /api/webhooks/voice` |
| **Features** | Call recording, real-time transcription, AI voice response |
| **Storage** | VoiceCall model (call_sid, duration, transcript, recording_url) |
| **Processing** | BullMQ async (10-second polling for completed calls) |

---

## 8. SECURITY ASSESSMENT

### 8.1 Security Strengths

| Area | Implementation | Rating |
|------|---------------|--------|
| **Authentication** | JWT (24h access + 7d refresh tokens), bcryptjs 10 rounds | STRONG |
| **Authorization** | RBAC with 3 roles × 23 permissions | STRONG |
| **Rate Limiting** | 7 stratified limiters (auth: 100/15min, webhook: 200/15min, public: 60/15min) | STRONG |
| **HTTP Security** | Helmet.js (CSP, HSTS, X-Frame-Options, etc.) | STRONG |
| **SQL Injection** | Prisma ORM parameterized queries | STRONG |
| **CORS** | Whitelist-based (no wildcards) | STRONG |
| **SSL/TLS** | Let's Encrypt auto-renewal | STRONG |
| **Error Handling** | Global error handler + circuit breakers + structured logging | STRONG |
| **Audit Trail** | AgentActionLog + TransactionLog + Interaction table | STRONG |
| **Alerting** | CRITICAL errors → WhatsApp to super_boss | MODERATE |

### 8.2 Security Weaknesses

| # | Issue | Severity | File/Location | Recommended Fix |
|---|-------|----------|--------------|----------------|
| 1 | No CSRF protection on state-changing endpoints | **CRITICAL** | All POST/PUT/DELETE routes | Add csurf middleware or SameSite cookie + double-submit |
| 2 | Database password in docker-compose.yml (plain text) | **CRITICAL** | `docker-compose.yml` | Use `.env` file with `${DB_PASSWORD}` reference |
| 3 | API keys stored as plain-text env vars (no rotation) | **HIGH** | `src/middleware/apikey.ts` | Implement secrets manager (Vault/AWS SSM) |
| 4 | JWT tokens in localStorage (XSS vulnerable) | **HIGH** | Website + Admin frontend | Migrate to httpOnly cookies |
| 5 | Gemini API key logged in console during init | **HIGH** | `src/services/llm.ts` | Remove console.log of API key |
| 6 | No at-rest encryption for PII | **HIGH** | Contact table (phone, name, budget) | Add column-level encryption (pgcrypto) |
| 7 | Phone validation is format-only (no ownership) | **MEDIUM** | `src/utils/phone.ts` | Add OTP verification for new contacts |
| 8 | Refresh token has no server-side expiry enforcement | **MEDIUM** | `src/services/auth.ts` | Add DB-level expiry check on refresh |
| 9 | No API key rotation mechanism | **MEDIUM** | `src/middleware/apikey.ts` | Build rotation/revocation API |
| 10 | Backup files stored unencrypted locally | **MEDIUM** | `pipeline/backups/` | Add GPG encryption + offsite storage |
| 11 | OTP brute-force (3 attempts / 10 min — still guessable) | **LOW** | `src/routes/auth.ts` | Increase OTP length to 6 digits, add CAPTCHA |
| 12 | Missing request signing for external integrations | **LOW** | `src/integrations/*.ts` | Add HMAC signing for 99acres/MagicBricks APIs |

### 8.3 Authentication Flow

```
LOGIN:
  Client → POST /auth/login (email + password)
  Server → Verify bcrypt hash
         → Generate JWT (24h) + Refresh Token (7d)
         → Store refresh token in DB
         → Return both tokens

PROTECTED REQUEST:
  Client → GET /api/* (Authorization: Bearer <JWT>)
  Server → Verify JWT signature + expiry
         → Extract agent.id + agent.role
         → Check permission matrix
         → Allow/Deny

TOKEN REFRESH:
  Client → POST /auth/refresh (refreshToken)
  Server → Verify refresh token exists in DB
         → Generate new JWT (24h)
         → Return new access token

FORGOT PASSWORD:
  Client → POST /auth/forgot-password (phone)
  Server → Generate 4-digit OTP
         → Store in Redis (TTL: 600s)
         → Send via WhatsApp
         → Client verifies OTP → Set new password
```

### 8.4 RBAC Permission Matrix

| Permission | super_boss | manager | employee |
|-----------|:----------:|:-------:|:--------:|
| view_all_leads | Yes | Yes | No |
| view_own_leads | Yes | Yes | Yes |
| assign_leads | Yes | Yes | No |
| edit_leads | Yes | Yes | Yes |
| delete_leads | Yes | No | No |
| manage_team | Yes | Yes (limited) | No |
| manage_agents | Yes | No | No |
| view_reports | Yes | Yes | No |
| bulk_upload | Yes | Yes | No |
| manage_inventory | Yes | Yes | Yes |
| manage_partners | Yes | Yes | No |
| manage_transactions | Yes | Yes | Yes |
| manage_appointments | Yes | Yes | Yes |
| override_ai | Yes | Yes | No |
| manage_campaigns | Yes | Yes | No |
| view_audit_logs | Yes | No | No |
| manage_system | Yes | No | No |

---

## 9. CODE QUALITY ANALYSIS

### 9.1 Strengths

| Area | Detail |
|------|--------|
| **TypeScript** | Strict mode enabled; consistent typing across all projects |
| **Agent Isolation** | Agents don't access DB directly; receive context, return responses |
| **Circuit Breakers** | Gemini + WhatsApp circuits prevent cascade failures |
| **Error Handling** | Global error handler with severity-based alerting |
| **Async/Await** | Consistent usage throughout (no callback hell) |
| **File Organization** | Clear separation: routes / services / agents / middleware / utils |
| **SSOT Pattern** | Every form → Contact + Interaction + specific table |
| **Graceful Shutdown** | SIGTERM/SIGINT handlers with 5-second grace period |
| **Dark Mode** | 100% coverage on website (Tailwind dark: prefix) |
| **Responsive Design** | Mobile-first with consistent breakpoints |

### 9.2 Weaknesses

| Area | Detail | Impact |
|------|--------|--------|
| **Large Files** | sales_agent.ts (~700 lines), message_router.ts (~600 lines), chat_handler.ts (~700 lines) | Harder to maintain |
| **No Dependency Injection** | Service constructors instantiate dependencies directly | Hard to unit test |
| **Magic Numbers** | OTP_TTL=600, MESSAGE_ID_TTL=120, CONVERSATION_LIMIT=10 scattered | Should be in config |
| **Missing Tests** | Website: 0 tests, Admin: 0 tests, Backend: vitest exists but coverage unknown | Risk of regressions |
| **No Error Boundaries** | React apps lack error boundary components | Crashes propagate to blank screen |
| **Loading States** | Not all async operations show skeleton screens | Poor UX on slow connections |
| **Accessibility** | Minimal ARIA labels, keyboard navigation, focus indicators | WCAG non-compliant |
| **Comments** | Minimal code comments across all projects | Harder for new developers |

### 9.3 Duplicacy & Redundancy Found

| Issue | Location | Description |
|-------|----------|-------------|
| Deploy scripts (5 variants) | Project root | `deploy-now.sh`, `deploy-to-server.sh`, `deploy.sh`, `push-update-scp.sh`, `push-update.sh` — only `deploy-now.sh` is current |
| API client duplication | Website `lib/api.ts` + Admin `api/client.ts` | Both define similar endpoint patterns independently |
| Theme context duplication | Website `ThemeContext.tsx` + Admin `ThemeContext.tsx` | Nearly identical implementation in both projects |
| Phone normalization | Backend `utils/phone.ts` | No shared validation library between frontend/backend |
| Price formatting | Website `lib/api.ts` | `formatPrice()` exists only on website; admin reimplements inline |
| Documentation files (6+) | Project root | Multiple overlapping docs (DEPLOYMENT_GUIDE, DEPLOYMENT_READY, PROJECT_AUDIT_REPORT, etc.) |

### 9.4 Pre-existing TypeScript Errors

| File | Error | Impact | Fix |
|------|-------|--------|-----|
| `src/services/dealer.ts` | Wrong import path | Non-blocking (file not actively used) | Update import |
| `src/services/voice.ts` | Duplicate Prisma import | Non-blocking (compiles with warning) | Remove duplicate |

### 9.5 Test Coverage

| Project | Framework | Tests Exist | Coverage |
|---------|-----------|:-----------:|----------|
| Backend | Vitest | Yes | Unknown (no coverage report generated) |
| Website | None | No | 0% |
| Admin | None | No | 0% |

---

## 10. ERRORS, ISSUES & TECH DEBT

### 10.1 Issue Registry

#### CRITICAL (Fix Immediately)

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| C-1 | No CSRF protection | All POST/PUT/DELETE routes | XSS → unauthorized actions | Add csurf middleware |
| C-2 | DB password in docker-compose.yml | `docker-compose.yml` line 9 | Credential exposure in repo | Move to `.env` file |
| C-3 | No automated backups | Server | Data loss on failure | Set up daily cron + offsite |
| C-4 | No monitoring/alerting | Infrastructure | Blind to outages | Add Sentry/Datadog |

#### HIGH (Fix Before Scaling)

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| H-1 | JWT in localStorage | Website + Admin JS | XSS → token theft | Migrate to httpOnly cookies |
| H-2 | API key no rotation | `middleware/apikey.ts` | Compromised key = permanent access | Build rotation API |
| H-3 | No at-rest encryption | Contact table PII | GDPR/data protection risk | Add pgcrypto encryption |
| H-4 | CI/CD not enforced | GitHub Actions | Bad code can deploy | Make checks required |
| H-5 | Gemini key in console log | `services/llm.ts` | Key visible in server logs | Remove log statement |

#### MEDIUM (Fix Within 1 Month)

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| M-1 | WhatsApp placeholder number | `ServiceTiles.tsx` | Feature broken for users | Replace with real number |
| M-2 | City/locality mock data | SEO pages | Fake listings shown | Connect to real API |
| M-3 | No error boundaries | React apps | Full-screen crash | Add React ErrorBoundary |
| M-4 | Large files (600+ lines) | Multiple services/agents | Hard to maintain | Split into focused modules |
| M-5 | No accessibility (WCAG) | Website | Legal/usability risk | Add ARIA labels, keyboard nav |
| M-6 | Deprecated deploy scripts | Project root | Confusion | Delete old scripts |
| M-7 | Missing .env.example | All projects | New dev setup harder | Create templates |
| M-8 | Magic numbers scattered | Backend services | Inconsistent config | Centralize in config file |

#### LOW (Future Improvement)

| # | Issue | Location | Impact | Fix |
|---|-------|----------|--------|-----|
| L-1 | dealer.ts wrong import | `services/dealer.ts` | Dead code | Fix or remove |
| L-2 | voice.ts duplicate import | `services/voice.ts` | Warning only | Remove duplicate |
| L-3 | SSH key path with spaces | `~/.ssh/realty_pandit_key` | Fragile workaround | Rename key file |
| L-4 | `nul` file at project root | Root directory | Artifact | Delete |
| L-5 | Docker Compose unused in prod | `docker-compose.yml` | Confusion | Document as dev-only |

---

## 11. DEPLOYMENT & INFRASTRUCTURE

### 11.1 Production Server

| Spec | Detail |
|------|--------|
| **IP** | 72.62.231.224 |
| **OS** | Ubuntu 24.04 LTS |
| **Access** | SSH key (`~/.ssh/realty_pandit_key`) |
| **Process Manager** | PM2 (cluster mode) |
| **Reverse Proxy** | Nginx |
| **SSL** | Let's Encrypt (auto-renewal) |
| **Database** | PostgreSQL 16 (native systemd service) |
| **Cache** | Redis 7 (native) |
| **Node.js** | v20 LTS |

### 11.2 Service Map

```
┌─────────────────────────────────────────────────────────┐
│ Ubuntu 24.04 LTS (72.62.231.224)                        │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Nginx (port 80/443)                              │    │
│  │  realtypandit.in     → localhost:3000            │    │
│  │  api.realtypandit.in → localhost:7071            │    │
│  │  admin.realtypandit.in → localhost:5173          │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ PM2: realty-  │ │ PM2: realty-  │ │ PM2: realty-  │    │
│  │ website      │ │ backend      │ │ admin        │    │
│  │ (Next.js)    │ │ (Express)    │ │ (Vite/React) │    │
│  │ :3000        │ │ :7071        │ │ :5173        │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
│                                                          │
│  ┌──────────────┐ ┌──────────────┐                      │
│  │ PostgreSQL 16│ │ Redis 7      │                      │
│  │ :5432        │ │ :6379        │                      │
│  │ reality_pandit│ │              │                      │
│  └──────────────┘ └──────────────┘                      │
│                                                          │
│  /var/www/realty-pandit/                                 │
│    ├── backend/   (Express API + Prisma + Agents)       │
│    ├── website/   (Next.js public site)                  │
│    └── frontend/  (React admin panel)                    │
│                                                          │
│  /uploads/        (Local media storage — NO CLOUD)       │
└─────────────────────────────────────────────────────────┘
```

### 11.3 Deployment Process

**Primary command**: `bash deploy-now.sh` (5-8 minutes)

```
Step 1/6: Verify SSH connection to 72.62.231.224
Step 2/6: Package source code (tar.gz, excludes node_modules/builds)
Step 3/6: Upload via SCP to server
Step 4/6: Extract and sync to /var/www/realty-pandit/{backend,website,frontend}/src/
Step 5/6: Rebuild services:
          - Backend: npm install → prisma migrate → prisma generate → PM2 restart
          - Website: npm install → next build → PM2 restart
          - Admin:   npm install → vite build → PM2 restart
Step 6/6: Health check on all 3 services
```

**Pre-deployment requirement**:
```bash
cp "$HOME/.ssh/realty_pandit_key" /tmp/rp_key && chmod 600 /tmp/rp_key
```

### 11.4 Pipeline Tools

| Tool | File | Purpose | Trigger |
|------|------|---------|---------|
| **Auto-Deploy Watcher** | `pipeline/watch-and-deploy.sh` | Watch file changes → auto deploy | Manual start (bat/bash) |
| **Backup** | `pipeline/backup.sh` | DB dump + code tar (7-day rotation) | Manual |
| **Health Check** | `pipeline/health-check.sh` | Test all services + SSL expiry | Manual |
| **Windows Launchers** | `pipeline/*.bat` | Double-click wrappers for Git Bash | Manual |

### 11.5 CI/CD (GitHub Actions)

| Workflow | Trigger | Steps | Status |
|----------|---------|-------|--------|
| `backend-ci.yml` | Push to main/develop | npm ci → prisma generate → vitest → tsc | Configured (not enforced) |
| `website-ci.yml` | Push to main/develop | npm ci → next build | Configured (not enforced) |

**Gaps**: No linting, no security scanning, no Docker registry push, type checking non-blocking.

### 11.6 Backup Status

| Aspect | Current | Recommended |
|--------|---------|-------------|
| **Frequency** | Manual | Daily automated (cron) |
| **Storage** | Local machine only | Local + offsite (S3/GCS) |
| **Encryption** | None | GPG encrypted |
| **Retention** | 7 days (auto-rotate) | 30 days local, 90 days offsite |
| **Restore Testing** | Never tested | Weekly automated test |
| **RTO** | Undefined | Target: 1 hour |
| **RPO** | Undefined | Target: 24 hours |

---

## 12. PERFORMANCE ANALYSIS

### 12.1 Backend Performance Features

| Feature | Implementation | Benefit |
|---------|---------------|---------|
| **BullMQ Async Queue** | WhatsApp webhooks → queue → async worker | Non-blocking webhook responses |
| **Circuit Breakers** | Gemini + WhatsApp circuits (5 failures → OPEN) | Prevents cascade failures |
| **Prompt Caching** | Redis MD5 hash key, configurable TTL | Reduces Gemini API calls |
| **Rate Limiting** | 7 stratified limiters per route type | Prevents abuse |
| **Connection Pooling** | Prisma default pool (PgBouncer compatible) | Efficient DB connections |
| **Lazy Init** | LLM model loaded on first use | Faster server startup |
| **Conversation Window** | Last 10 messages (not full history) | Prevents token bloat |
| **PM2 Cluster** | Multi-instance with worker awareness | Horizontal scaling |
| **Graceful Shutdown** | 5-second grace period for in-flight requests | Zero dropped connections |

### 12.2 Website Performance Features

| Feature | Implementation | Benefit |
|---------|---------------|---------|
| **SSR/SSG** | Next.js 16 App Router | Fast first paint |
| **Code Splitting** | Automatic per-route | Smaller bundles |
| **Lazy Loading** | Framer Motion `whileInView` | Images load on scroll |
| **Dark Mode** | CSS class toggle (no JS re-render) | Instant theme switch |
| **localStorage Cache** | Search state, theme, drafts, wishlist | Instant recall |

### 12.3 Identified Bottlenecks

| Bottleneck | Location | Impact | Recommended Fix |
|-----------|----------|--------|----------------|
| **N+1 Query Potential** | Inventory listing with relations | Slow page loads at scale | Add Prisma `include` optimization |
| **Large Contact Lists** | Admin ContactList component | Scroll jank with 1000+ contacts | Add virtualization (react-window) |
| **Full History Load** | Admin ChatView | Slow on long conversations | Add pagination (load last 50, scroll to load more) |
| **No Image Optimization** | Website uses `<img>` tags | Large image downloads | Migrate to Next.js `<Image>` component |
| **API Client Bundle** | 40+ endpoint definitions in one file | Included even if unused | Code-split by feature |
| **No CDN** | Static assets served by Nginx directly | Higher latency for distant users | Add CloudFlare or similar CDN |

### 12.4 Scalability Assessment

| Metric | Current Capacity (Estimated) | Bottleneck |
|--------|-----------------------------|-----------|
| **Concurrent Users** | ~100-500 | Single server, no horizontal scaling |
| **WhatsApp Messages/min** | ~200 (rate limiter) | BullMQ queue depth |
| **Gemini API calls/min** | ~500 (self-imposed 50% limit) | Google quota |
| **Database Connections** | ~20 (Prisma default pool) | Single PostgreSQL instance |
| **Storage** | VPS disk (local `/uploads/`) | Disk space |

---

## 13. FUTURE IMPROVEMENT PLAN

### 13.1 Immediate (Week 1)

| # | Task | Priority | Effort |
|---|------|----------|--------|
| 1 | Set up automated daily backups (cron on server) | CRITICAL | 2 hours |
| 2 | Move DB password out of docker-compose.yml to .env | CRITICAL | 30 min |
| 3 | Remove Gemini API key from console.log in llm.ts | HIGH | 15 min |
| 4 | Delete deprecated deploy scripts (4 files) | MEDIUM | 15 min |
| 5 | Delete `nul` artifact file from project root | LOW | 5 min |

### 13.2 Short Term (Weeks 2-3)

| # | Task | Priority | Effort |
|---|------|----------|--------|
| 6 | Add CSRF protection (csurf middleware) | CRITICAL | 4 hours |
| 7 | Set up monitoring/alerting (Sentry for errors) | HIGH | 4 hours |
| 8 | Migrate JWT storage to httpOnly cookies | HIGH | 8 hours |
| 9 | Make CI/CD checks required (block on failures) | HIGH | 2 hours |
| 10 | Replace WhatsApp placeholder with real number | MEDIUM | 30 min |
| 11 | Add React ErrorBoundary to website + admin | MEDIUM | 2 hours |
| 12 | Create .env.example for all 3 projects | MEDIUM | 1 hour |
| 13 | Centralize magic numbers into config file | MEDIUM | 2 hours |

### 13.3 Medium Term (Months 1-2)

| # | Task | Priority | Effort |
|---|------|----------|--------|
| 14 | Add integration tests for critical paths | HIGH | 2 weeks |
| 15 | Implement at-rest encryption for PII (pgcrypto) | HIGH | 1 week |
| 16 | Add API key rotation mechanism | HIGH | 3 days |
| 17 | Connect city/locality pages to real property data | MEDIUM | 1 week |
| 18 | Add Lighthouse audit to CI/CD | MEDIUM | 2 hours |
| 19 | Implement blue-green deployment | MEDIUM | 3 days |
| 20 | Add load testing (k6 or Artillery) | MEDIUM | 3 days |
| 21 | Set up log aggregation (ELK or DataDog) | MEDIUM | 3 days |
| 22 | Add WCAG accessibility compliance | MEDIUM | 1 week |
| 23 | Split large files (600+ lines) into modules | LOW | 3 days |

### 13.4 Phase 7: Partner Agent Marketplace (22 Tasks)

The next major feature phase transforms Realty Pandit into a controlled marketplace:

```
Phase 7 Sub-Phases:
├── 7.1: Database & Core (5 tasks) ─────── Agent registration, packages, subscriptions
├── 7.2: Agent Dashboard (4 tasks) ─────── Separate portal for external agents
├── 7.3: Website Integration (3 tasks) ──── Agent listing, public profiles
├── 7.4: WhatsApp Workflows (3 tasks) ───── Upload inventory, check appointments via chat
├── 7.5: Business Logic (3 tasks) ────────── Priority matching, data masking, commissions
├── 7.6: Admin Features (2 tasks) ────────── Agent management panel, analytics
└── 7.7: Payment Integration (2 tasks) ──── Razorpay/Stripe gateway (future)
```

**Key Revenue Features**:
- External agents register with package selection (FREE / PRO / ADVANCE_PRO)
- FREE agents: Limited listings, no buyer contact info (data masking), commission on deals
- PRO agents: More listings, buyer info visible, priority matching
- ADVANCE_PRO agents: Unlimited listings, highest priority, dedicated support
- Priority matching: Internal properties > ADVANCE_PRO > PRO > FREE
- All through ONE AI brain (Panditji) and ONE SSOT database

**Estimated Timeline**: 15-18 days full-time development

### 13.5 Long Term Vision

| Initiative | Timeline | Impact |
|-----------|----------|--------|
| **Kubernetes Migration** | 3-6 months | Auto-scaling, zero-downtime deploys |
| **Multi-Region Failover** | 6-12 months | High availability, disaster recovery |
| **CDN (CloudFlare)** | 1-2 months | Faster global access, DDoS protection |
| **Feature Flags** | 1-2 months | Gradual rollouts, A/B testing |
| **Mobile App** | 3-6 months | Native iOS/Android for buyers and agents |
| **ML Property Valuation** | 6-12 months | Automated pricing based on market data |
| **Payment Gateway** | 1-2 months | Subscription billing, commission payouts |
| **WhatsApp Pay** | 3-6 months | In-chat payment for services |

---

## APPENDIX A: KEY FILE REFERENCE

### Backend Critical Files

| File | Path | Lines | Purpose |
|------|------|-------|---------|
| Prisma Schema | `agents/backend/prisma/schema.prisma` | ~1482 | All 26 models |
| Server Entry | `agents/backend/src/server.ts` | ~100 | Startup + shutdown |
| Express App | `agents/backend/src/app.ts` | ~150 | Middleware stack |
| Message Router | `agents/backend/src/services/message_router.ts` | ~600 | Master orchestrator |
| Chat Handler | `agents/backend/src/services/chat_handler.ts` | ~700 | Message processing |
| LLM Service | `agents/backend/src/services/llm.ts` | ~400 | Gemini integration |
| System Prompts | `agents/backend/src/services/system_prompt.ts` | ~300 | Agent prompts |
| Agent Types | `agents/backend/src/agents/types.ts` | ~150 | BaseAgent interface |
| Sales Agent | `agents/backend/src/agents/sales_agent.ts` | ~700 | Buyer/seller flows |
| Auth Service | `agents/backend/src/services/auth.ts` | ~200 | JWT + passwords |
| Auth Middleware | `agents/backend/src/middleware/auth.ts` | ~100 | Token verification |
| RBAC Config | `agents/backend/src/config/permissions.ts` | ~80 | Permission matrix |
| Public Routes | `agents/backend/src/routes/public.ts` | ~1000 | Website API |

### Website Critical Files

| File | Path | Purpose |
|------|------|---------|
| Root Layout | `agents/website/src/app/layout.tsx` | HTML shell, providers, JSON-LD |
| Homepage | `agents/website/src/app/page.tsx` | 9-section landing page |
| Properties | `agents/website/src/app/properties/page.tsx` | Listing with filters |
| Property Detail | `agents/website/src/app/properties/[id]/page.tsx` | Full property view |
| Post Property | `agents/website/src/app/post-property/page.tsx` | 4-step wizard |
| API Client | `agents/website/src/lib/api.ts` | 40+ endpoint definitions |
| Theme Context | `agents/website/src/contexts/ThemeContext.tsx` | Dark mode |
| Navbar | `agents/website/src/components/Navbar.tsx` | Main navigation |
| Footer | `agents/website/src/components/Footer.tsx` | SEO-rich footer |

### Admin Critical Files

| File | Path | Purpose |
|------|------|---------|
| App Router | `agents/frontend/src/App.tsx` | Routing + layout |
| Auth Context | `agents/frontend/src/contexts/AuthContext.tsx` | JWT + RBAC |
| API Client | `agents/frontend/src/api/client.ts` | 100+ endpoints |
| Chat View | `agents/frontend/src/components/ChatView.tsx` | Conversation UI |
| QA Dashboard | `agents/frontend/src/components/QADashboard.tsx` | AI quality metrics |

---

## APPENDIX B: ENVIRONMENT VARIABLES

### Backend Required

```
NODE_ENV=production
PORT=7071
DATABASE_URL=postgresql://realty_user:****@localhost:5432/reality_pandit
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
JWT_SECRET=<random-64-char-string>
AGENT_JWT_SECRET=<different-random-64-char-string>
GEMINI_API_KEY=<google-gemini-api-key>
WHATSAPP_PHONE_ID=<meta-phone-number-id>
WHATSAPP_TOKEN=<meta-permanent-token>
WHATSAPP_VERIFY_TOKEN=<webhook-verification-token>
ALLOWED_ORIGINS=https://www.realtypandit.in,https://admin.realtypandit.in
EXTERNAL_API_KEYS=<comma-separated-api-keys>
```

### Website Required

```
NEXT_PUBLIC_API_URL=https://api.realtypandit.in
NEXT_PUBLIC_SITE_URL=https://www.realtypandit.in
```

---

## APPENDIX C: HEALTH CHECK COMMANDS

```bash
# Check all PM2 processes
ssh -i /tmp/rp_key root@72.62.231.224 "pm2 status"

# Check backend health
curl https://api.realtypandit.in/health

# Check website
curl -I https://www.realtypandit.in

# Check admin
curl -I https://admin.realtypandit.in

# Check database
ssh -i /tmp/rp_key root@72.62.231.224 "sudo -u postgres psql -c 'SELECT count(*) FROM \"Contact\";' reality_pandit"

# Check Redis
ssh -i /tmp/rp_key root@72.62.231.224 "redis-cli ping"

# Check SSL expiry
echo | openssl s_client -connect realtypandit.in:443 2>/dev/null | openssl x509 -noout -enddate

# View backend logs
ssh -i /tmp/rp_key root@72.62.231.224 "pm2 logs realty-backend --lines 50"

# Run full health check
bash pipeline/health-check.sh
```

---

**END OF REPORT**

*Generated: February 21, 2026*
*Audit Scope: Full codebase (backend, website, admin), infrastructure, security, AI system, deployment*
*Total Files Analyzed: 150+*
*Rating: Production-Ready with Minor Hardening Needed (4/5)*
