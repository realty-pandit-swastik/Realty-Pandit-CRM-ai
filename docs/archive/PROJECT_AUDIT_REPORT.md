# Realty Pandit — Complete Project Audit Report
**Date**: 2026-02-17
**Auditor**: Claude (AI Code Assistant)
**Server**: 72.62.231.224

---

## LEGEND

| Status | Meaning |
|--------|---------|
| ✅ WORKING | File is complete and functional |
| ⚠️ NEEDS-ATTENTION | Has known issues or pending client data |
| 🔧 FIXED | Was broken, fixed this session |
| 🚧 PENDING | Needs client credentials or future work |
| 📋 SCRIPT | Utility/test script, not production |

---

## 1. BACKEND — Core Files

| File | Purpose | Status |
|------|---------|--------|
| `agents/backend/src/server.ts` | Entry point — starts Express on port 7071 | ✅ WORKING |
| `agents/backend/src/app.ts` | Express app config, all route mounts, middleware | 🔧 FIXED (trust proxy: 'loopback') |
| `agents/backend/src/db.ts` | Prisma client singleton (global to prevent hot-reload leaks) | ✅ WORKING |
| `agents/backend/src/swagger.ts` | Swagger/OpenAPI spec for API docs at /api-docs | ✅ WORKING |

---

## 2. BACKEND — Routes (`src/routes/`)

| File | Endpoint Prefix | Purpose | Status |
|------|-----------------|---------|--------|
| `webhooks.ts` | `/webhooks` | WhatsApp/Twilio webhook receiver → Panditji AI | 🚧 PENDING (needs WhatsApp creds) |
| `public.ts` | `/public` | Public website API (properties, leads, testimonials, post-property) | ✅ WORKING |
| `ai_chat.ts` | `/public/ai-chat` | Panditji AI chat for website visitors | ✅ WORKING |
| `auth.ts` | `/auth` | Internal staff JWT login (email+password) | ✅ WORKING |
| `auth_otp.ts` | `/public/auth` | Website chat OTP authentication via WhatsApp | 🚧 PENDING (needs WhatsApp) |
| `user_auth.ts` | `/user` | Customer user login via OTP (BUYER_TENANT) | 🚧 PENDING (needs WhatsApp) |
| `agent.ts` | `/agent` | Partner agent dashboard API (JWT auth) | ✅ WORKING |
| `builder.ts` | `/builder` | Builder dashboard API (JWT auth) | ✅ WORKING |
| `api.ts` | `/api` | Internal staff API (contacts, inventory, messages) | ✅ WORKING |
| `inventory.ts` | `/inventory` | Property inventory CRUD | ✅ WORKING |
| `leads.ts` | `/api/leads` | Lead management endpoints | ✅ WORKING |
| `master.ts` | `/public/master` | Master data tree (property types, cities, amenities) | ✅ WORKING |
| `external_leads.ts` | `/external` | External lead intake (API key auth) | ✅ WORKING |
| `staff_calls.ts` | `/api/calls` | Staff call logging and intelligence | ✅ WORKING |
| `calendar.ts` | `/api/calendar` | Appointment/visit calendar management | ✅ WORKING |
| `email.ts` | `/api/email` | Panditji email system | ✅ WORKING |
| `classification.ts` | `/public/classification` | Property classification API | ✅ WORKING |

---

## 3. BACKEND — Services (`src/services/`)

