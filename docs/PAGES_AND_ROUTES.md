# Realty Pandit -- Pages & Routes Reference

> Comprehensive map of every page, view, and route across the Admin Dashboard (React/Vite), Public Website (Next.js 16), Agent Portal, and Mobile layouts.
> Generated from source code analysis on 2026-02-26.

---

## Table of Contents

1. [Admin Dashboard (React/Vite) -- 21 Views](#1-admin-dashboard-reactvite----21-views)
   - [Authentication Pages](#11-authentication-pages)
   - [Dashboard Views (State-Driven)](#12-dashboard-views-state-driven)
   - [Dashboard Sub-Tabs](#13-dashboard-sub-tabs)
2. [Mobile Views -- 9 Components](#2-mobile-views----9-components)
3. [Public Website (Next.js 16) -- 30 Pages](#3-public-website-nextjs-16----30-pages)
   - [Core / Informational Pages](#31-core--informational-pages)
   - [Property Pages](#32-property-pages)
   - [Blog Pages](#33-blog-pages)
   - [User Action Pages](#34-user-action-pages)
   - [Partner/Join Pages](#35-partnerjoin-pages)
   - [Authentication Pages](#36-authentication-pages)
   - [Tools Pages](#37-tools-pages)
   - [Utility Pages](#38-utility-pages)
4. [Agent Portal (Website) -- 6 Pages](#4-agent-portal-website----6-pages)
5. [Route Definition Locations](#5-route-definition-locations)
6. [Navigation Configuration](#6-navigation-configuration)
7. [Permission Matrix](#7-permission-matrix)
8. [API Endpoints Reference](#8-api-endpoints-reference)

---

## 1. Admin Dashboard (React/Vite) -- 21 Views

**Technology:** React 18 + Vite + TypeScript
**Entry Point:** `agents/frontend/src/App.tsx` (503 lines)
**Base URL:** Deployed at admin subdomain (e.g., `https://admin.realtypandit.in`)

The admin dashboard is a **single-page application**. Navigation is **state-driven**: a `view` string state variable in `App.tsx` maps to the corresponding component. The sidebar is rendered by `DashboardLayout.tsx` (236 lines), and the active view is passed via `activeView` / `onViewChange` props.

### 1.1 Authentication Pages

These are rendered before the dashboard layout, based on URL path or auth state.

| Route / Condition | Component | File | Lines | Description |
|---|---|---|---|---|
| `/setup-password?token=...` | `SetupPasswordPage` | `components/SetupPasswordPage.tsx` | 198 | Token-validated password setup for new team members. Steps: loading, form (name/email/password), success, error. |
| No auth (default) | `LoginPage` | `components/LoginPage.tsx` | 548 | Phone + password login with animated skyline transition. Includes forgot-password flow (OTP via WhatsApp). |

**LoginPage Details:**
- Modes: `login` | `forgot`
- Forgot password steps: `phone` -> `otp` -> `done`
- Animated skyline transition on successful login (`SkylineOverlay`)
- OTP resend with 60-second countdown
- API endpoints: `POST /auth/login`, `POST /auth/forgot-password`, `POST /auth/verify-reset-otp`, `POST /auth/resend-otp`

**SetupPasswordPage Details:**
- Validates token via `GET /auth/validate-setup-token?token=...`
- Submits new password via `POST /auth/setup-password`
- Pre-populates name and email from token validation response

### 1.2 Dashboard Views (State-Driven)

All views below are rendered inside `DashboardLayout` which provides the collapsible sidebar and header.

| View Key | Component | File | Lines | Permission | Description |
|---|---|---|---|---|---|
| `dashboard` | `DashboardTabs` | `components/DashboardTabs.tsx` | 88 | None | Container for 5 dashboard sub-tabs (see section 1.3) |
| `chats` | `ContactList` + `ChatView` | `components/ContactList.tsx` + `components/ChatView.tsx` | 169 + 168 | None | Left panel: searchable contact list with lead score badges (HOT/WARM/COLD). Right panel: chat history with date separators, or `WelcomePanel` when no contact selected. |
| `calendar` | `CalendarView` | `components/CalendarView.tsx` | 448 | None | Appointment management with summary stats (today/week/pending), filters by status and type, appointment detail modal with status updates. |
| `emails` | `EmailManagement` | `components/EmailManagement.tsx` | 805 | None | Full email dashboard with inbox/sent/all tabs, compose modal, bulk email modal, AI-powered email generation, search, pagination. |
| `calls` | `CallLog` | `components/CallLog.tsx` | 488 | None | Voice call history with audio playback controls, transcript expansion, AI call summaries, filters by status/direction/date/search. Uses lucide-react icons. |
| `inventory` | `InventoryList` | `components/InventoryList.tsx` | 967 | `view_inventory` | Property inventory with pagination, filters (intent/state/type/status/agent/search), inline editing, delete confirmation, bulk CSV upload, and "Add Property" sub-view via `AddInventory` (988 lines). |
| `property-map` | `PropertyMapView` | `components/PropertyMapView.tsx` | 621 | `view_inventory` | Google Maps integration with clustered markers, color-coded by status, filter panel (intent/type/price/status/location), info windows with property details. |
| `live-status` | `PropertyLiveStatus` | `components/PropertyLiveStatus.tsx` | 420 | `view_inventory` | Unit grid view with color-coded status tiles (Available/Sold/Rented/Withdrawn/Hold), group-by options (all/location/floor), inline status change, filter by status and location. |
| `leads` | `ExternalLeads` | `components/ExternalLeads.tsx` | 153 | `view_all_leads` | External lead analytics showing leads by source (99acres, MagicBricks, Housing.com, Website, WhatsApp, Voice, Manual) with counts, color bars, and recent lead list. |
| `team` | `TeamManagement` | `components/TeamManagement.tsx` | 477 | `manage_agents` | Team CRUD with add member form (auto-generates email preview), edit modal, set password modal, resend setup link, department badges, role colors. |
| `partners` | `PartnerManagement` | `components/PartnerManagement.tsx` | 308 | `manage_agents` | Partner agent management with verify/status/commission controls, add partner form (phone/name/agency/type/package/commission). |
| `reports` | `ReportsView` | `components/ReportsView.tsx` | 823 | `view_reports` | Comprehensive reporting with **8 categories** and **26+ report types** (see Reports detail below). Includes date/status/source/type filters, CSV/Excel/PDF export. |
| `ai-dashboard` | `QADashboard` | `components/QADashboard.tsx` | 317 | `view_reports` | AI agent health dashboard showing uptime, total contacts, active properties, agent metrics table (success/failure/error rates), conversion funnel visualization, quality/sentiment summary, security events, campaign stats. |
| `agent-logs` | `AgentLogs` | `components/AgentLogs.tsx` | 481 | `view_reports` | Two tabs: **Actions** (AI agent action logs with agent/status/phone filters, pagination) and **QA** (quality assessment logs with flagged/sentiment indicators). |
| `override` | `AgentOverride` | `components/AgentOverride.tsx` | 357 | `view_reports` | Two tabs: **Flagged** (flagged QA logs for human review with approve/unflag actions) and **Templates** (winning AI response templates filtered by agent). |
| `workflows` | `WorkflowBuilder` | `components/WorkflowBuilder.tsx` | 821 | `view_reports` | Visual workflow automation builder with 7 trigger types, 7 condition operators, 6 action types, test execution, enable/disable toggle, execution history viewer. |
| `marketing` | `MarketingCampaign` | `components/MarketingCampaign.tsx` | 904 | `view_reports` | Marketing campaign builder with templates tab and campaigns tab. Supports 4 channels (WhatsApp/Email/SMS/Voice), 4 campaign types (broadcast/drip/launch_promo/follow_up), audience segmentation, A/B testing config, scheduling. |
| `tasks` | `TaskBoard` | `components/TaskBoard.tsx` | 871 | None | Task and project management with 3 view modes (Kanban/List/Calendar), project grouping, task CRUD, 4 statuses (TODO/IN_PROGRESS/DONE/BLOCKED), 4 priorities (LOW/MEDIUM/HIGH/URGENT), tags. |
| `analytics` | `AdvancedAnalytics` | `components/AdvancedAnalytics.tsx` | 614 | `view_reports` | Advanced analytics with 5 tabs (Overview/Trends/Funnel/Sources/Agents), date range selector (7d/30d/90d/YTD/custom), Recharts visualizations (Line/Bar/Pie/Area charts), forecasts. |

**Additional Shared Components:**
| Component | File | Lines | Description |
|---|---|---|---|
| `DashboardLayout` | `components/DashboardLayout.tsx` | 236 | Sidebar navigation with 19 nav items, collapsible sidebar, mobile hamburger menu, theme toggle, user info with role badge, logout button. |
| `WelcomePanel` | `App.tsx` (inline) | ~90 | Shown in chats view when no contact selected. Displays greeting, lead overview stats (5 cards), recent contacts grid. |
| `AddInventory` | `components/AddInventory.tsx` | 988 | Multi-step workflow-based property creation form using `useWorkflow` hook. |
| `VoiceCommands` | `components/VoiceCommands.tsx` | 407 | Voice-activated navigation overlay (available on both desktop and mobile). |
| `GooglePlacesInput` | `components/GooglePlacesInput.tsx` | 155 | Google Places autocomplete input component used in inventory forms. |
| `NotificationSettings` | `components/NotificationSettings.tsx` | 522 | Notification preferences management. |

### 1.3 Dashboard Sub-Tabs

The `DashboardTabs` component renders 5 sub-tabs inside the `dashboard` view:

| Tab ID | Tab Label | Component | File | Lines | Key Features | API Endpoints |
|---|---|---|---|---|---|---|
| `main` | Main Dashboard | `MainDashboard` | `components/dashboard/MainDashboard.tsx` | 274 | KPI stat cards (total contacts, hot/warm/cold leads, today appointments, active properties), recent contacts grid | `GET /api/contacts`, `GET /api/calendar/appointments`, `GET /api/inventory` |
| `market` | Market Trends | `MarketTrendsDashboard` | `components/dashboard/MarketTrendsDashboard.tsx` | 192 | Recharts LineChart showing leads/visits/sales trends over time, configurable date range (7/14/30/90 days) | `GET /api/analytics/market-trends` |
| `users` | User Performance | `UserPerformanceDashboard` | `components/dashboard/UserPerformanceDashboard.tsx` | 251 | Recharts BarChart of top 10 agents, sortable by deals/revenue/leads, performance table with leads/appointments/deals/revenue metrics | `GET /api/analytics/user-performance` |
| `sources` | Lead Sources | `LeadSourcesDashboard` | `components/dashboard/LeadSourcesDashboard.tsx` | 253 | Recharts PieChart of lead sources, conversion rate per source, total/converted summary, source breakdown table | `GET /api/analytics/lead-sources` |
| `property` | Property Analytics | `PropertyAnalyticsDashboard` | `components/dashboard/PropertyAnalyticsDashboard.tsx` | 224 | Property status breakdown (PieChart), type distribution (BarChart), total/active property counts, intent-wise analysis | `GET /api/analytics/property-trends` |

### Reports Detail (ReportsView -- 8 Categories, 26 Report Types)

| Category | Icon | Reports |
|---|---|---|
| **Account Reports** | Money | Customer Outstanding (Sales), Vendor Outstanding (Purchase), Monthly Sales by Customer, Monthly Purchase by Vendor |
| **User Reports** | Users | User Performance, User Task Completion |
| **Call Reports** | Phone | All Call Logs, Date Wise Call Log, Month Wise Call Summary |
| **Lead Reports** | Target | All Leads, Lead Last Contact Date With Days, Lead Overall Summary, Lead Cancelled Reason Analysis |
| **Sold Reports** | Check | Sold By Property, Sold By Area, Sold By Unit Type |
| **Visit Reports** | House | All Site Visits, Property Visit Count |
| **Customer Reports** | Handshake | Customers Converted But Not Sold |
| **Property Reports** | Building | All Properties, Hold Properties, Property Availability Summary |

---

## 2. Mobile Views -- 9 Components

**Directory:** `agents/frontend/src/components/mobile/`
**Detection:** `useIsMobile()` hook in `App.tsx` -- renders `MobileLayout` instead of `DashboardLayout`
**Navigation:** Bottom tab bar (Home/Chats/Inventory/Team/Menu) + slide-out drawer for full menu
**Browser History:** `history.pushState` / `popstate` for back button support

| Component | File | Lines | Description | Key Features |
|---|---|---|---|---|
| `MobileLayout` | `mobile/MobileLayout.tsx` | 240 | Shell layout with top header bar, bottom tab navigation (5 tabs), and slide-out drawer menu. Handles permission-based nav filtering. | Bottom tabs: Home, Chats, Inventory, Team, Menu. Drawer: full nav list. Theme toggle, logout, agent profile with role badge. |
| `MobileDashboard` | `mobile/MobileDashboard.tsx` | 116 | Mobile-optimized welcome screen with greeting, 3 stat cards (Total/Hot/Warm), and recent contacts list (up to 8). | Compact stat cards in 3-column grid, contact cards with type icons and score indicators. |
| `MobileContactList` | `mobile/MobileContactList.tsx` | 139 | Searchable and filterable contact list for mobile. Filter chips: All, Buyers, Sellers, Partners, Hot leads. | Search bar, horizontal filter chips, contact cards with lead score badges. |
| `MobileChatView` | `mobile/MobileChatView.tsx` | 117 | Mobile chat interface showing conversation history with contact info header. Actions: report no-show, update contact type. | Auto-scroll to latest message, contact info header with score, action sheet for status changes. |
| `MobileInventoryList` | `mobile/MobileInventoryList.tsx` | 291 | Mobile property listing with filters, search, pagination. Edit and Add buttons navigate to detail views. | Collapsible filter panel (intent/type/status/state/agent), property cards with price/intent badges, inline status change. |
| `MobileInventoryEdit` | `mobile/MobileInventoryEdit.tsx` | 380 | Full property edit form for mobile with all fields: classification, specs, pricing, location (Google Places), media upload/delete. | GooglePlacesInput integration, image upload/gallery, category tree cascading dropdowns, spec fields (bedrooms/bathrooms/area). |
| `MobileTeamView` | `mobile/MobileTeamView.tsx` | 179 | Team member list with set-password and resend-setup-link actions. | Member cards with role badges, action modals for password reset, permission-gated actions. |
| `MobileCalendar` | `mobile/MobileCalendar.tsx` | 146 | Mobile appointment list with status filter and inline status change. | Filter chips by status (scheduled/confirmed/completed/cancelled/no_show), appointment cards with type icons, quick status actions. |
| `MobileSettings` | `mobile/MobileSettings.tsx` | 122 | Settings/profile screen with agent info, theme toggle, permission-gated menu items for deeper features. | Profile card, theme toggle, menu items linking to: External Leads, Partner Agents, Email Management, Reports, AI Agents, Agent Logs, Override. |

**Mobile Navigation Flow:**
```
MobileLayout (bottom tabs)
  |-- Home (dashboard) --> DashboardTabs (reuses desktop component)
  |-- Chats --> MobileContactList --> [select] --> MobileChatView
  |-- Inventory --> MobileInventoryList --> [edit] --> MobileInventoryEdit
  |                                    --> [add]  --> AddInventory (shared)
  |-- Team --> MobileTeamView
  |-- Menu (drawer) --> All 17+ views (many reuse desktop components)
       |-- Calendar --> MobileCalendar
       |-- Settings --> MobileSettings
       |-- Everything else --> Desktop component rendered in mobile shell
```

---

## 3. Public Website (Next.js 16) -- 30 Pages

**Technology:** Next.js 16 (App Router) + TypeScript + Tailwind CSS + Framer Motion
**Directory:** `agents/website/src/app/`
**Root Layout:** `agents/website/src/app/layout.tsx` -- Includes `ThemeProvider`, `Navbar`, `Footer`, `WhatsAppButton`, `LeadCapture`
**SEO Metadata (root):** Title: "Realty Pandit - Find Your Dream Property", OG/Twitter cards configured

### 3.1 Core / Informational Pages

| Route | Component/Export | File | Lines | Key Features | Components Used |
|---|---|---|---|---|---|
| `/` | `HomePage` | `app/page.tsx` | 27 | Landing page with hero, value propositions, property categories, service tiles, featured properties, new projects, stats counter, testimonials, trust badges, CTA | `Hero`, `ValuePropositions`, `PropertyCategories`, `ServiceTiles`, `FeaturedProperties`, `NewProjects`, `StatsCounter`, `Testimonials`, `TrustBadges`, `CTASection` |
| `/about` | `AboutPage` (default) | `app/about/page.tsx` | 533 | Company story with animated timeline (2008-2024), 4 stat counters (15+ years, 1M+ clients, 50+ experts, 10K+ properties), values section, team section, CTA. Uses Framer Motion animations. | `motion` (framer-motion), `useInView`, lucide-react icons |
| `/services` | `ServicesPage` (default) | `app/services/page.tsx` | 197 | 6 service cards: Buy Property, Sell Property, Rent Property, Property Management, Legal Assistance, Home Loans. Each with icon, description, and color coding. | `motion`, lucide-react icons, `Link` |
| `/contact` | `ContactPage` | `app/contact/page.tsx` | 115 | Contact info (WhatsApp, Phone, Email, Office address) + contact form. | `ContactForm`, `motion`, lucide-react icons |
| `/faq` | `FAQPage` (default) | `app/faq/page.tsx` | 363 | Categorized FAQ with search. Categories: All, General, Buying, Selling, Renting, Panditji AI, Legal. Accordion-style Q&A. | `motion`, `AnimatePresence`, `Link` |
| `/privacy` | `PrivacyPolicyPage` | `app/privacy/page.tsx` | 173 | Privacy policy with 7 sections: Information Collection, Usage, Storage & Security, Third-Party, Cookies, Your Rights, Contact. Table of contents sidebar. | `motion`, `Link`, lucide-react icons |
| `/terms` | `TermsOfServicePage` | `app/terms/page.tsx` | 206 | Terms of service with 10 sections: Acceptance, Accounts, Listings, Responsibilities, Prohibited Activities, Intellectual Property, Liability, Disputes, Governing Law, Contact. | `motion`, `Link`, lucide-react icons |

### 3.2 Property Pages

| Route | Component/Export | File | Lines | Key Features | API / Data Source |
|---|---|---|---|---|---|
| `/properties` | `PropertiesContent` (Suspense-wrapped) | `app/properties/page.tsx` | 699 | Full property search with two tabs: **Resale** (individual properties) and **Projects** (builder projects). Advanced filters: category/subcategory/type (cascading from master data), configuration, usage type, investment type, intent, price range, location, amenities, furnishing, posted-by. Grid/List view toggle, sorting, pagination. | `getProperties()`, `getProjects()`, `useMasterData()` |
| `/properties/[id]` | `PropertyDetailPage` (default) | `app/properties/[id]/page.tsx` | 658 | Single property detail with image gallery, Panditji Score (6-10 rating), specs, features, price, description, nearby places, contact form, similar properties, share/wishlist/flag buttons, EMI calculator link. | `getPropertyById()`, `getSimilarProperties()` |
| `/properties/in/[city]` | `CityPage` | `app/properties/in/[city]/page.tsx` | 303 | City-level property browsing with locality grid, property type filter (All/Flats/Houses/Plots/Commercial), stats (avg price, property count), CTA to localities. Supports 8 cities: Noida, Gurgaon, Delhi, Mumbai, Bangalore, Pune, Hyderabad, Chennai. | Static city data + API |
| `/properties/in/[city]/[locality]` | `LocalityPage` (default) | `app/properties/in/[city]/[locality]/page.tsx` | 286 | Locality-level property browsing with property type filter, locality stats, breadcrumb navigation, CTA. | Static data + API |
| `/projects/[id]` | `ProjectDetailPage` | `app/projects/[id]/page.tsx` | 502 | Builder project detail with image gallery, project info (type/status/builder/RERA/possession), unit configurations, floor plans, amenities list, enquiry modal, similar projects. | `getProjectDetail()`, `getSimilarProjects()`, `submitProjectEnquiry()` |
| `/compare` | `ComparePage` (default) | `app/compare/page.tsx` | 244 | Side-by-side property comparison (up to 3 properties). Compares: price, area, bedrooms, bathrooms, location, intent. Pre-loaded with sample properties. | localStorage / `getPropertyById()` |

### 3.3 Blog Pages

| Route | Component/Export | File | Lines | Key Features | Data Source |
|---|---|---|---|---|---|
| `/blog` | `BlogPage` | `app/blog/page.tsx` | 138 | Blog listing with category filter, post cards (title, excerpt, author, date, reading time). | `blogPosts`, `blogCategories` from `lib/blog-data` |
| `/blog/[slug]` | `BlogDetailPage` | `app/blog/[slug]/page.tsx` | 209 | Full blog post with share (WhatsApp, copy link), related posts sidebar, breadcrumb navigation, 404 handling for missing posts. | `getBlogPostBySlug()`, `getRelatedPosts()` |

### 3.4 User Action Pages

| Route | Component/Export | File | Lines | Key Features |
|---|---|---|---|---|
| `/post-property` | `PostPropertyPage` | `app/post-property/page.tsx` | 172 | Multi-step workflow-based property submission form using `useWorkflow` hook. Steps rendered by `WorkflowProgress`, `StepRenderer`, `StepConfirmation`. Success screen with property ID. |
| `/post-project` | `PostProjectPage` | `app/post-project/page.tsx` | 729 | 5-step builder project submission: Basic Info, Unit Details (with dynamic unit rows for each configuration), Media Upload, Additional Details, Preview & Submit. Project types: Residential, Commercial, Mixed Use, Plotted Development. |

### 3.5 Partner/Join Pages

| Route | Component/Export | File | Lines | Key Features |
|---|---|---|---|---|
| `/join` | `JoinPage` | `app/join/page.tsx` | 184 | Landing page showing 3 partner types: Individual Agent (FREE plan), Property Agency (PRO plan), Builder/Developer (PREMIUM plan). Each with features list and CTA link. |
| `/join/agent` | `AgentRegisterPage` | `app/join/agent/page.tsx` | 303 | Agent registration form with plan selection (FREE/BASIC/PRO). Query param `?type=individual|agency` pre-selects plan. Fields: name, phone, email, company name. |
| `/join/builder` | `BuilderRegisterPage` | `app/join/builder/page.tsx` | 286 | Builder registration form defaulting to PREMIUM plan. Features list: unlimited projects, unit-wise inventory, direct leads, premium placement, analytics, RERA badge, virtual tours, dedicated manager. |

### 3.6 Authentication Pages

| Route | Component/Export | File | Lines | Key Features |
|---|---|---|---|---|
| `/login` | `LoginPage` | `app/login/page.tsx` | 201 | Login gateway with 4 cards: Customer/User Login (modal), Partner Agent Dashboard (link to `/agent/login`), Builder Dashboard (link to admin), Admin Panel (link to admin). |
| `/agent/login` | `AgentLogin` | `app/agent/login/page.tsx` | 155 | Partner agent OTP-based login: phone input -> send OTP -> verify OTP. API: `POST /agent/login-otp`, `POST /agent/verify-otp`. Stores token in `localStorage`. |

### 3.7 Tools Pages

| Route | Component/Export | File | Lines | Key Features |
|---|---|---|---|---|
| `/tools/area-converter` | `AreaConverterPage` (default) | `app/tools/area-converter/page.tsx` | 219 | Bi-directional area unit converter with 10 units: sq ft, sq m, sq yd, acres, hectares, gaj, bigha, biswa, marla, kanal. Includes quick reference table, swap button. |
| `/tools/emi-calculator` | `EMICalculatorPage` | `app/tools/emi-calculator/page.tsx` | 258 | Home loan EMI calculator with sliders for loan amount, interest rate, tenure. Displays monthly EMI, total interest, total payable, principal vs interest percentage. |

### 3.8 Utility Pages

| Route | Component/Export | File | Lines | Key Features |
|---|---|---|---|---|
| `/wishlist` | `WishlistPage` | `app/wishlist/page.tsx` | 145 | Saved properties from localStorage. Displays PropertyCard grid, clear-all with confirmation, empty state with browse CTA. |

---

## 4. Agent Portal (Website) -- 6 Pages

**Directory:** `agents/website/src/app/agent/`
**Layout:** `agents/website/src/app/agent/layout.tsx` (110 lines) -- Sidebar layout with 5 nav items, auth check (redirects to `/agent/login` if no `agent_token` in localStorage), mobile hamburger menu, logout.
**Brand:** "Partner Portal"

| Route | Component/Export | File | Lines | Description | Key Features |
|---|---|---|---|---|---|
| `/agent/login` | `AgentLogin` | `agent/login/page.tsx` | 155 | OTP-based login for partner agents | Phone -> OTP -> Dashboard redirect. No sidebar shown on login page. |
| `/agent/dashboard` | `AgentDashboard` | `agent/dashboard/page.tsx` | 74 | Overview dashboard with 4 stat cards | Active Listings, Total Enquiries, Visits Scheduled, Conversion Rate |
| `/agent/inventory` | `AgentInventory` | `agent/inventory/page.tsx` | 61 | Property listing manager | List with status/views, Edit/Delete buttons, "Add Property" link to `/post-property` |
| `/agent/leads` | `AgentLeads` | `agent/leads/page.tsx` | 121 | Leads & enquiries list | Lead cards with buyer info (some hidden for free plan), status badges, search |
| `/agent/appointments` | `AgentAppointments` | `agent/appointments/page.tsx` | 81 | Upcoming site visits | Appointment cards with date/time/buyer/property info, status indicators |
| `/agent/subscription` | `AgentSubscription` | `agent/subscription/page.tsx` | 88 | Subscription plan management | 3 plans: Free (R0), Pro (R1,999/mo), Advance Pro (R4,999/mo). Current plan indicator. |

**Agent Portal Navigation (sidebar):**
```
Dashboard       -> /agent/dashboard       (LayoutDashboard icon)
My Inventory    -> /agent/inventory       (Building2 icon)
Leads & Enquiries -> /agent/leads         (Users icon)
Appointments    -> /agent/appointments    (Calendar icon)
Subscription    -> /agent/subscription    (CreditCard icon)
```

---

## 5. Route Definition Locations

### Admin Dashboard (React/Vite)

| Aspect | File | Details |
|---|---|---|
| **View Switching Logic** | `agents/frontend/src/App.tsx` | `useState('dashboard')` -- single `view` state variable. `switch(view)` at lines 302-413 (mobile) and 426-491 (desktop). |
| **Sidebar Navigation** | `agents/frontend/src/components/DashboardLayout.tsx` | `navItems` array (lines 20-40) -- 19 items with `id`, `label`, `icon`, `permission`. |
| **Mobile Bottom Tabs** | `agents/frontend/src/components/mobile/MobileLayout.tsx` | `tabs` array (line 45-51) -- 5 bottom tabs: dashboard, chats, inventory, team, _menu. |
| **Mobile Drawer Nav** | `agents/frontend/src/components/mobile/MobileLayout.tsx` | `ALL_NAV_ITEMS` array (lines 14-32) -- 17 items matching desktop sidebar. |
| **Public Route** | `agents/frontend/src/App.tsx` | Line 273: `if (window.location.pathname === '/setup-password')` -- only URL-based route in the SPA. |
| **Auth Guard** | `agents/frontend/src/App.tsx` | Lines 285-287: `if (!agent) return <LoginPage />` |

### Public Website (Next.js 16)

| Aspect | Location | Details |
|---|---|---|
| **File-Based Routing** | `agents/website/src/app/` | Next.js App Router -- each `page.tsx` automatically maps to a route based on directory structure. |
| **Root Layout** | `agents/website/src/app/layout.tsx` | Wraps all pages with `ThemeProvider`, `Navbar`, `Footer`, `WhatsAppButton`, `LeadCapture`. |
| **Agent Layout** | `agents/website/src/app/agent/layout.tsx` | Wraps `/agent/*` pages with sidebar, auth check, logout. Excludes sidebar on `/agent/login`. |
| **Dynamic Routes** | Various | `[id]` params: `/properties/[id]`, `/projects/[id]`. `[slug]` params: `/blog/[slug]`. `[city]`/`[locality]` params: `/properties/in/[city]`, `/properties/in/[city]/[locality]`. |
| **Navbar Links** | `agents/website/src/components/Navbar.tsx` | Navigation links to public pages. |

---

## 6. Navigation Configuration

### Admin Dashboard Sidebar Items

```typescript
const navItems = [
  { id: 'dashboard',    label: 'Dashboard',      icon: 'chart',     permission: null },
  { id: 'chats',        label: 'Chats',           icon: 'speech',    permission: null },
  { id: 'calendar',     label: 'Calendar',        icon: 'calendar',  permission: null },
  { id: 'emails',       label: 'Emails',          icon: 'email',     permission: null },
  { id: 'calls',        label: 'Call Log',         icon: 'phone',     permission: null },
  { id: 'inventory',    label: 'Inventory',       icon: 'house',     permission: 'view_inventory' },
  { id: 'property-map', label: 'Property Map',    icon: 'map',       permission: 'view_inventory' },
  { id: 'live-status',  label: 'Live Status',     icon: 'circle',    permission: 'view_inventory' },
  { id: 'leads',        label: 'Ext. Leads',      icon: 'inbox',     permission: 'view_all_leads' },
  { id: 'partners',     label: 'Partner Agents',  icon: 'handshake', permission: 'manage_agents' },
  { id: 'team',         label: 'Team',            icon: 'users',     permission: 'manage_agents' },
  { id: 'reports',      label: 'Reports',         icon: 'chart',     permission: 'view_reports' },
  { id: 'ai-dashboard', label: 'AI Agents',       icon: 'robot',     permission: 'view_reports' },
  { id: 'agent-logs',   label: 'Agent Logs',      icon: 'notepad',   permission: 'view_reports' },
  { id: 'override',     label: 'Override',        icon: 'shield',    permission: 'view_reports' },
  { id: 'workflows',    label: 'Workflows',       icon: 'refresh',   permission: 'view_reports' },
  { id: 'marketing',    label: 'Marketing',       icon: 'megaphone', permission: 'view_reports' },
  { id: 'tasks',        label: 'Tasks',           icon: 'clipboard', permission: null },
  { id: 'analytics',    label: 'Analytics',       icon: 'trending',  permission: 'view_reports' },
];
```

### Agent Portal Sidebar Items

```typescript
const navItems = [
  { name: 'Dashboard',        href: '/agent/dashboard',     icon: LayoutDashboard },
  { name: 'My Inventory',     href: '/agent/inventory',     icon: Building2 },
  { name: 'Leads & Enquiries', href: '/agent/leads',        icon: Users },
  { name: 'Appointments',     href: '/agent/appointments',  icon: Calendar },
  { name: 'Subscription',     href: '/agent/subscription',  icon: CreditCard },
];
```

---

## 7. Permission Matrix

The Admin Dashboard uses role-based permissions. The `hasPermission()` method from `AuthContext` gates access to sidebar items and their views.

| Permission | Required For Views | Roles That Have It |
|---|---|---|
| *(none)* | dashboard, chats, calendar, emails, calls, tasks | All authenticated agents |
| `view_inventory` | inventory, property-map, live-status | super_boss, manager, employee (if granted) |
| `view_all_leads` | leads (External Leads) | super_boss, manager |
| `manage_agents` | team, partners | super_boss, manager |
| `view_reports` | reports, ai-dashboard, agent-logs, override, workflows, marketing, analytics | super_boss, manager |

**Role Hierarchy:**
| Role | Color Badge | Access Level |
|---|---|---|
| `super_boss` | Red | Full access to all features |
| `manager` | Amber/Yellow | Access to team, reports, and management features |
| `employee` | Green | Basic access -- chats, calendar, tasks, limited inventory |

---

## 8. API Endpoints Reference

### Authentication (Public -- No Auth Required)

| Method | Endpoint | Used By |
|---|---|---|
| `POST` | `/auth/login` | LoginPage |
| `POST` | `/auth/forgot-password` | LoginPage (forgot mode) |
| `POST` | `/auth/verify-reset-otp` | LoginPage (OTP step) |
| `POST` | `/auth/resend-otp` | LoginPage (resend OTP) |
| `GET` | `/auth/validate-setup-token?token=...` | SetupPasswordPage |
| `POST` | `/auth/setup-password` | SetupPasswordPage |

### Contacts & Interactions

| Method | Endpoint | Used By |
|---|---|---|
| `GET` | `/api/contacts` | ContactList, WelcomePanel, MainDashboard |
| `GET` | `/api/contacts/{phone}/interactions` | ChatView |
| `PATCH` | `/api/contacts/{phone}` | ChatView (update type) |

### Inventory

| Method | Endpoint | Used By |
|---|---|---|
| `GET` | `/api/inventory` | InventoryList, PropertyMapView, PropertyLiveStatus, MainDashboard |
| `GET` | `/api/inventory/{id}` | InventoryList (edit) |
| `POST` | `/api/inventory` | AddInventory |
| `PATCH` | `/api/inventory/{id}` | InventoryList, PropertyLiveStatus, MobileInventoryEdit |
| `DELETE` | `/api/inventory/{id}` | InventoryList |
| `POST` | `/api/inventory/{id}/upload` | MobileInventoryEdit, InventoryList |
| `DELETE` | `/api/inventory/{id}/media/{filename}` | MobileInventoryEdit |

### Calendar

| Method | Endpoint | Used By |
|---|---|---|
| `GET` | `/api/calendar/appointments` | CalendarView, MobileCalendar, MainDashboard |
| `GET` | `/api/calendar/appointments/{id}` | CalendarView |
| `POST` | `/api/calendar/appointments` | CalendarView |
| `PATCH` | `/api/calendar/appointments/{id}` | CalendarView, MobileCalendar |
| `DELETE` | `/api/calendar/appointments/{id}` | CalendarView |
| `GET` | `/api/calendar/summary` | CalendarView |

### Team Management

| Method | Endpoint | Used By |
|---|---|---|
| `GET` | `/api/team/members` | TeamManagement, MobileTeamView |
| `GET` | `/api/team/members-without-phone` | TeamManagement |
| `PATCH` | `/api/team/members/{id}/set-password` | TeamManagement, MobileTeamView |
| `POST` | `/api/team/members/{id}/resend-setup` | TeamManagement, MobileTeamView |

### Partners

| Method | Endpoint | Used By |
|---|---|---|
| `GET` | `/api/partners` | PartnerManagement |
| `POST` | `/api/partners` | PartnerManagement |
| `PATCH` | `/api/partners/{id}/verify` | PartnerManagement |
| `PATCH` | `/api/partners/{id}/status` | PartnerManagement |
| `PATCH` | `/api/partners/{id}/commission` | PartnerManagement |

### Leads

| Method | Endpoint | Used By |
|---|---|---|
| `GET` | `/api/leads/by-source` | ExternalLeads |
| `GET` | `/api/leads/recent-external` | ExternalLeads |
| `POST` | `/api/leads/{phone}/no-show` | ChatView |

### Email Management

| Method | Endpoint | Used By |
|---|---|---|
| `GET/POST` | `/api/emails/*` | EmailManagement |

### Voice Calls

| Method | Endpoint | Used By |
|---|---|---|
| `GET` | `/api/calls/voice-log/all` | CallLog |

### AI Agent Dashboard

| Method | Endpoint | Used By |
|---|---|---|
| `GET` | `/api/agent-dashboard/health` | QADashboard |
| `GET` | `/api/agent-dashboard/metrics` | QADashboard |
| `GET` | `/api/agent-dashboard/funnel` | QADashboard |
| `GET` | `/api/agent-dashboard/logs` | AgentLogs |
| `GET` | `/api/agent-dashboard/qa-logs` | AgentLogs, AgentOverride |
| `PATCH` | `/api/agent-dashboard/qa-logs/{id}/review` | AgentOverride |
| `PATCH` | `/api/agent-dashboard/qa-logs/{id}/flag` | AgentOverride |
| `GET` | `/api/agent-dashboard/winning-templates` | AgentOverride |
| `GET` | `/api/agent-dashboard/campaigns` | MarketingCampaign |
| `POST` | `/api/agent-dashboard/campaigns` | MarketingCampaign |
| `POST` | `/api/agent-dashboard/campaigns/{id}/execute` | MarketingCampaign |
| `POST` | `/api/agent-dashboard/campaigns/{id}/cancel` | MarketingCampaign |
| `GET` | `/api/agent-dashboard/campaigns/analytics` | MarketingCampaign |

### Workflow (Property Add)

| Method | Endpoint | Used By |
|---|---|---|
| `GET` | `/api/workflow/definition` | AddInventory, PostPropertyPage |
| `POST` | `/api/workflow/next-step` | AddInventory, PostPropertyPage |
| `POST` | `/api/workflow/previous-step` | AddInventory, PostPropertyPage |
| `POST` | `/api/workflow/validate` | AddInventory, PostPropertyPage |
| `POST` | `/api/workflow/options` | AddInventory, PostPropertyPage |
| `POST` | `/api/workflow/summary` | AddInventory, PostPropertyPage |
| `POST` | `/api/workflow/commit` | AddInventory, PostPropertyPage |
| `POST` | `/api/workflow/upload-media` | AddInventory, PostPropertyPage |
| `POST` | `/api/workflow/upload-video` | AddInventory, PostPropertyPage |
| `POST` | `/api/workflow/upload-document` | AddInventory, PostPropertyPage |

### Analytics

| Method | Endpoint | Used By |
|---|---|---|
| `GET` | `/api/analytics/market-trends` | MarketTrendsDashboard |
| `GET` | `/api/analytics/user-performance` | UserPerformanceDashboard |
| `GET` | `/api/analytics/lead-sources` | LeadSourcesDashboard |
| `GET` | `/api/analytics/property-trends` | PropertyAnalyticsDashboard |
| `GET` | `/api/analytics/financial-summary` | (available) |
| `GET` | `/api/analytics/advanced` | AdvancedAnalytics |

### Reports

| Method | Endpoint | Used By |
|---|---|---|
| `GET` | `/api/reports/account/customer-outstanding` | ReportsView |
| `GET` | `/api/reports/account/vendor-outstanding` | ReportsView |
| `GET` | `/api/reports/account/monthly-sales` | ReportsView |
| `GET` | `/api/reports/account/monthly-purchase` | ReportsView |
| `GET` | `/api/reports/user/performance` | ReportsView |
| `GET` | `/api/reports/user/task-completion` | ReportsView |
| `GET` | `/api/reports/call/all-logs` | ReportsView |
| `GET` | `/api/reports/call/by-date` | ReportsView |
| `GET` | `/api/reports/call/by-month` | ReportsView |
| `GET` | `/api/reports/lead/all-leads` | ReportsView |
| `GET` | `/api/reports/lead/last-contact` | ReportsView |
| `GET` | `/api/reports/lead/summary` | ReportsView |
| `GET` | `/api/reports/lead/cancelled-reasons` | ReportsView |
| `GET` | `/api/reports/sold/by-property` | ReportsView |
| `GET` | `/api/reports/sold/by-area` | ReportsView |
| `GET` | `/api/reports/sold/by-unit-type` | ReportsView |
| `GET` | `/api/reports/visit/all-visits` | ReportsView |
| `GET` | `/api/reports/visit/property-count` | ReportsView |
| `GET` | `/api/reports/customer/converted-not-sold` | ReportsView |
| `GET` | `/api/reports/property/all-properties` | ReportsView |
| `GET` | `/api/reports/property/on-hold` | ReportsView |
| `GET` | `/api/reports/property/availability-summary` | ReportsView |

### Public Data (No Auth)

| Method | Endpoint | Used By |
|---|---|---|
| `GET` | `/public/classification-tree` | InventoryList, MobileInventoryEdit, AddInventory |
| `GET` | `/public/geo/states` | InventoryList, MobileInventoryList, AddInventory |

### Agent Portal API (Website)

| Method | Endpoint | Used By |
|---|---|---|
| `POST` | `/agent/login-otp` | AgentLogin |
| `POST` | `/agent/verify-otp` | AgentLogin |

### Tasks & Projects

| Method | Endpoint | Used By |
|---|---|---|
| `GET/POST/PATCH/DELETE` | `/api/tasks/*` | TaskBoard |
| `GET/POST/PATCH/DELETE` | `/api/projects/*` | TaskBoard |

### Workflows (Automation)

| Method | Endpoint | Used By |
|---|---|---|
| `GET/POST/PATCH/DELETE` | `/api/workflows/*` | WorkflowBuilder |

---

## Summary Statistics

| Application | Pages/Views | Total Lines of Code |
|---|---|---|
| Admin Dashboard (desktop views) | 19 views + 2 auth pages | ~11,857 lines (components) |
| Dashboard Sub-Tabs | 5 tabs | 1,194 lines |
| Mobile Components | 9 components | 1,730 lines |
| Public Website | 30 pages | 7,730 lines |
| Agent Portal | 6 pages + layout | 690 lines |
| **Total** | **~71 distinct pages/views** | **~23,201 lines** |
