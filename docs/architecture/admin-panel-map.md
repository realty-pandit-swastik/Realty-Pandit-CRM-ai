# Realty Pandit Admin Panel — Full Map (Verified 2026-04-06)

## Stack
- **React 19.2** + **TypeScript 5.9** + **Vite 7.2**
- **CSS Custom Properties** (NOT Tailwind) — inline style objects, light/dark theme
- **Axios** (primary) + Fetch (secondary) API clients
- **recharts** for charts, **lucide-react** for icons
- **jspdf** + **xlsx** + **papaparse** for exports
- **@react-google-maps/api** for maps
- **PWA** with auto-update service worker (`sw-push.js`)
- **No router** — state-based view switching (react-router-dom installed but unused)

## Entry Flow
`main.tsx` → AuthProvider → ThemeProvider → **ToastProvider** → App.tsx (switch on `view` state)

## New Components (added 2026-04-12)
- `contexts/ToastContext.tsx` — global toast/snackbar state, `useToast()` hook
- `components/ui/Toast.tsx` — `ToastContainer` renders toast stack + snackbar

## Correct Deploy Path (CRITICAL — verified 2026-04-12)
Frontend dist goes to `/var/www/realty-pandit/frontend/dist/` — NOT `/home/realty/admin-panel/dist/`
Both directories exist on server. PM2 `realty-admin` serves from `/var/www/realty-pandit/frontend/dist/`.

## Views (21 total, ~25,440 lines across 55 components)

| View ID | Component | Lines | Permission |
|---------|-----------|-------|------------|
| `dashboard` | DashboardTabs (5 sub-views) | 276+192+251+253+224 | None |
| `chats` | ContactList + ChatView | 169+168 | None |
| `calendar` | CalendarView | 448 | None |
| `emails` | EmailManagement | 805 | None |
| `calls` | CallLog | 488 | None |
| `inventory` | InventoryList | 2,247 | view_inventory |
| `property-map` | PropertyMapView | 656 | view_inventory |
| `live-status` | PropertyLiveStatus | 420 | view_inventory |
| `deals` | DealPipeline | 787 | None |
| `leads` | ExternalLeads | 1,770 | None |
| `buyer-chat` | BuyerChatWorkflow | 452 | None |
| `partners` | PartnerManagement | 393 | manage_agents |
| `team` | TeamManagement | 477 | manage_agents |
| `reports` | ReportsView | 859 | view_reports |
| `ai-dashboard` | QADashboard | 317 | view_reports |
| `agent-logs` | AgentLogs | 481 | view_reports |
| `override` | AgentOverride | 357 | view_reports |
| `workflows` | WorkflowBuilder | 822 | view_reports |
| `marketing` | MarketingCampaign | 904 | view_reports |
| `tasks` | TaskBoard | 871 | None |
| `analytics` | AdvancedAnalytics | 690 | view_reports |

Special: `/setup-password` — handled by checking `window.location.pathname` before auth

## Dashboard Sub-Views
- **MainDashboard** — overview stats, recent contacts, today's appointments
- **MarketTrendsDashboard** — trend charts
- **UserPerformanceDashboard** — agent metrics
- **LeadSourcesDashboard** — lead source analytics
- **PropertyAnalyticsDashboard** — property trends

## Key Feature Components

### Inventory Management (2,247+ lines)
Full CRUD, inline editing, filters, image/video/document upload, approval/rejection, transfer, share to client via WhatsApp, book visit, Google Maps, enrichment panel, chat-based intake

### Lead Management (1,770 lines)
External leads (99acres etc.), lead cards with scoring (hot/warm/cold), matched properties, lifecycle stages, no-show reporting, budget/location/amenity preferences

### Deal Pipeline (787 lines)
Kanban + list view, 8 stages, 3 deal scenarios (PARTNER_INTERNAL, PARTNER_PARTNER, DIRECT_INTERNAL), demand/supply contacts, coordinator, timeline, queries, drag-and-drop

### Reports (859 lines)
8 categories, 26+ types, CSV/Excel/PDF export:
- Account: customer/vendor outstanding, monthly sales/purchase
- User: performance, task completion
- Call: all logs, by date, by month
- Lead: all leads, last contact, summary, cancelled reasons
- Sold: by property, area, unit type
- Visit: all visits, property count
- Customer: converted not sold
- Property: all, on hold, availability summary

### AI Agent Monitoring
- QADashboard (317 lines) — flagged/reviewed logs
- AgentLogs (481 lines) — execution log filtering
- AgentOverride (357 lines) — human override controls
- Winning templates, conversion funnel

### Communication
- EmailManagement (805 lines), CallLog (488 lines), CalendarView (448 lines)
- NotificationBell (278 lines) + NotificationSettings (583 lines)
- Web push via service worker

### Other Features
- MarketingCampaign (904 lines) — creation, execution, analytics
- TaskBoard (871 lines) — task management
- WorkflowBuilder (822 lines) — automation configuration
- PartnerManagement (393 lines) — packages, commissions
- TeamManagement (477 lines) — role hierarchy, password management
- VoiceCommands (407 lines) — voice navigation
- AdvancedAnalytics (690 lines) — recharts dashboards

## Shared Components
- **InventoryModal** (1,241 lines) — create property modal (chat or form)
- **AddInventory** (1,062 lines) — legacy add form
- **ContactSearchField** (429 lines) — reusable phone/name search (SSOT)
- **GooglePlacesInput** (160 lines) — places autocomplete
- **EnrichmentPanel** (328 lines) — post-save detail completion
- **ShareToClientModal** (197 lines) — WhatsApp share
- **BookVisitModal** (351 lines) — schedule visit
- **ErrorBoundary** (54 lines)

## Mobile Support (10 dedicated components)
MobileLayout (bottom tabs: Home/Chats/Inventory/Team/Menu + drawer), MobileScrollWrapper, MobileDashboard, MobileContactList, MobileChatView, MobileInventoryList, MobileInventoryEdit (873 lines), MobileCalendar, MobileTeamView, MobileSettings

Browser history integration (back button works).

## Auth Flow
1. Login: phone + password → POST /auth/login → { token, refreshToken }
2. Token stored in localStorage
3. On load: AuthContext checks token → GET /auth/me
4. 401 interceptor: queue failed requests → POST /auth/refresh → retry all
5. Permissions: `hasPermission(perm)` checks agent.permissions[]
6. Roles: super_boss, manager, employee (color badges)
7. Team invite: boss creates → WhatsApp link → `/setup-password?token=...`
8. Hierarchy: `reports_to` (manager) + `subordinates[]`

## API Client (`api/client.ts`, ~925 lines)
- Axios instance, base URL from `VITE_API_BASE_URL`
- JWT Bearer header, auto-refresh on 401
- Vite dev proxy: `/api` → `http://localhost:7071`

## Environment
- `VITE_API_BASE_URL` — Backend API (prod: `https://api.realtypandit.in`)
- `VITE_GOOGLE_MAPS_API_KEY` — Google Maps