| File | Purpose | Status |
|------|---------|--------|
| `llm.ts` | Google Gemini AI — lazy init, `gemini-2.5-pro` | 🔧 FIXED (new API key deployed) |
| `system_prompt.ts` | Panditji AI system prompt builder | ✅ WORKING |
| `message_router.ts` | Routes WhatsApp messages to correct workflow | ✅ WORKING |
| `session_store.ts` | In-memory conversation session store | ✅ WORKING |
| `chat_handler.ts` | AI chat business logic for website visitors | ✅ WORKING |
| `auth.ts` | JWT issue/verify for internal staff | ✅ WORKING |
| `agent_auth.ts` | JWT for partner agents + builders | ✅ WORKING |
| `whatsapp.ts` | WhatsApp API client (send messages, OTP) | 🚧 PENDING (needs credentials) |
| `matching.ts` | Property matching engine (buyer ↔ inventory) | ✅ WORKING |
| `lead_score.ts` | Lead scoring algorithm (0-100 score) | ✅ WORKING |
| `decision_engine.ts` | AI decision making for contact classification | ✅ WORKING |
| `followup_scheduler.ts` | Scheduled follow-up reminders | ✅ WORKING |
| `scheduler.ts` | General task scheduler | ✅ WORKING |
| `email_service.ts` | Email sending (Panditji controls all emails) | ✅ WORKING |
| `email_lead_parser.ts` | Parses inbound emails into leads | ✅ WORKING |
| `subscription.ts` | Agent subscription package management | ✅ WORKING |
| `commission.ts` | Commission tracking for FREE agents | ✅ WORKING |
| `permission_engine.ts` | RBAC permission evaluation | ✅ WORKING |
| `storage.ts` | File storage (local + Cloudinary) | 🚧 PENDING (needs Cloudinary keys) |
| `upload.ts` | File upload handler (multer) | 🚧 PENDING (needs Cloudinary keys) |
| `voice.ts` | Voice call handling (Twilio) | ⚠️ NEEDS-ATTENTION (duplicate prisma import) |
| `transcription.ts` | Audio transcription (call recordings) | ✅ WORKING |
| `audio_storage.ts` | Audio file storage and retrieval | ✅ WORKING |
| `calendar.ts` | Calendar/appointment service | ✅ WORKING |
| `call_extractor.ts` | Extracts lead data from call recordings | ✅ WORKING |
| `date_parser.ts` | Natural language date parsing | ✅ WORKING |
| `owner.ts` | Property owner management | ✅ WORKING |
| `dealer.ts` | Dealer/partner management | ⚠️ NEEDS-ATTENTION (wrong import path - pre-existing) |
| `session/store.ts` | Alternative session store implementation | ✅ WORKING |

---

## 4. BACKEND — Workflows (`src/workflows/`)

WhatsApp conversation state machines per contact type:

| File | Purpose | Status |
|------|---------|--------|
| `buyer.ts` | BUYER_TENANT conversation flow | ✅ WORKING |
| `seller.ts` | SELLER_LANDLORD conversation flow | ✅ WORKING |
| `partner_agent.ts` | PARTNER_AGENT WhatsApp flow (inventory via chat) | ✅ WORKING |
| `management.ts` | Internal MANAGEMENT workflow | ✅ WORKING |
| `unknown.ts` | Unknown contact classification flow | ✅ WORKING |
| `builder_onboarding.ts` | Builder registration via WhatsApp | ✅ WORKING |
| `builder_inventory.ts` | Builder uploads units via WhatsApp chat | ✅ WORKING |
| `inventory_machine.ts` | State machine for property inventory updates | ✅ WORKING |

---

## 5. BACKEND — Middleware (`src/middleware/`)

| File | Purpose | Status |
|------|---------|--------|
| `auth.ts` | JWT verification for internal staff | ✅ WORKING |
| `agent_auth.ts` | JWT verification for partner agents | ✅ WORKING |
| `apikey.ts` | API key authentication for external integrations | ✅ WORKING |
| `rate_limit.ts` | Per-route rate limiters (authLimiter, publicLimiter, etc.) | ✅ WORKING |
| `error_handler.ts` | Global error handler (last middleware in chain) | ✅ WORKING |
| `request_logger.ts` | Request ID generation + structured logging | ✅ WORKING |
| `cache.ts` | Response caching middleware | ✅ WORKING |

---

## 6. BACKEND — Integrations (`src/integrations/`)

| File | Purpose | Status |
|------|---------|--------|
| `99acres.ts` | 99acres.com lead ingestion via webhook | ✅ WORKING |
| `magicbricks.ts` | MagicBricks lead ingestion | ✅ WORKING |
| `housing.ts` | Housing.com lead ingestion | ✅ WORKING |

---

## 7. BACKEND — Config & Utils

| File | Purpose | Status |
|------|---------|--------|
| `config/permissions.ts` | RBAC permission definitions (super_boss, manager, employee) | ✅ WORKING |
| `utils/logger.ts` | Winston logger | ✅ WORKING |
| `utils/redis.ts` | Redis client (optional caching layer) | ⚠️ NEEDS-ATTENTION (Redis may not be running on server) |
| `validators/index.ts` | Shared validation schemas (Zod) | ✅ WORKING |
| `validators/auth.validator.ts` | Auth input validation | ✅ WORKING |
| `validators/public.validator.ts` | Public API input validation | ✅ WORKING |
| `validators/calls.validator.ts` | Call log validation | ✅ WORKING |
| `workers/call_processor.ts` | Background worker for processing call recordings | ✅ WORKING |

