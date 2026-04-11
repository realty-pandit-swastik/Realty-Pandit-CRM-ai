# Frontend Components Reference -- Reality Pandit

This document provides a comprehensive reference for every frontend component across both the **Admin Dashboard** (`agents/frontend/`) and **Public Website** (`agents/website/`). Each entry includes the file path, line count, key props/interfaces, and a description of what the component renders.

**Total component files:** 77 files across both applications
- Admin Dashboard: 41 component files (~16,278 lines)
- Public Website: 36 component files (~4,701 lines)

---

## Table of Contents

1. [Admin Dashboard Components (agents/frontend/)](#1-admin-dashboard-components-agentsfrontend)
   - [Layout & Navigation](#layout--navigation)
   - [Authentication](#authentication)
   - [Dashboard & Analytics](#dashboard--analytics)
   - [Communication](#communication)
   - [Property Management](#property-management)
   - [Team & Partners](#team--partners)
   - [AI Monitoring & Override](#ai-monitoring--override)
   - [Automation & Workflows](#automation--workflows)
   - [Reports & Notifications](#reports--notifications)
   - [Special Components](#special-components)
   - [Mobile Components](#mobile-components-9-files)
   - [Context Providers](#context-providers)
   - [Custom Hooks](#custom-hooks)
   - [API Client](#api-client)
2. [Public Website Components (agents/website/)](#2-public-website-components-agentswebsite)
   - [Layout](#layout)
   - [Homepage](#homepage)
   - [Home Sub-components](#home-sub-components)
   - [AI Chat System](#ai-chat-system-5-files)
   - [Forms & Lead Capture](#forms--lead-capture)
   - [UI Library (Shadcn-style)](#ui-library-shadcn-style-10-files)
   - [SEO](#seo)
   - [Workflow (Property Posting)](#workflow-property-posting-3-files)
   - [Authentication](#authentication-1)

---

## 1. Admin Dashboard Components (agents/frontend/)

The admin dashboard is a React + Vite SPA with inline CSS styling (no Tailwind in the main shell), JWT-based auth, role-based access control, and a dark/light theme system. Navigation uses CSS custom properties (`var(--bg-primary)`, `var(--text-primary)`, etc.) for theming.

---

### Layout & Navigation

#### DashboardLayout.tsx
- **Path:** `agents/frontend/src/components/DashboardLayout.tsx`
- **Lines:** 236
- **Props:** `{ activeView: string; onViewChange: (view: string) => void; children: ReactNode }`
- **Imports:** `useAuth`, `useTheme`, `useIsMobile`
- **Description:** The root layout shell for the entire admin dashboard. Renders a collapsible sidebar on desktop (220px expanded, 60px collapsed) and a hamburger-triggered overlay drawer on mobile (280px). Contains **19 navigation items** organized by permission:
  - **No permission required:** Dashboard, Chats, Calendar, Emails, Call Log, Tasks
  - **`view_inventory`:** Inventory, Property Map, Live Status
  - **`view_all_leads`:** Ext. Leads
  - **`manage_agents`:** Partner Agents, Team
  - **`view_reports`:** Reports, AI Agents, Agent Logs, Override, Workflows, Marketing, Analytics
- Also renders: brand header ("Realty Pandit"), theme toggle button (dark/light), user info section with role badge (color-coded: super_boss=red, manager=amber, employee=green), phone number, and logout button. Mobile top bar includes hamburger menu and theme toggle.

#### MobileLayout.tsx
- **Path:** `agents/frontend/src/components/mobile/MobileLayout.tsx`
- **Lines:** 240
- **Props:** `{ activeView: string; onViewChange: (view: string) => void; children: ReactNode }`
- **Description:** An alternative mobile-optimized layout with a fixed bottom navigation bar instead of a sidebar. Provides quick-access icons for the most common views (Dashboard, Contacts, Inventory, Calendar, Settings) at the bottom of the screen. Includes a top header bar with the brand name and a more-menu for accessing additional views.

---

### Authentication

#### LoginPage.tsx
- **Path:** `agents/frontend/src/components/LoginPage.tsx`
- **Lines:** 548
- **Props:** None (standalone page)
- **Imports:** `useAuth`
- **Description:** Full-screen JWT login page with a dark real-estate-themed design. Contains two modes:
  - **Login mode:** Phone number + password form. On successful login, triggers a `SkylineOverlay` SVG animation (animated city buildings with illuminated windows, stars, loading dots) for 2.4 seconds before transitioning to the dashboard.
  - **Forgot Password mode:** 3-step flow -- (1) enter WhatsApp phone number, (2) enter 6-digit OTP + new password with 60-second resend countdown, (3) success message with auto-redirect to login after 3 seconds.
- Features: Decorative background grid, floating particles, card exit animation on login, responsive sizing (420px desktop, full-width mobile).
- **Sub-component:** `SkylineOverlay` -- inline SVG component that renders 12 animated building silhouettes with window lights as a login transition effect.

#### SetupPasswordPage.tsx
- **Path:** `agents/frontend/src/components/SetupPasswordPage.tsx`
- **Lines:** 198
- **Props:** None (reads `token` from URL query params)
- **Imports:** `validateSetupToken`, `setupPassword` from API client
- **Description:** First-time password setup page for new team members. Validates the setup token from the URL, then shows a form with pre-filled read-only name and email fields plus password/confirm-password inputs. 4 states: loading (validating token), form, success (with "Go to Login" button), and error (with admin contact message). Minimum password length: 6 characters.

---

### Dashboard & Analytics

#### DashboardTabs.tsx
- **Path:** `agents/frontend/src/components/DashboardTabs.tsx`
- **Lines:** 88
- **Props:** None
- **Description:** A 5-tab horizontal tab switcher that renders the appropriate dashboard sub-component. Tabs: Main Dashboard, Market Trends, User Performance, Lead Sources, Property Analytics. Each tab has an icon and label. Active tab is highlighted with a bottom border accent. Content area is scrollable.

#### MainDashboard.tsx
- **Path:** `agents/frontend/src/components/dashboard/MainDashboard.tsx`
- **Lines:** 274
- **Props:** None
- **Description:** Primary KPI dashboard displaying:
  - Summary stat cards (total leads, active leads, conversions, revenue)
  - Lead trend line chart (30-day) using Recharts
  - Revenue bar chart
  - Recent activity feed
  - Conversion funnel visualization
- Fetches data from `/api/analytics/dashboard` endpoint.

#### MarketTrendsDashboard.tsx
- **Path:** `agents/frontend/src/components/dashboard/MarketTrendsDashboard.tsx`
- **Lines:** 192
- **Props:** None
- **Description:** Historical market data visualization with price trends, demand patterns, and seasonal analysis. Renders area and line charts showing property market trends over configurable time periods. Includes forecast indicators.

#### UserPerformanceDashboard.tsx
- **Path:** `agents/frontend/src/components/dashboard/UserPerformanceDashboard.tsx`
- **Lines:** 251
- **Props:** None
- **Description:** Agent leaderboard and performance comparison dashboard. Renders:
  - Agent ranking table sorted by performance metrics
  - Bar charts comparing leads handled, conversions, and revenue per agent
  - Individual performance cards with medal icons (gold/silver/bronze)
  - Conversion rate calculations per agent

#### LeadSourcesDashboard.tsx
- **Path:** `agents/frontend/src/components/dashboard/LeadSourcesDashboard.tsx`
- **Lines:** 253
- **Props:** None
- **Description:** Lead source attribution and ROI analysis. Renders pie charts for leads and revenue distribution by source (99Acres, MagicBricks, Facebook Ads, Google Ads, Referrals, Walk-ins). Includes a performance table with lead counts, revenue, ROI multiplier, and average deal size per source.

#### PropertyAnalyticsDashboard.tsx
- **Path:** `agents/frontend/src/components/dashboard/PropertyAnalyticsDashboard.tsx`
- **Lines:** 224
- **Props:** None
- **Description:** Property-specific analytics including views, inquiries, and sold counts broken down by property type (Apartment, Villa, Plot, Commercial). Renders comparative bar charts and summary cards with property performance metrics.

#### AdvancedAnalytics.tsx
- **Path:** `agents/frontend/src/components/AdvancedAnalytics.tsx`
- **Lines:** 614
- **Props:** None
- **Imports:** Recharts (LineChart, BarChart, PieChart, AreaChart), lucide-react icons, `useAuth`
- **Description:** Comprehensive analytics dashboard with 5 sub-tabs:
  1. **Overview:** 4 KPI cards (Total Leads, Conversion Rate, Total Revenue, Avg ROI), 30-day lead trend area chart, hourly activity heatmap bar chart
  2. **Trends & Forecasts:** Revenue trend line chart, predictive forecast card (next month leads/revenue/confidence from linear regression), conversion rate area chart
  3. **Conversion Funnel:** Visual funnel with 7 stages (Leads -> Qualified -> Matched -> Visit Scheduled -> Visited -> Negotiation -> Closed Won), horizontal bar chart, drop-off percentages between stages
  4. **Lead Sources:** Performance table (source, leads, revenue, ROI, avg deal size), dual pie charts for leads and revenue distribution
  5. **Agent Performance:** Multi-axis bar chart (leads + conversions on left Y, revenue on right Y), individual agent score cards
- Supports 5 date ranges: 7d, 30d, 90d, YTD, Custom (date pickers). Includes Refresh and Export buttons. Falls back to mock data if API fails. Currency formatted in INR (Cr/Lakh).

---

### Communication

#### ContactList.tsx
- **Path:** `agents/frontend/src/components/ContactList.tsx`
- **Lines:** 169
- **Props:** `{ contacts: Contact[]; selectedPhone: string | null; onSelect: (phone: string) => void }`
- **Interfaces:** `Contact` (phone_number, name, lead_status, contact_type, updated_at, lead_score with total/intent/engagement/reliability)
- **Description:** A 300px-wide sidebar component for the chat view. Displays a searchable, scrollable list of contacts. Each contact row shows:
  - Name (or phone if no name), relative date (Today/Yesterday/date)
  - Phone number (if name is shown)
  - Color-coded type badge: Buyer (blue), Seller (green), Partner (purple), Mgmt (orange), Unknown (gray)
  - Lead score badge: HOT (>=70, red with fire emoji), WARM (>=40, green), COLD (<40, blue with snowflake)
  - Lead status text
- Header shows total contact count and hot lead count. Search filters by name or phone number. Selected contact gets blue left border accent.

#### ChatView.tsx
- **Path:** `agents/frontend/src/components/ChatView.tsx`
- **Lines:** 168
- **Props:** `{ contact: Contact; interactions: Interaction[]; onReportNoShow: () => void; onUpdateContactType?: (phone: string, type: string) => void }`
- **Interfaces:** `Interaction` (id, direction, content, created_at, channel)
- **Description:** Conversation view for a selected contact. Renders:
  - **Header:** Contact name, editable contact type dropdown (Unknown/Buyer-Tenant/Seller-Landlord/Partner Agent/Management), phone number, lead score breakdown (total, intent, engagement, reliability, no-show count), and a "No-Show" button (reduces reliability score by 20).
  - **Message area:** Chat-bubble layout with date separators (Today/Yesterday/full date). Outbound messages align right with rounded corners (16px 4px 16px 16px), inbound left (4px 16px 16px 16px). Each bubble shows content, channel icon (WhatsApp/email/phone/SMS/website/admin), and timestamp.

#### CallLog.tsx
- **Path:** `agents/frontend/src/components/CallLog.tsx`
- **Lines:** 488
- **Props:** None
- **Imports:** lucide-react (Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Play, Pause, Download, etc.), `useAuth`
- **Description:** Full call history management with:
  - **Stats bar:** 6 cards (Total, Answered, Missed, Incoming, Outgoing, Total Duration)
  - **Filters panel:** Search (phone/name/transcript), status dropdown (All/Answered/Missed/Failed), direction dropdown (All/Incoming/Outgoing), date range (from/to)
  - **Call list:** Each call entry shows direction icon (color-coded), contact name/phone, status badge, date, duration, and expandable sections for:
    - **AI Summary:** Blue highlight box with AI-generated call summary
    - **Audio Playback:** Play/pause button, seek slider with current/total time, download button. Uses `HTMLAudioElement` for playback.
    - **Transcript:** Collapsible transcript text
  - Requires `view_reports` permission. Fetches from `/api/calls/voice-log/all`.

#### EmailManagement.tsx
- **Path:** `agents/frontend/src/components/EmailManagement.tsx`
- **Lines:** 805
- **Props:** None
- **Imports:** `useAuth`, API `client`
- **Description:** Complete email management system powered by Panditji AI. Features:
  - **Inbox tabs:** All / Inbox (inbound) / Sent (outbound) with paginated list (20 per page)
  - **Search:** Full-text search across sender, recipient, subject, content
  - **Email list:** Cards showing direction badge (IN/OUT), status badge (SENT/DELIVERED/FAILED/PENDING with color), AI processed indicator, subject, from/to, linked contact, body preview (200 chars), delete button (manager+ only)
  - **Compose Modal:** To, Subject, Message fields + "Generate content with Panditji AI" checkbox
  - **Bulk Send Modal:** Textarea for multiple recipients (one per line), Subject, Message, AI generation toggle. Requires `manage_agents` permission.
  - **Email Detail Modal:** Full email view with from/to/date metadata, full body, and AI analysis section if processed.

---

### Property Management

#### InventoryList.tsx
- **Path:** `agents/frontend/src/components/InventoryList.tsx`
- **Lines:** 967
- **Props:** None
- **Imports:** `useAuth`, `AddInventory`, `GooglePlacesInput`, multiple API functions
- **Description:** The primary property listing and management table. A feature-rich component with:
  - **Filters:** Intent (sell/rent/lease), State dropdown, Property type, Status (active/sold/rented/hold/withdrawn), Assigned agent, Free-text search. Filters trigger API calls with pagination.
  - **Property table:** Columns for Property ID, Type+Category, Location (locality/city/state), Price (formatted in Cr/Lakh/monthly), Status badge (color-coded), Specs (BHK/bath/area), Agent, Actions (Edit/Delete/Status change).
  - **Inline Edit Mode:** Clicking edit opens inline form fields for all property attributes including Google Places autocomplete for address, price, specs, status, media URLs, and agent assignment.
  - **Add Property:** Toggles to the `AddInventory` workflow wizard.
  - **Pagination:** Previous/Next buttons with page X of Y indicator, 20 items per page.
  - Requires `view_inventory` permission for viewing, `manage_inventory` for CRUD.

#### AddInventory.tsx
- **Path:** `agents/frontend/src/components/AddInventory.tsx`
- **Lines:** 988
- **Props:** `{ onBack: () => void; onCreated: () => void }`
- **Imports:** `useWorkflow` hook, `GooglePlacesInput`, `getStates`
- **Description:** Multi-step wizard for creating new property listings. Uses the `useWorkflow` hook to drive a dynamic step-by-step form sourced from the backend workflow definition API. Each step can render:
  - Single/multi-select option grids with icons
  - Text inputs with validation
  - Number inputs with min/max constraints
  - Google Places address autocomplete with locality/district/state/pincode parsing
  - Photo upload with drag-and-drop and preview thumbnails
  - Video upload
  - Document upload with document type classification
  - Price input with INR formatting
- Shows group-based progress indicator. On completion, displays confirmation with inventory ID and "Back to Inventory" or "Add Another" options. Cleans up workflow state on unmount.

#### GooglePlacesInput.tsx
- **Path:** `agents/frontend/src/components/GooglePlacesInput.tsx`
- **Lines:** 155
- **Props:** `{ value: string; onChange: (value: string) => void; onPlaceSelect: (place: PlaceResult) => void; placeholder?: string; style?: CSSProperties }`
- **Exports:** `PlaceResult` interface `{ locality, district, state, pincode, full_address, country }`
- **Description:** Google Places Autocomplete wrapper. Loads the Google Maps JavaScript API script once globally, then initializes `google.maps.places.Autocomplete` on the input field restricted to Indian addresses. Parses the selected place's address components to extract locality, district, state, pincode, and full address. Handles script loading race conditions with a callback queue.

#### PropertyMapView.tsx
- **Path:** `agents/frontend/src/components/PropertyMapView.tsx`
- **Lines:** 621
- **Props:** None
- **Imports:** `@react-google-maps/api` (GoogleMap, Marker, InfoWindow, MarkerClusterer), `getInventory`
- **Description:** Interactive Google Maps view of all geocoded properties. Features:
  - **Filter sidebar** (280px, toggleable): Intent, Property Type, Status, Price Range (min/max), Location search. Reset button and color legend (green=Available, red=Sold/Rented, yellow=On Hold, gray=Withdrawn).
  - **Map:** Centered on Delhi (28.6139, 77.2090) by default, auto-zooms to fit all markers via `LatLngBounds`. Uses `MarkerClusterer` for grouping nearby markers. Each marker is a colored circle (status-based fill color).
  - **InfoWindow popup:** Property photo (if available), type + intent header, locality/city, formatted price, BHK/area specs, status badge.
  - Loads all properties at once (limit: 1000), filters for those with lat/lng coordinates.

#### PropertyLiveStatus.tsx
- **Path:** `agents/frontend/src/components/PropertyLiveStatus.tsx`
- **Lines:** 420
- **Props:** None
- **Imports:** `getInventory`, `updateInventory`, `useAuth`
- **Description:** Real-time unit availability grid board. Shows all properties as clickable tiles in a responsive grid (auto-fill, min 140px). Each tile is color-coded by status:
  - **Available:** Green border/bg
  - **Sold:** Red border/bg
  - **Rented:** Amber border/bg
  - **Withdrawn:** Gray border/bg
  - **On Hold:** Blue border/bg
- **Stats bar:** Shows count per status with colored indicator dots.
- **Filters:** Status dropdown, location text search, group-by selector (All / Location / Floor).
- **Detail modal:** Shows flat number, locality, price (INR Cr/Lakh format), specs (BHK/bath/area), and status-change buttons (requires `manage_inventory` permission).

---

### Team & Partners

#### TeamManagement.tsx
- **Path:** `agents/frontend/src/components/TeamManagement.tsx`
- **Lines:** 477
- **Props:** None
- **Imports:** `useAuth`, API client functions (`setMemberPassword`, `resendSetupLink`)
- **Description:** Employee directory and team management. Features:
  - **Team table:** Columns for Member (name + email), Phone, Role badge (color-coded), Department badge (Property Sales=blue, Operations=purple, Management=amber, Software Sales=cyan), Status indicator (green dot=active, amber=inactive), Last Login date, Actions.
  - **Actions per member:** Edit, Reset Password, Set Password, Resend Setup Link, Deactivate/Reactivate (requires `manage_settings`).
  - **Add Member form:** Name, Phone (10 digits), Department dropdown, Role dropdown (employee by default; managers and super_boss roles available to super_boss only), optional custom password toggle. Email is auto-generated from name (live preview via API).
  - **Credentials modal:** Shows generated email + temp password + IMAP/SMTP details after creation.
  - **Set Password modal:** Enter or auto-generate a 10-char random password. Shows success with copy-to-clipboard.
  - **Warning banner:** Highlights count of members without phone numbers (can't use WhatsApp or OTP reset).
  - Requires `create_agents` to add, `manage_team` for actions.

#### PartnerManagement.tsx
- **Path:** `agents/frontend/src/components/PartnerManagement.tsx`
- **Lines:** 308
- **Props:** None
- **Imports:** API functions (`getPartners`, `verifyPartner`, `updatePartnerStatus`, `updatePartnerCommission`, `createPartner`), `useAuth`
- **Description:** Partner agent network management. Features:
  - **Partner table:** Columns for Name/Agency, Phone, Type badge (HAS_PROPERTIES=blue, HAS_BUYERS=purple, BOTH=cyan), Package (FREE/PRO/ADVANCE_PRO), Status (active=green, other=red), Verified status, Actions.
  - **Actions:** Verify (for unverified), Suspend/Activate toggle, Edit commission rate (prompt dialog, 0-100%).
  - **Registration form:** Phone, Full Name, Agency Name, Partner Type dropdown, Package Type dropdown, Commission Rate input.
  - Requires `manage_agents` permission.

---

### AI Monitoring & Override

#### AgentLogs.tsx
- **Path:** `agents/frontend/src/components/AgentLogs.tsx`
- **Lines:** 481
- **Props:** None
- **Imports:** `getAgentLogs`, `getQALogs`
- **Description:** Activity audit trail for AI agents. Two-tab view:
  - **Actions tab:** Paginated table (25 per page) of AI action logs with columns: Agent Name, Task Type, Phone, Input Summary, Output Summary, Quality Score, Duration (ms), Status (color-coded: success=green, failed=red, escalated=amber), Timestamp.
  - **QA tab:** Quality assurance logs showing interaction reviews with quality scores, issues, sentiment analysis (positive=green, neutral=amber, negative=red, frustrated=dark red), flagged status, reviewer.

#### AgentOverride.tsx
- **Path:** `agents/frontend/src/components/AgentOverride.tsx`
- **Lines:** 357
- **Props:** None
- **Imports:** `getQALogs`, `reviewQALog`, `toggleQAFlag`, `getWinningTemplates`
- **Description:** Admin override controls for AI quality management. Two-tab view:
  - **Flagged tab:** Lists QA logs that have been flagged for review. Each entry shows agent name, phone, quality score, sentiment, and issues. Actions: Mark as reviewed, toggle flag status.
  - **Templates tab:** Shows winning AI response templates (high-scoring interactions) that can be used as training examples. Filter by agent name. Displays input/output summaries with quality scores.

#### QADashboard.tsx
- **Path:** `agents/frontend/src/components/QADashboard.tsx`
- **Lines:** 317
- **Props:** None
- **Imports:** `getAgentDashboardHealth`
- **Interfaces:** `SystemHealth` with `AgentMetric[]`, conversion funnel, quality summary, security summary, campaign summary
- **Description:** AI system health and quality monitoring dashboard. Renders:
  - **System metrics:** Uptime, total contacts, today's interactions, active properties, active sessions
  - **Agent metrics table:** Per-agent stats (total actions, success/fail/escalated counts, error rate, avg duration, quality score)
  - **Conversion funnel:** Visual funnel with 8 stages (NEW -> QUALIFIED -> MATCHED -> VISIT_SCHEDULED -> VISITED -> NEGOTIATION -> CLOSED_WON -> CLOSED_LOST)
  - **Quality summary:** Avg score, total checks, flagged count, sentiment breakdown
  - **Security summary:** Total events, high severity, critical severity
  - **Campaign summary:** Total campaigns, total sent, active campaigns

---

### Automation & Workflows

#### WorkflowBuilder.tsx
- **Path:** `agents/frontend/src/components/WorkflowBuilder.tsx`
- **Lines:** 821
- **Props:** None
- **Imports:** lucide-react icons, `useAuth`
- **Description:** Visual workflow automation builder for creating Panditji AI automation rules. Features:
  - **Workflow list:** Shows all workflows with name, trigger type, status toggle (enabled/disabled), execution count, and actions (edit/delete/test).
  - **Workflow editor:** Form to define automation rules with:
    - **Triggers:** LEAD_CREATED, STATUS_CHANGED, APPOINTMENT_CREATED, PROPERTY_MATCHED, INBOUND_MESSAGE, MISSED_CALL, SCORE_THRESHOLD, LEAD_STALE, PROPERTY_INQUIRY, PARTNER_INQUIRY
    - **Conditions:** Field + operator (equals/not_equals/contains/greater_than/less_than/in/not_in) + value. Add/remove multiple conditions.
    - **Actions:** ASSIGN_AGENT, SEND_WHATSAPP, SEND_EMAIL, CREATE_TASK, UPDATE_STATUS, SEND_VOICE_CALL, UPDATE_FIELD. Each action has typed parameter inputs.
    - **Settings:** Delay (minutes), priority, max executions per day, enable/disable toggle.
  - **Test execution panel:** View recent workflow executions with trigger data, status, error messages, action logs, and duration.

#### MarketingCampaign.tsx
- **Path:** `agents/frontend/src/components/MarketingCampaign.tsx`
- **Lines:** 904
- **Props:** None
- **Imports:** lucide-react, `useAuth`
- **Description:** Multi-channel marketing campaign builder and analytics. Features:
  - **Template management:** Create/edit reusable templates with name, channel (WhatsApp/Email/SMS/Voice), category (welcome/followup/promotional/reminder/transactional/event/feedback), subject, body with variable substitution, and performance stats (avg score, times used).
  - **Campaign builder:** Name, type (Broadcast/Drip/Launch Promo/Follow-up), channel, template selection, audience segmentation (filter by lead status, source, score range, location), message editor, subject line, scheduling (immediate or future date), recurrence rule, A/B test configuration.
  - **Campaign list:** Table with name, channel, type, status, sent/delivered/responded/failed counts, scheduled date, and actions (send/clone/delete).
  - **Analytics:** Per-campaign delivery and engagement metrics.

#### TaskBoard.tsx
- **Path:** `agents/frontend/src/components/TaskBoard.tsx`
- **Lines:** 871
- **Props:** None
- **Imports:** lucide-react (Calendar, List, LayoutGrid, Plus, X, Save), `useAuth`
- **Description:** Task and project management with 3 view modes:
  - **Kanban view:** Drag-and-drop columns for TODO, IN_PROGRESS, DONE, BLOCKED. Tasks are cards showing title, priority badge (LOW=gray, MEDIUM=yellow, HIGH=orange, URGENT=red), assigned agent, due date, tags.
  - **List view:** Filterable table view of all tasks with sorting.
  - **Calendar view:** Tasks displayed on a calendar grid by due date.
- **Project management:** Create/manage projects with name, description, status, start/end dates, task count. Tasks belong to projects.
- **Task creation form:** Title, description, project, assignee, due date, priority, linked contact phone, linked property ID, tags.
- Fetches from `/api/tasks` and `/api/projects` endpoints.

---

### Reports & Notifications

#### ReportsView.tsx
- **Path:** `agents/frontend/src/components/ReportsView.tsx`
- **Lines:** 823
- **Props:** None
- **Imports:** API functions, export utilities (`exportToCSV`, `exportToExcel`, `exportToPDF`)
- **Description:** Comprehensive reporting system with **8 categories and 26+ report types**:
  1. **Account Reports (4):** Customer Outstanding, Vendor Outstanding, Monthly Sales by Customer, Monthly Purchase by Vendor
  2. **User Reports (2):** User Performance, User Task Completion
  3. **Call Reports (3):** All Call Logs, Date Wise Call Log, Month Wise Call Summary
  4. **Lead Reports (4):** All Leads, Lead Last Contact Date, Lead Overall Summary, Lead Cancelled Reason Analysis
  5. **Sold Reports (3):** Sold By Property, Sold By Area, Sold By Unit Type
  6. **Visit Reports (2):** All Site Visits, Property Visit Count
  7. **Inventory Reports:** Property listings by status, type, location
  8. **Campaign Reports:** Campaign performance and engagement
- Each report supports configurable filters (date range, status, source, type), data table display, and multi-format export (CSV, Excel, PDF).

#### NotificationSettings.tsx
- **Path:** `agents/frontend/src/components/NotificationSettings.tsx`
- **Lines:** 522
- **Props:** None
- **Imports:** lucide-react (Bell, Save, Clock, Phone, MessageSquare, Mail, Volume2), `useAuth`
- **Description:** User notification preferences panel. Configurable settings include:
  - **Channels:** WhatsApp, Email, Voice, SMS toggles
  - **Event types:** New lead, Appointment reminder, Task due, Property match, Message received, Call missed toggles
  - **Timing:** Quiet hours (start/end time), Daily digest (enable + time)
  - **Frequency:** Instant vs. batched notifications (configurable interval in minutes)
  - **Sound:** Notification sound and vibration toggles
- Saves/loads preferences via API. Shows save confirmation.

---

### Special Components

#### VoiceCommands.tsx
- **Path:** `agents/frontend/src/components/VoiceCommands.tsx`
- **Lines:** 407
- **Props:** `{ onNavigate: (view: string) => void; currentView: string }`
- **Description:** Hands-free voice control widget using the Web Speech API (`SpeechRecognition` + `SpeechSynthesis`). Features:
  - **17 voice command patterns** mapped to navigation views (e.g., "show dashboard", "open chats", "inventory", "call log", "workflows").
  - Floating widget that can be toggled on/off.
  - Continuous listening mode option.
  - Visual feedback: transcript display, command match confirmation, voice volume indicator.
  - Audio feedback via speech synthesis ("Navigating to Dashboard").
  - Help overlay listing all available commands.
  - Graceful fallback if browser doesn't support Web Speech API.

#### ExternalLeads.tsx
- **Path:** `agents/frontend/src/components/ExternalLeads.tsx`
- **Lines:** 153
- **Props:** None
- **Imports:** API `client`
- **Description:** External lead intake dashboard showing leads from third-party sources. Renders:
  - **Source breakdown:** Cards for each lead source (99acres=red, MagicBricks=amber, Housing.com=blue, Website=green, WhatsApp=green, Voice=purple, Manual=gray) with lead count and latest timestamp.
  - **Recent leads table:** Latest external leads with source, contact info, and entry date.
  - Fetches from `/api/leads/by-source` and `/api/leads/recent-external`.

#### CalendarView.tsx
- **Path:** `agents/frontend/src/components/CalendarView.tsx`
- **Lines:** 448
- **Props:** None
- **Imports:** API functions (`getAppointments`, `getCalendarSummary`, `updateAppointment`, `cancelAppointment`)
- **Interfaces:** `Appointment` (id, title, description, type, scheduled_at, duration, status, contact, property, assigned_to_agent, location), `Summary` (today, this_week, pending)
- **Description:** Appointment management calendar. Features:
  - **Summary cards:** Today's appointments, this week total, pending count.
  - **Filters:** Status (all/scheduled/completed/cancelled/no-show), Type (all/site-visit/call/meeting).
  - **Appointment list:** Cards showing title, type badge, scheduled date/time, duration, contact info (name/phone/email), linked property (location/type/price), assigned agent, status.
  - **Actions:** Mark as completed, cancel appointment.

---

### Mobile Components (9 files)

All mobile components are in `agents/frontend/src/components/mobile/` and are optimized for touch interaction with larger tap targets and simplified layouts.

#### MobileLayout.tsx
- **Path:** `agents/frontend/src/components/mobile/MobileLayout.tsx`
- **Lines:** 240
- **Description:** Mobile app shell with fixed bottom navigation bar (5 main views), top header bar with brand and menu, and a slide-out drawer for additional navigation items.

#### MobileDashboard.tsx
- **Path:** `agents/frontend/src/components/mobile/MobileDashboard.tsx`
- **Lines:** 116
- **Description:** Simplified mobile dashboard with stacked KPI cards and compact chart views optimized for small screens.

#### MobileContactList.tsx
- **Path:** `agents/frontend/src/components/mobile/MobileContactList.tsx`
- **Lines:** 139
- **Description:** Full-screen contact list for mobile with larger touch targets, search bar at top, and swipe-to-action support.

#### MobileChatView.tsx
- **Path:** `agents/frontend/src/components/mobile/MobileChatView.tsx`
- **Lines:** 117
- **Description:** Mobile-optimized chat view with full-screen message area, compact header, and bottom-pinned input area.

#### MobileInventoryList.tsx
- **Path:** `agents/frontend/src/components/mobile/MobileInventoryList.tsx`
- **Lines:** 291
- **Description:** Property listing in card format for mobile. Each property shows as a stacked card with image, price, location, and specs. Includes pull-to-refresh and infinite scroll patterns.

#### MobileInventoryEdit.tsx
- **Path:** `agents/frontend/src/components/mobile/MobileInventoryEdit.tsx`
- **Lines:** 380
- **Description:** Mobile property editing form with vertically stacked fields, full-width inputs, and a bottom-fixed save button.

#### MobileTeamView.tsx
- **Path:** `agents/frontend/src/components/mobile/MobileTeamView.tsx`
- **Lines:** 179
- **Description:** Team member cards displayed in a vertical list format. Each card shows member name, role badge, department, status, and action buttons.

#### MobileCalendar.tsx
- **Path:** `agents/frontend/src/components/mobile/MobileCalendar.tsx`
- **Lines:** 146
- **Description:** Simplified calendar view for mobile with day-by-day appointment list and swipe navigation between dates.

#### MobileSettings.tsx
- **Path:** `agents/frontend/src/components/mobile/MobileSettings.tsx`
- **Lines:** 122
- **Description:** Mobile settings screen with grouped toggle switches for notifications, theme, and account options.

---

### Context Providers

#### AuthContext.tsx
- **Path:** `agents/frontend/src/contexts/AuthContext.tsx`
- **Lines:** 101
- **Exports:** `AuthProvider`, `useAuth`
- **Interface:** `Agent` { id, name, email, role, phone, status, tenant_id, permissions[], reports_to, subordinates[] }
- **Interface:** `AuthContextType` { agent, token, loading, login(), setup(), logout(), hasPermission() }
- **Description:** JWT authentication context with RBAC permissions matrix. Manages:
  - Token storage in `localStorage` (both access token and refresh token)
  - Axios default Authorization header injection
  - `fetchMe()` on init to validate token and load agent profile
  - `login(phone, password)` -- calls `/auth/login`, stores tokens, loads profile
  - `setup(name, email, password)` -- for first-time setup flow
  - `logout()` -- clears tokens and Axios header
  - `hasPermission(permission)` -- checks against agent's permissions array
  - Role hierarchy: `super_boss` > `manager` > `employee`

#### ThemeContext.tsx
- **Path:** `agents/frontend/src/contexts/ThemeContext.tsx`
- **Lines:** 41
- **Exports:** `ThemeProvider`, `useTheme`
- **Description:** Dark/light theme toggle context. Reads initial preference from: (1) `localStorage` key `rp-theme`, (2) system `prefers-color-scheme`, defaulting to dark. Adds/removes `dark` class on `document.documentElement`. Persists preference to `localStorage`. Shared key (`rp-theme`) enables consistency with the public website.

---

### Custom Hooks

#### useIsMobile.ts
- **Path:** `agents/frontend/src/hooks/useIsMobile.ts`
- **Lines:** 16
- **Signature:** `useIsMobile(breakpoint = 768): boolean`
- **Description:** Responsive breakpoint detection hook. Returns `true` when `window.innerWidth < breakpoint`. Listens for `resize` events and updates reactively. Default breakpoint is 768px.

#### useWorkflow.ts
- **Path:** `agents/frontend/src/hooks/useWorkflow.ts`
- **Lines:** 306
- **Exports:** `useWorkflow`, `WorkflowStep`, `WorkflowGroup`, `StepOption`, `DocType`
- **Description:** Comprehensive workflow state machine for the multi-step property creation wizard. Manages:
  - Fetching workflow definition from API (`getWorkflowDefinition`)
  - Step-by-step navigation (next/previous via API calls)
  - Step validation (via API)
  - Answer accumulation across steps
  - Step history tracking for back navigation
  - Group-based progress tracking
  - Media upload handlers (photos, videos, documents)
  - Summary generation and final commit (`commitWorkflow`)
  - Loading/error/submitting states
  - Reset function for cleanup

---

### API Client

#### api/client.ts
- **Path:** `agents/frontend/src/api/client.ts`
- **Lines:** 510
- **Description:** Axios-based API client configured with the base URL from `VITE_API_BASE_URL` (defaults to `http://localhost:7071`). Auto-sets JWT Authorization header from `localStorage` on initialization. Exports 40+ named functions:
  - **Contacts:** `getContacts`, `getInteractions`
  - **Inventory:** `getInventory`, `createInventory`, `updateInventory`, `deleteInventory`, `getInventoryItem`
  - **Classification:** `getCategoryTree`, `getStates`
  - **Team:** Team member CRUD, `setMemberPassword`, `resendSetupLink`
  - **Partners:** `getPartners`, `verifyPartner`, `updatePartnerStatus`, `updatePartnerCommission`, `createPartner`
  - **Appointments:** `getAppointments`, `getCalendarSummary`, `updateAppointment`, `cancelAppointment`
  - **Reports:** Various report fetching functions
  - **AI/QA:** `getAgentLogs`, `getQALogs`, `reviewQALog`, `toggleQAFlag`, `getWinningTemplates`, `getAgentDashboardHealth`
  - **Workflow:** `getWorkflowDefinition`, `getWorkflowNextStep`, `getWorkflowPreviousStep`, `validateWorkflowStep`, `getWorkflowSummary`, `commitWorkflow`, `uploadWorkflowMedia`, `uploadWorkflowVideo`, `uploadWorkflowDocument`
  - **Auth:** `validateSetupToken`, `setupPassword`

#### lib/api.ts
- **Path:** `agents/frontend/src/lib/api.ts`
- **Lines:** 86
- **Description:** Supplementary API configuration module. Exports `API_BASE_URL` constant used by components that make direct `fetch` calls instead of using the Axios client (e.g., `AdvancedAnalytics`, `CallLog`, `TaskBoard`, `MarketingCampaign`, `NotificationSettings`).

---

## 2. Public Website Components (agents/website/)

The public website is a **Next.js** application using the App Router (`'use client'` directives), **Tailwind CSS** for styling, **Framer Motion** for animations, and **lucide-react** for icons. It supports dark mode via a theme context. All components are server-side renderable where possible.

---

### Layout

#### Navbar.tsx
- **Path:** `agents/website/src/components/Navbar.tsx`
- **Lines:** 276
- **Props:** None (uses Next.js `usePathname`, `useTheme`)
- **Imports:** `next/link`, `next/image`, `framer-motion`, lucide-react, `useTheme`, `AIChatModal`
- **Description:** Full-featured responsive navigation header. Features:
  - **Desktop:** Horizontal nav links (Home, Properties, Services, About, Blog, Contact) with a Properties dropdown menu showing subcategories (Buy, Rent, Commercial, Plots & Land, All Properties) with descriptions. Theme toggle (sun/moon), Login button, AI Chat button.
  - **Mobile:** Hamburger menu triggering an animated full-screen drawer with larger link items including icons (Home, Login, Post Property, Properties, Buy, Rent, Commercial, Services, About, Blog, Contact). AnimatePresence transitions.
  - Active link highlighting based on current pathname. Scroll-aware sticky positioning.

#### Footer.tsx
- **Path:** `agents/website/src/components/Footer.tsx`
- **Lines:** 261
- **Props:** None
- **Description:** Multi-column site footer with:
  - **4 link sections:** Company (About, Services, Blog, Contact, FAQ, Careers), Properties (Buy, Rent, Commercial, Plots, All), Services (Property Management, Legal Assistance, Home Loans, EMI Calculator, Area Converter)
  - **Contact info:** Phone, email, address with lucide-react icons
  - **Social links:** Facebook, Instagram, YouTube with icons
  - **Brand section:** Logo, tagline, copyright
  - Dark mode aware styling. Hidden on `/dashboard` and `/login` routes.

---

### Homepage

#### Hero.tsx
- **Path:** `agents/website/src/components/Hero.tsx`
- **Lines:** 196
- **Props:** None
- **Imports:** `framer-motion`, `next/navigation`, lucide-react, `AIChatModal`
- **Description:** The main hero banner with an AI-powered property search interface. Features:
  - **Quick filter tabs:** Buy, Rent, Commercial, Plots & Land (with icons)
  - **AI search input:** Free-text search field with typing animation and placeholder suggestions ("I want to buy a 3 BHK flat in Noida", "Looking for office space in Gurgaon", etc.)
  - **Budget options:** Under 50L, 50L-1Cr, 1Cr-2Cr, 2Cr-5Cr, 5Cr+ filter buttons
  - **BHK options:** 1-5+ BHK filter buttons
  - On search submission, opens AIChatModal with the query or navigates to `/properties` with filters.
  - Last search memory with URL persistence.

#### CTASection.tsx
- **Path:** `agents/website/src/components/CTASection.tsx`
- **Lines:** 33
- **Props:** None
- **Description:** Call-to-action section with gradient background (slate-900 -> blue-950 -> slate-900). Shows "Ready to Find Your Perfect Property?" heading, WhatsApp availability badge, descriptive text about Panditji AI assistant, and two CTA buttons: "Talk to Panditji" (blue, links to /contact) and "Browse Properties" (glass-morphism, links to /properties). Background blur circles for decoration.

#### PropertyCard.tsx
- **Path:** `agents/website/src/components/PropertyCard.tsx`
- **Lines:** 76
- **Props:** `{ property: Property; index?: number }`
- **Imports:** `framer-motion`, `next/link`, lucide-react, `formatPrice` and `getMediaUrl` from API
- **Description:** Reusable property listing card. Renders:
  - Property image with hover zoom effect (or placeholder icon)
  - Intent badge (Sale=green, Rent=blue, Lease=purple) in top-left
  - Category badge (residential/commercial) in top-right
  - Price (formatted in Cr/Lakh/monthly)
  - Property type and category
  - Location with MapPin icon
  - Specs bar: BHK, Bathrooms, Area (sqft)
  - Staggered entrance animation (delay based on index)
  - Links to `/properties/{id}` detail page.
  - Dark mode aware.

#### StatsCounter.tsx
- **Path:** `agents/website/src/components/StatsCounter.tsx`
- **Lines:** 55
- **Props:** None
- **Description:** Animated statistics section with 4 counters:
  - Properties Listed: 500+ (blue icon)
  - Locations Served: 50+ (green icon)
  - Happy Clients: 1000+ (purple icon)
  - Deals Closed: 200+ (amber icon)
- Uses `AnimatedNumber` sub-component with `useInView` intersection observer -- numbers count up smoothly when scrolled into viewport (2-second animation at 60fps). Staggered entrance with Framer Motion.

#### FeaturedProperties.tsx
- **Path:** `agents/website/src/components/FeaturedProperties.tsx`
- **Lines:** 69
- **Props:** None
- **Description:** Section displaying featured/premium property listings. Fetches from `getFeaturedProperties()` API. Renders a grid of `PropertyCard` components with a section header and "View All Properties" link. Loading state handled internally.

#### WhatsAppButton.tsx
- **Path:** `agents/website/src/components/WhatsAppButton.tsx`
- **Lines:** 72
- **Props:** None
- **Description:** Floating WhatsApp chat button fixed to the bottom-right corner of the screen (z-50). Features:
  - Green circular button (14x14, WhatsApp brand color #25D366) with pulse animation
  - Tooltip popup (toggled on click): Shows "Panditji" avatar with "Online now" status, greeting message bubble, and "Start Chat on WhatsApp" button linking to `wa.me/918178491914` with default message.
  - AnimatePresence for smooth tooltip transitions.

---

### Home Sub-components

#### home/ServiceTiles.tsx
- **Path:** `agents/website/src/components/home/ServiceTiles.tsx`
- **Lines:** 122
- **Props:** None
- **Description:** Grid of 6 service/tool cards linking to various features:
  - Post Property Free, EMI Calculator, Area Converter, Market Insights, Talk to Panditji (WhatsApp), Legal Help
  - Each tile has an icon, title, description, optional badge (Free/Popular/New/AI), and link. Animated entrance with Framer Motion.

#### home/PropertyCategories.tsx
- **Path:** `agents/website/src/components/home/PropertyCategories.tsx`
- **Lines:** 46
- **Props:** None
- **Description:** Property category navigation grid showing browseable categories (Residential, Commercial, Plots & Land, etc.) with icons and brief descriptions. Links to filtered property listing pages.

#### home/NewProjects.tsx
- **Path:** `agents/website/src/components/home/NewProjects.tsx`
- **Lines:** 169
- **Props:** None
- **Description:** Section showcasing new real estate projects/developments. Fetches new project data from the API and displays them in a card carousel or grid format with project name, developer, location, price range, and images.

#### home/Testimonials.tsx
- **Path:** `agents/website/src/components/home/Testimonials.tsx`
- **Lines:** 70
- **Props:** None
- **Description:** Customer testimonial section with review cards showing customer name, role/context, testimonial text, and star rating. Uses Framer Motion for entrance animations.

#### home/TrustBadges.tsx
- **Path:** `agents/website/src/components/home/TrustBadges.tsx`
- **Lines:** 40
- **Props:** None
- **Description:** Trust indicator section displaying partner logos, certifications, and trust signals (e.g., "RERA Registered", "Verified Properties") to build credibility.

#### home/ValuePropositions.tsx
- **Path:** `agents/website/src/components/home/ValuePropositions.tsx`
- **Lines:** 38
- **Props:** None
- **Description:** Section highlighting key value propositions of the platform (AI-powered search, verified listings, instant support, etc.) with icons and short descriptions.

---

### AI Chat System (5 files)

#### chat/AIChatModal.tsx
- **Path:** `agents/website/src/components/chat/AIChatModal.tsx`
- **Lines:** 304
- **Props:** `{ isOpen: boolean; onClose: () => void; initialQuery?: string }`
- **Exports:** `Message` interface { id, role, content, timestamp, properties[] }, `FilterState` interface
- **Imports:** ChatHeader, ChatMessages, ChatInput, `sendAIChatMessage`
- **Description:** Full-screen AI chat modal for conversational property search. Features:
  - Session-based chat with unique session IDs
  - Message history (user + AI roles) with property card attachments
  - Typing indicator during AI processing
  - Optional authentication state (phone number collection for booking)
  - Phone collection modal for authenticated features
  - Calls `sendAIChatMessage` API which returns text responses and optionally matched `Property[]` objects
  - AnimatePresence for modal open/close transitions

#### chat/ChatHeader.tsx
- **Path:** `agents/website/src/components/chat/ChatHeader.tsx`
- **Lines:** 47
- **Props:** `{ isAuthenticated: boolean; userPhone: string | null; onClose: () => void }`
- **Description:** Chat modal header with Panditji avatar (gradient orange-to-pink icon with prayer emoji), title "Chat with Panditji", authenticated user indicator (green badge with phone number), and close button.

#### chat/ChatInput.tsx
- **Path:** `agents/website/src/components/chat/ChatInput.tsx`
- **Lines:** 104
- **Props:** `{ onSend: (message: string) => void; disabled?: boolean }`
- **Description:** Chat message input with auto-resizing textarea. Send on Enter (Shift+Enter for newline) or send button click. Disabled state shows loader. Auto-focuses after sending. Refocuses textarea after message is sent.

#### chat/ChatMessages.tsx
- **Path:** `agents/website/src/components/chat/ChatMessages.tsx`
- **Lines:** 161
- **Props:** `{ messages: Message[]; isTyping: boolean }`
- **Imports:** `PropertyChatCard`, lucide-react (Bot, User)
- **Description:** Chat message display area with auto-scroll to bottom. Renders:
  - Empty state with welcome message when no messages
  - User messages (right-aligned) with User icon
  - AI messages (left-aligned) with Bot icon, rendered content, and attached property cards if present
  - Typing indicator (animated dots) when AI is processing
  - Staggered entrance animations per message

#### chat/PropertyChatCard.tsx
- **Path:** `agents/website/src/components/chat/PropertyChatCard.tsx`
- **Lines:** 196
- **Props:** `{ property: Property }`
- **Description:** Rich property card displayed inline within chat messages. Features:
  - **Image carousel:** Multiple photos with left/right navigation arrows and dot indicators
  - Property details: BHK config, area, formatted price (Cr/L), location with MapPin
  - "View Details" link to `/properties/{id}`
  - AnimatePresence for image transitions
  - Handles missing media gracefully

---

### Forms & Lead Capture

#### ContactForm.tsx
- **Path:** `agents/website/src/components/ContactForm.tsx`
- **Lines:** 52
- **Props:** `{ propertyId?: string; intent?: string; dark?: boolean }`
- **Description:** Reusable contact inquiry form with fields: Name (required), Phone (required), Email (optional), Message (optional). Submits to `submitContactForm` API with optional property_id and intent. Shows success state with checkmark. Supports dark mode variant for use on dark backgrounds. Includes "Panditji will contact you on WhatsApp" footer text.

#### LeadCapture.tsx
- **Path:** `agents/website/src/components/LeadCapture.tsx`
- **Lines:** 216
- **Props:** None
- **Description:** Combined cookie consent banner and lead capture popup. Features:
  - **Cookie banner:** Appears for first-time visitors at page bottom. Options: Accept All, Essential Only, expandable details about cookie types (Essential, Analytics, Marketing). Persists consent to `localStorage` (`rp_cookie_consent`).
  - **Lead popup:** Appears after 8 seconds if no lead previously captured. Modal form with Name, Phone, Email, Interest dropdown (buy/rent). On success, stores `rp_lead_captured` in localStorage to prevent re-showing. Submits to `submitLead` API. AnimatePresence transitions.

---

### UI Library (Shadcn-style, 10 files)

All UI primitives are in `agents/website/src/components/ui/`. They follow a Tailwind-based, composable pattern similar to shadcn/ui.

#### ui/Button.tsx
- **Path:** `agents/website/src/components/ui/Button.tsx`
- **Lines:** 53
- **Props:** Standard button props + `variant` ('primary' | 'secondary' | 'outline' | 'ghost'), `size` ('sm' | 'md' | 'lg')
- **Description:** Reusable button component with variant and size styling via Tailwind classes.

#### ui/Card.tsx
- **Path:** `agents/website/src/components/ui/Card.tsx`
- **Lines:** 31
- **Props:** `{ children, className }`
- **Description:** Card container with rounded corners, border, shadow, and dark mode support.

#### ui/Input.tsx
- **Path:** `agents/website/src/components/ui/Input.tsx`
- **Lines:** 67
- **Props:** Standard input props + `label`, `error`, `helperText`
- **Description:** Form input with optional label, error message, and helper text. Focus ring styling.

#### ui/Select.tsx
- **Path:** `agents/website/src/components/ui/Select.tsx`
- **Lines:** 39
- **Props:** Standard select props + `label`, `options[]`
- **Description:** Styled dropdown select with label and options rendering.

#### ui/Badge.tsx
- **Path:** `agents/website/src/components/ui/Badge.tsx`
- **Lines:** 34
- **Props:** `{ children, variant, className }`
- **Description:** Inline badge/tag with color variants for status indicators and labels.

#### ui/Tabs.tsx
- **Path:** `agents/website/src/components/ui/Tabs.tsx`
- **Lines:** 48
- **Props:** `{ tabs: { id, label }[]; activeTab; onTabChange }`
- **Description:** Horizontal tab navigation with active state styling and click handlers.

#### ui/Accordion.tsx
- **Path:** `agents/website/src/components/ui/Accordion.tsx`
- **Lines:** 72
- **Props:** `{ items: { title, content }[] }`
- **Description:** Collapsible accordion component with expand/collapse animation for FAQ sections.

#### ui/Carousel.tsx
- **Path:** `agents/website/src/components/ui/Carousel.tsx`
- **Lines:** 91
- **Props:** `{ children, autoPlay?, interval? }`
- **Description:** Image/content carousel with auto-play, manual navigation arrows, and dot indicators.

#### ui/Container.tsx
- **Path:** `agents/website/src/components/ui/Container.tsx`
- **Lines:** 22
- **Props:** `{ children, className }`
- **Description:** Max-width content container (max-w-7xl mx-auto px-4) for consistent page width.

#### ui/Skeleton.tsx
- **Path:** `agents/website/src/components/ui/Skeleton.tsx`
- **Lines:** 41
- **Props:** `{ width?, height?, className }`
- **Description:** Loading skeleton placeholder with shimmer animation for content loading states.

---

### SEO

#### seo/JsonLd.tsx
- **Path:** `agents/website/src/components/seo/JsonLd.tsx`
- **Lines:** 12
- **Props:** `{ data: Record<string, any> }`
- **Description:** Renders a `<script type="application/ld+json">` tag with JSON-LD structured data. Used for injecting schema.org markup (RealEstateAgent, Product, etc.) into pages for search engine optimization. Accepts any JSON-serializable data object.

---

### Workflow (Property Posting, 3 files)

These components power the public-facing property submission wizard at `/post-property`.

#### workflow/StepRenderer.tsx
- **Path:** `agents/website/src/components/workflow/StepRenderer.tsx`
- **Lines:** 1,146
- **Props:** `{ step: WorkflowStepDef; options: WorkflowStepOption[]; currentValue: any; secondaryValue?: any; documentTypes?: WorkflowDocType[]; addressConfig?: AddressConfig; onAnswer; onBack; onSkip; canGoBack; loading; error; onUploadPhotos?; onUploadVideos?; onUploadDocument? }`
- **Description:** The core step rendering engine for the property posting workflow. This is the largest component in the website codebase. Handles rendering for every possible step input type:
  - **select_one / select_multi:** Option grid with icons, labels, and optional Hindi translations
  - **text / textarea:** Text inputs with validation patterns, min/max lengths
  - **number:** Number inputs with min/max constraints
  - **address:** Google Places autocomplete with state/city/locality/pincode extraction, plus conditional fields for floor number, BHK, plot area based on `addressConfig`
  - **photo_upload:** Multi-photo drag-and-drop with camera capture, preview thumbnails, and upload progress
  - **video_upload:** Video file upload with preview
  - **document_upload:** Document upload with document type selector and title input
  - **price:** Price input with INR formatting
  - **date:** Date picker
  - **phone:** Phone number input with Indian format validation
- Each step shows question text, navigation buttons (Back/Next/Skip), loading state, and error display. Uses Framer Motion for step transition animations.

#### workflow/StepConfirmation.tsx
- **Path:** `agents/website/src/components/workflow/StepConfirmation.tsx`
- **Lines:** 82
- **Props:** `{ summary: Record<string, string> | null; onConfirm: () => void; onBack: () => void; submitting: boolean; error: string }`
- **Description:** Final review and confirmation step of the property posting workflow. Displays all collected answers as a labeled summary list in a styled card. Shows "Review & Confirm" heading, back button, confirm/submit button (with loading state), and error display. Animated entrance from right.

#### workflow/WorkflowProgress.tsx
- **Path:** `agents/website/src/components/workflow/WorkflowProgress.tsx`
- **Lines:** 64
- **Props:** `{ groups: WorkflowGroup[]; currentStep: WorkflowStepDef | null; stepHistory: string[]; done: boolean }`
- **Description:** Visual progress indicator for the property posting workflow. Shows:
  - Current group label and "X answered" counter
  - Horizontal progress bar (emerald green, percentage-based)
  - Group step indicators (circles with icons): completed groups show checkmark, active group has ring highlight, future groups are gray
  - Responsive: desktop shows group labels, mobile hides them

---

### Authentication

#### login/UserLoginModal.tsx
- **Path:** `agents/website/src/components/login/UserLoginModal.tsx`
- **Lines:** 296
- **Props:** `{ isOpen: boolean; onClose: () => void }`
- **Imports:** `framer-motion`, lucide-react, `sendUserOTP`, `verifyUserOTP`
- **Description:** Public user login/registration modal using OTP-based authentication. Three-step flow:
  1. **Phone step:** Indian phone number input with E.164 validation (`/^(\+91|91)?[6-9]\d{9}$/`). Sends OTP via `sendUserOTP` API.
  2. **OTP step:** 6-digit OTP input for verification via `verifyUserOTP` API.
  3. **Success step:** Confirmation with checkmark animation.
- Full modal overlay with AnimatePresence transitions. Error handling with inline messages.

---

## Summary Statistics

| Metric | Admin Dashboard | Public Website | Total |
|--------|----------------|----------------|-------|
| Component files | 41 | 36 | 77 |
| Total lines | ~16,278 | ~4,701 | ~20,979 |
| Largest component | AdvancedAnalytics (614) | StepRenderer (1,146) | StepRenderer (1,146) |
| Context providers | 2 | Shared via theme | 2 |
| Custom hooks | 2 | 0 | 2 |
| API client files | 2 (510 + 86 lines) | Uses lib/api.ts | 2 |
| Mobile-specific | 9 components | Responsive via Tailwind | 9 |
| Charting library | Recharts | None | Recharts |
| Animation library | None (CSS transitions) | Framer Motion | Both |
| CSS approach | Inline styles + CSS vars | Tailwind CSS | Both |
| Framework | React + Vite (SPA) | Next.js (App Router) | Both |