---

## 8. BACKEND — Database (`prisma/`)

| File | Purpose | Status |
|------|---------|--------|
| `schema.prisma` | Full Prisma schema — all models | ✅ WORKING |
| `seed.ts` | Initial data seeding script | ✅ WORKING |
| `seed_master.ts` | Master data seeding (property types, cities) | ✅ WORKING |
| `migrations/20260206...` | Initial SSOT v3 schema | ✅ APPLIED |
| `migrations/20260207...` | Lead scoring fields | ✅ APPLIED |
| `migrations/20260209...` | Auth fields (JWT, OTP) | ✅ APPLIED |
| `migrations/20260210...` | Sessions + language detection | ✅ APPLIED |
| `migrations/20260211...` | Website models (WebsiteLead, Newsletter, ScheduledVisit) | ✅ APPLIED |
| `migrations/20260212...` | Partner agent marketplace | ✅ APPLIED |

**Key DB Models**: Contact, Inventory, Interaction, ConversationSession, Agent, Tenant, WebsiteLead, NewsletterSubscriber, ScheduledVisit, PartnerAgent, SubscriptionPackage, StaffCall, CalendarEvent, EmailThread

---

## 9. BACKEND — Test Scripts (`src/scripts/`)

| File | Purpose | Status |
|------|---------|--------|
| `system_health_check.ts` | Tests all system components | 📋 SCRIPT |
| `test_llm.ts` | Tests Gemini AI connection | 📋 SCRIPT |
| `test_matching.ts` | Tests property matching algorithm | 📋 SCRIPT |
| `test_workflows.ts` | Tests WhatsApp conversation flows | 📋 SCRIPT |
| `test_inventory_flow.ts` | Tests inventory CRUD | 📋 SCRIPT |
| `test_lead_score.ts` | Tests lead scoring | 📋 SCRIPT |
| `simulate_webhook.ts` | Simulates WhatsApp message webhook | 📋 SCRIPT |
| `simulate_voice_webhook.ts` | Simulates voice call webhook | 📋 SCRIPT |
| `seed_buyer.ts` | Seeds test buyer data | 📋 SCRIPT |
| `migrate_partner_to_owner.ts` | One-time data migration script | 📋 SCRIPT |
| `verify_db.ts` | Verifies DB connection + schema | 📋 SCRIPT |
| `verify_db_call_log.ts` | Verifies call log entries | 📋 SCRIPT |
| `test_outbound.ts` | Tests outbound WhatsApp messages | 📋 SCRIPT |
| `test_polish.ts` | Tests AI response polish | 📋 SCRIPT |
| `test_media_inventory.ts` | Tests media upload to inventory | 📋 SCRIPT |
| `test_scheduler.ts` | Tests follow-up scheduler | 📋 SCRIPT |

---

## 10. WEBSITE — Pages (`agents/website/src/app/`)

| File | URL | Purpose | Status |
|------|-----|---------|--------|
| `page.tsx` | `/` | Homepage (Hero, Featured, ServiceTiles, etc.) | ✅ WORKING |
| `layout.tsx` | (all pages) | Root layout with ThemeProvider, Navbar, Footer, JSON-LD | ✅ WORKING |
| `loading.tsx` | (all pages) | Loading skeleton | ✅ WORKING |
| `not-found.tsx` | `/404` | Custom 404 page | ✅ WORKING |
| `about/page.tsx` | `/about` | About Realty Pandit | ✅ WORKING |
| `blog/page.tsx` | `/blog` | Blog listing (10 articles) | ✅ WORKING |
| `blog/[slug]/page.tsx` | `/blog/:slug` | Blog article detail | ✅ WORKING |
| `contact/page.tsx` | `/contact` | Contact form → SSOT | ✅ WORKING |
| `faq/page.tsx` | `/faq` | FAQ with FAQPage JSON-LD | ✅ WORKING |
| `services/page.tsx` | `/services` | Services offered | ✅ WORKING |
| `privacy/page.tsx` | `/privacy` | Privacy policy | ✅ WORKING |
| `terms/page.tsx` | `/terms` | Terms of service | ✅ WORKING |
| `properties/page.tsx` | `/properties` | Property listing with filters | ✅ WORKING |
| `properties/[id]/page.tsx` | `/properties/:id` | Property detail (AI Score, Nearby, Share) | ✅ WORKING |
| `properties/in/[city]/page.tsx` | `/properties/in/:city` | City landing page (SEO) | ⚠️ MOCK DATA |
| `properties/in/[city]/[locality]/page.tsx` | `/properties/in/:city/:locality` | Locality landing page (SEO) | ⚠️ MOCK DATA |
| `post-property/page.tsx` | `/post-property` | 4-step property listing wizard | ✅ WORKING |
| `post-project/page.tsx` | `/post-project` | Builder project submission | ✅ WORKING |
| `projects/[id]/page.tsx` | `/projects/:id` | Builder project detail | ✅ WORKING |
| `login/page.tsx` | `/login` | Unified login page (4 portals) | ✅ WORKING |
| `compare/page.tsx` | `/compare` | Property comparison tool | ✅ WORKING |
| `wishlist/page.tsx` | `/wishlist` | Saved properties wishlist | ✅ WORKING |
| `join/page.tsx` | `/join` | Join as agent or builder | ✅ WORKING |
| `join/agent/page.tsx` | `/join/agent` | Partner agent registration | ✅ WORKING |
| `join/builder/page.tsx` | `/join/builder` | Builder registration | ✅ WORKING |
| `agent/login/page.tsx` | `/agent/login` | Agent portal login | ✅ WORKING |
| `agent/dashboard/page.tsx` | `/agent/dashboard` | Agent dashboard | ✅ WORKING |
| `agent/inventory/page.tsx` | `/agent/inventory` | Agent property listings | ✅ WORKING |
| `agent/leads/page.tsx` | `/agent/leads` | Agent leads view | ✅ WORKING |
| `agent/appointments/page.tsx` | `/agent/appointments` | Agent visit calendar | ✅ WORKING |
| `agent/subscription/page.tsx` | `/agent/subscription` | Subscription packages (FREE/PRO/ADVANCE_PRO) | ✅ WORKING |
| `tools/emi-calculator/page.tsx` | `/tools/emi-calculator` | Home loan EMI calculator | ✅ WORKING |
| `tools/area-converter/page.tsx` | `/tools/area-converter` | Area unit converter | ✅ WORKING |
| `sitemap.ts` | `/sitemap.xml` | Dynamic sitemap (80+ URLs) | ✅ WORKING |

---

## 11. WEBSITE — Components

### Core Layout
| File | Purpose | Status |
|------|---------|--------|
| `components/Navbar.tsx` | Navigation with dark mode toggle, Post Property CTA | ✅ WORKING |
| `components/Footer.tsx` | SEO-rich footer (50+ location links) | ✅ WORKING |
| `components/Hero.tsx` | Homepage hero with search + Continue Last Search | ✅ WORKING |
| `components/PropertyCard.tsx` | Reusable property card with dark mode | ✅ WORKING |
| `components/FeaturedProperties.tsx` | Featured properties section | ✅ WORKING |
| `components/ContactForm.tsx` | Contact form → SSOT | ✅ WORKING |
| `components/LeadCapture.tsx` | Lead capture modal | ✅ WORKING |
| `components/CTASection.tsx` | Call-to-action sections | ✅ WORKING |
| `components/StatsCounter.tsx` | Animated stats (properties sold, etc.) | ✅ WORKING |
| `components/WhatsAppButton.tsx` | Floating WhatsApp button | 🚧 PENDING (needs real number) |

### Home Sections
| File | Purpose | Status |
|------|---------|--------|
| `components/home/ServiceTiles.tsx` | 6 service tiles (Post Property, EMI, etc.) | ⚠️ MOCK WhatsApp number |
| `components/home/PropertyCategories.tsx` | Buy/Rent/Commercial categories | ✅ WORKING |
| `components/home/ValuePropositions.tsx` | Why Realty Pandit section | ✅ WORKING |
| `components/home/Testimonials.tsx` | Customer testimonials | ✅ WORKING |
| `components/home/TrustBadges.tsx` | Trust badges (100K+ users, etc.) | ✅ WORKING |
| `components/home/NewProjects.tsx` | New builder projects section | ✅ WORKING |

### AI Chat
| File | Purpose | Status |
|------|---------|--------|
| `components/chat/AIChatModal.tsx` | Full-screen Panditji AI chat modal | ✅ WORKING |
| `components/chat/ChatHeader.tsx` | Chat header with filters | ✅ WORKING |
| `components/chat/ChatMessages.tsx` | Message rendering + typing indicator | ✅ WORKING |
| `components/chat/ChatInput.tsx` | Chat input area | ✅ WORKING |
| `components/chat/PropertyChatCard.tsx` | Property card in chat | ✅ WORKING |

### Login
| File | Purpose | Status |
|------|---------|--------|
| `components/login/UserLoginModal.tsx` | Customer OTP login modal | 🚧 PENDING (needs WhatsApp OTP) |

### SEO
| File | Purpose | Status |
|------|---------|--------|
| `components/seo/JsonLd.tsx` | JSON-LD structured data renderer | ✅ WORKING |

### UI Library
| File | Purpose | Status |
|------|---------|--------|
| `components/ui/Accordion.tsx` | Accordion collapse component | ✅ WORKING |
| `components/ui/Badge.tsx` | Badge/chip component | ✅ WORKING |
| `components/ui/Button.tsx` | Button variants | ✅ WORKING |
| `components/ui/Card.tsx` | Card container | ✅ WORKING |
| `components/ui/Carousel.tsx` | Image/content carousel | ✅ WORKING |
| `components/ui/Container.tsx` | Page container wrapper | ✅ WORKING |
| `components/ui/Input.tsx` | Form input component | ✅ WORKING |
| `components/ui/Select.tsx` | Dropdown select | ✅ WORKING |
| `components/ui/Skeleton.tsx` | Loading skeleton | ✅ WORKING |
| `components/ui/Tabs.tsx` | Tab navigation | ✅ WORKING |

---

## 12. WEBSITE — Libraries & Context

| File | Purpose | Status |
|------|---------|--------|
| `contexts/ThemeContext.tsx` | Dark/light mode context + localStorage | ✅ WORKING |
| `lib/api.ts` | All backend API calls + TypeScript types | ✅ WORKING |
| `lib/blog-data.ts` | 10 hardcoded blog articles | ✅ WORKING |
| `lib/seo.ts` | SEO metadata helpers | ✅ WORKING |
| `lib/useMasterData.ts` | Hook to fetch master data (property types, etc.) | ✅ WORKING |
| `lib/utils.ts` | Utility functions (format price, phone, etc.) | ✅ WORKING |

---

## 13. ADMIN DASHBOARD (`agents/frontend/src/`)

| File | Purpose | Status |
|------|---------|--------|
| `main.tsx` | Entry point | ✅ WORKING |
| `App.tsx` | Router + auth guard | ✅ WORKING |
| `contexts/AuthContext.tsx` | JWT auth context | ✅ WORKING |
| `api/client.ts` | Axios API client | ✅ WORKING |
| `components/LoginPage.tsx` | Staff login (email+password) | ✅ WORKING |
| `components/DashboardLayout.tsx` | Sidebar + header layout | ✅ WORKING |
| `components/ContactList.tsx` | CRM contacts view | ✅ WORKING |
| `components/InventoryList.tsx` | Property inventory management | ✅ WORKING |
| `components/ChatView.tsx` | Conversation history viewer | ✅ WORKING |
| `components/TeamManagement.tsx` | Staff team CRUD | ✅ WORKING |
| `components/ReportsView.tsx` | Analytics/reports | ✅ WORKING |
| `components/ExternalLeads.tsx` | External portal leads | ✅ WORKING |
| `components/PartnerManagement.tsx` | Partner agent management | ✅ WORKING |
| `components/CalendarView.tsx` | Visit/appointment calendar | ✅ WORKING |
| `components/EmailManagement.tsx` | Email thread viewer | ✅ WORKING |

---

## 14. DEPLOYMENT SCRIPTS (Root)

| File | Purpose | Status |
|------|---------|--------|
| `deploy-now.sh` | PRIMARY deploy script (syncs agents/* → server, rebuilds) | ✅ WORKING |
| `push-update-scp.sh` | Older deploy script (uses wrong SSH key path) | ⚠️ DEPRECATED (use deploy-now.sh) |
| `update-server.sh` | Server-side rebuild script | ⚠️ OUTDATED (still has port 7575 bug) |
| `PUSH-UPDATE.bat` | Windows batch wrapper for push-update-scp.sh | ⚠️ DEPRECATED |
| `PROJECT_KNOWLEDGE.md` | Claude session reference (NEW) | ✅ NEW |
| `PROJECT_AUDIT_REPORT.md` | This file | ✅ NEW |

---

## 15. PIPELINE TOOLS (`pipeline/`)

| File | Purpose | Status |
|------|---------|--------|
| `watch-and-deploy.sh` | Auto-deploys on file change | ✅ NEW |
| `backup.sh` | DB + code backup | ✅ NEW |
| `health-check.sh` | Monitor all services | ✅ NEW |
| `START-PIPELINE.bat` | Windows: start watcher | ✅ NEW |
| `BACKUP-NOW.bat` | Windows: one-click backup | ✅ NEW |
| `HEALTH-CHECK.bat` | Windows: run health check | ✅ NEW |
| `README.md` | Pipeline documentation | ✅ NEW |

---

## 16. KNOWN ISSUES SUMMARY

### Critical (Fixed This Session)
| Issue | File | Resolution |
|-------|------|------------|
| Backend 4174+ restarts/day | `agents/backend/src/app.ts` | Changed `trust proxy: true` → `'loopback'` |
| Gemini AI returning "high traffic" | Server .env | New API key deployed |
| Website unreachable on domain | Server PM2 config | Fixed port back to 3000 (Nginx expects it) |

### Pending Client Action
| Issue | File | Needed From |
|-------|------|-------------|
| WhatsApp bot offline | `src/services/whatsapp.ts` | WhatsApp Business API credentials |
| Photo upload "coming soon" | `src/services/storage.ts` | Cloudinary API keys |
| ServiceTiles wrong number | `src/components/home/ServiceTiles.tsx` | Real WhatsApp number |
| City pages use mock data | `src/app/properties/in/[city]/page.tsx` | Real property listings |

### Pre-existing Non-Blocking
| Issue | File | Notes |
|-------|------|-------|
| Wrong import path | `src/services/dealer.ts` | Does not affect production |
| Duplicate prisma import | `src/services/voice.ts` | Does not affect production |
| Redis not running | `src/utils/redis.ts` | App works without Redis (fallback) |

---

## 17. SECURITY AUDIT

| Check | Status | Notes |
|-------|--------|-------|
| CORS whitelist | ✅ PASS | Only allowed origins accepted |
| JWT secrets | ✅ PASS | Environment variables, not hardcoded |
| Rate limiting | ✅ PASS | Different limits per route type |
| SQL injection | ✅ PASS | Prisma ORM parameterizes all queries |
| XSS protection | ✅ PASS | Helmet.js headers enabled |
| Trust proxy | 🔧 FIXED | Was `true` (unsafe), now `'loopback'` |
| API keys | ✅ PASS | Hashed in DB, validated via middleware |
| HTTPS | ✅ PASS | Let's Encrypt SSL on all 3 domains |
| Env vars in git | ✅ PASS | `.env` excluded via `.gitignore` |

---

## 18. PRODUCTION VERIFICATION

Run these commands to verify the system is healthy:

```bash
# Copy SSH key
cp "$HOME/.ssh/realty_pandit_key" /tmp/rp_key && chmod 600 /tmp/rp_key

# 1. API health
curl https://api.realtypandit.in/health
# Expected: {"status":"ok","agent":"Realty Pandit Backend","db":"connected"}

# 2. Test Gemini AI
curl -X POST https://api.realtypandit.in/public/ai-chat \
  -H "Content-Type: application/json" \
  -d '{"message":"2bhk flat in noida","sessionId":"test1"}'
# Expected: JSON with "reply" field containing real property recommendations

# 3. PM2 status (restart count should not be climbing)
ssh -i /tmp/rp_key root@72.62.231.224 "pm2 list"

# 4. Website loads
curl -I https://www.realtypandit.in
# Expected: HTTP/1.1 200 OK

# 5. Admin loads
curl -I https://admin.realtypandit.in
# Expected: HTTP/1.1 200 OK

# 6. Or use the pipeline health check script:
bash pipeline/health-check.sh
```

---

*This report was generated by Claude. Re-run the audit after major changes.*
