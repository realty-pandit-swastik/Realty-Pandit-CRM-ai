# Behaviour Baseline — Realty Pandit CRM UI redesign

Captured **before** any restyling (Phase 2 step 0). Purpose: prove that the redesign changes
markup/presentation only — not props, events, API calls, permission gates, defaults, sort or paging.

Source: `agents/frontend/src/components/*.tsx`, read via Read/Grep on the working tree at
`fix/deal-board-contact-scope` (74eb4b1).

Rules for this redesign:
- Restyle / restructure markup only.
- Do NOT change data-fetching, caching, mutation or routing logic.
- Keep default views identical: same columns, same default sort, same page size.
- Every permission gate below must survive byte-identical in effect.

---

## A) ExternalLeads.tsx (3240 lines)

### Props
```
180  export function ExternalLeads({ isMobile: isMobileProp, initialFilter, onFilterConsumed }
                                  : { isMobile?: boolean;
                                      initialFilter?: Record<string,string> | null;
                                      onFilterConsumed?: () => void } = {})
```
- `isMobile` falls back to internal `window.innerWidth < 768` state (187)
- `effectiveIsMobile = isMobileProp ?? isMobile` (698)

### Permission gates — MUST BE PRESERVED EXACTLY
Only **two** permission strings are used in this file.
| Line | Gate | Meaning |
|---|---|---|
| 183 | `isPrivileged = ['super_boss','manager'].includes(agent?.role)` | privileged role test |
| 510 | `canApproveClaims = !isPartner && hasPermission('edit_inventory')` | partner-claim approvals |
| 512 | `if (!canApproveClaims) return;` | early return in loadPendingClaims |
| 537 | `if (isPartner) return;` | partners skipped in loadSyncStatus (endpoint 403s them) |
| 576 | `if (!isPartner)` → internal roster `/api/team/members-list` | staff only |
| 578 | `else if (isPartnerOwner)` → `getPartnerAssignable()` | partner owner sub-agents |
| 749 | `if (!isPartner)` → appointments fetch | skipped for partners |
| 1294 | payload gate `isPrivileged && createAssignedAgentId` on POST /api/leads | |
| 1465 | `isPrivileged && syncStatus.configured` → Sync button | |
| 1581 / 1727 | `!isPartner` → Select-mode toggle (mobile / desktop) | |
| 1749 | `canApproveClaims && pendingClaims.length > 0` → claims panel | |
| 2063 / 2072 | `isPrivileged` → Edit Name / Edit Phone | |
| 2093 | `!isPartner && (isPrivileged || editAgent === agent.id)` → Assigned Agent select | |
| 2097 | `isPrivileged` → "Unassigned" option | inside 2093 gate |
| 2107 | `!isPartner && (isPrivileged || own lead)` → Shared-with MultiSelectTeam | |
| 2122 | `isPartnerOwner && selectedPhone` → assign-to-teammate | |
| 2140 | `!isPartner && selectedPhone` → CallerDossier | |
| 2203 | `hasPermission('manage_deals')` → Convert to Deal block | |
| 2231 | `!isPartner && contact_type !== 'PARTNER_AGENT'` → Convert-to-Partner | |
| 2855 | `isPrivileged` → Assign-to-Agent in create wizard | |
| 3144 | `isPrivileged` → FilterSheet Agent section | |

### Table (desktop) — column contract
`<table>` at **1837** (`minWidth: 700px`), `<thead>` 1838–1880, `<tbody>` 1881–2010.
Column tuple literal at **1857** — order is a hard contract:
```
1 Name        2 Phone      3 Client Type  4 Source    5 Status
6 Stage       7 Assigned to 8 Budget      9 Score    10 Intent
11 Location   12 Date      13 '' (actions, key '' => no sort)
```
Optional leading select-all column (34px, 1840–1856) rendered **only when `leadSelectMode`**.

Field reads per column:
| # | Column | Reads | Lines |
|---|---|---|---|
| 1 | Name | `dealerFallback(lead,…).name`, `lead_type==='PARTNER_REFERRAL'` → `referral_partner_name`, `shared_with_ids`, `bhkLabelFor`, `subtypeLabelFor` | 1888–1931 |
| 2 | Phone | `identity.phone` else "No phone" | 1932 |
| 3 | Client Type | `lead.client_role` → `clientRoleLabel`/`clientRoleColor` | 1893, 1933–1939 |
| 4 | Source | `lead.source` → `sourceColors`/`sourceLabels` | 1940–1944 |
| 5 | Status | **interactive `<select value={lead.lead_status}>`** → `handleStatusChange`; disabled when `updatingPhone===lead.phone_number` | 1945–1951 |
| 6 | Stage | `stageInfo(lead.lifecycle_stage)` → `.color`/`.label` | 1952–1956 |
| 7 | Assigned to | `lead.assigned_agent?.name` | 1957–1961 |
| 8 | Budget | `lead.budget_min/max` → `formatBudget` (166) | 1962–1964 |
| 9 | Score | `lead.lead_score?.total_score` → `scoreColor` (164) | 1883, 1965–1971 |
| 10 | Intent | `lead.intent` | 1972 |
| 11 | Location | `lead.preferred_location` | 1973 |
| 12 | Date | `leadCycleStartOf` = `cycle_start_at \|\| recycled_at \|\| created_at` (1331–1335) | 1974–1976 |
| 13 | Actions | tel / wa.me / partner-tel anchors + Open-pipeline + View-matches | 1977–2001 |

> **Status is an interactive `<select>`, not a passive badge.** It must stay interactive.

### Default sort — MUST NOT CHANGE
```
223  const [leadSortKey, setLeadSortKey] = useState<string>('date');
224  const [leadSortDir, setLeadSortDir] = useState<'asc'|'desc'>('desc');
```
Comparator is **server-side**: `params.sort = leadSortKey` (479), `params.direction = leadSortDir` (480).
`<th onClick>` 1862–1865: same column toggles dir; new column defaults **desc for date/score/budget**, **asc for all others**.
Forced overrides: `shared_at`+`desc` when "Shared with me" chip on (1520/1687); reverts to `date`+`desc` when off (1521/1688); Clear resets only if key was `shared_at` (1649/1738). Not persisted (220–222).

### Paging
```
219  const [pageLimit, setPageLimit] = useState(500);
478  params.limit = String(pageLimit)
1798 Load-more: setPageLimit(l => l + 500)   // increment = +500
237  new search resets pageLimit → 500
503  30s auto-refresh refetches the whole window; 547 60s sync-status poll
```

### Row interaction map
Row `onClick` **1895**: `leadSelectMode ? toggleLeadSelect(phone) : openDetail(phone)`.
Row background 1896: `selectedLeadPhones` → `rgba(139,92,246,.12)`; `isSelected` → `rgba(59,130,246,.08)`.
`e.stopPropagation()` sites: **1848** (select-all in `<th>`), **1898** (checkbox `<td>`), **1945** (status `<td>`), **1977** (actions `<td>`).
Cells WITHOUT stopPropagation: Name, Phone, Client Type, Source, Stage, Assigned to, Budget, Score, Intent, Location, Date.
Row key 1895 `lead.phone_number`. Empty row 2005–2009 `colSpan={12}`.

> **Pre-existing asymmetry to preserve:** desktop table iterates `filteredLeads` (contact-level, 1882);
> mobile card list iterates `leadRows` (one row per **deal**, built 1352–1360, client-side stage re-filter at 1359).

### Filters
**Server-side** (all → params on `GET /api/leads/recent-external` 460–481):
`search`(464, 350ms debounce 232–240) · `status`(462) · `source`(461) · `agent_id`(463) · `active`(465) · `intent`(466) · `taxonomy_node_ids`(467) · `bhk`(468) · `lat`/`lng`/`radius_km`(469–471) · `not_contacted_days`(472) · `no_showcase_days`(473) · `budget_min`(474) · `budget_max`(475) · `shared_with_me`(476) · `stage`(477) · `sort`/`direction`(479–480) · `limit`(478).

**Client-side only:** `dateFrom`(244) / `dateTo`(245) filtered at 1336–1341 (server does not filter by date — comment 1322–1323). `stageFilters` additionally client-side at row level (1359).

### Bulk actions — ALREADY EXIST (do not duplicate)
Bar 2905–2915: Reassign → `showLeadReassign`; Stage → `showLeadStage`; Cancel → clears selection.
`POST /api/leads/bulk-stage` (2973) `{phones, stage, mode, agent_id?}` · `POST /api/leads/bulk-reassign` (3021) `{phones, agent_id}`.
Filter sheet already has Clear All (3064–3078) and Apply (3194–3199); chips exist at 1595–1655.

### Overlay state
`showFilterSheet`(246) · `leadSelectMode`(263) · `showLeadReassign`(265) · `showLeadStage`(270) · `showCreateModal`(334) · `selectedPhone`(344) · `showPartnerRegister`(429) · `showConvert`(440).

---

## B) InventoryList.tsx (3636 lines)

### Props
```
151 interface InventoryListProps {
      initialFilter?: Record<string,string> | null;   // one-shot drill-through, e.g. {status:'active'}
      onFilterConsumed?: () => void;
    }
158 export const InventoryList: React.FC<InventoryListProps> = ({ initialFilter, onFilterConsumed })
```
Seeded from `initialFilter`: `filterStatus`(184) · `filterLocation`(187) · `filterDaysInSystem`(215). Consumed once at 224.

### Permission gates — MUST BE PRESERVED EXACTLY
Four permission strings only.
| Line | Gate |
|---|---|
| 165 | `isPartner = agent?.role === 'partner'` (derived locally; `isPartner` is NOT pulled from useAuth here) |
| 384 | `isPartnerOwner` → `getPartnerAssignable()` |
| 387 | `!isPartner` → internal roster (`getTeamMembers` 388, `getTeamMembersList` 392 fallback) |
| 1194 | `hasPermission('edit_inventory')` → + Add Property |
| 1199 | `hasPermission('bulk_upload')` → Bulk Upload |
| 1919 | `!isPartner && hasPermission('edit_inventory') && status==='pending_approval'` → Approve/Reject |
| 1943 | `hasPermission('edit_inventory') && item.can_edit` → Edit |
| 1946 | `hasPermission('edit_inventory') && item.can_edit && status!=='sold'` → Sold / Hold |
| 1952 | `hasPermission('edit_inventory') && item.can_edit && status!=='pending_approval'` → Deactivate/Activate |
| 1966 | `hasPermission('delete_inventory')` → Delete |
| 2955 | `!isPartner` → "Assigned To" block |
| 2969 | `isPartnerOwner` → assign-to-teammate |
| 3026 | `!isPartner && hasPermission('transfer_inventory')` → Transfer Ownership |

Server-driven per-row gate: **`item.can_edit`** (1869, 1943, 1946, 1952).
Server-driven redaction: `flat_no`/`plot_no` deleted by the list endpoint for non-handling agents (comment 1758–1760); `formatUnitLabel` yields `''` when absent.

### No table — card list
`{inventory.map(...)}` at **1288**. **No `<table>`/`<thead>`/`<th>`** anywhere in this file.
No client sort (no `.sort(`); server order preserved. No "load more".

### Paging — MUST NOT CHANGE
```
175 const [currentPage, setCurrentPage] = useState(1);
176 const [totalPages, setTotalPages] = useState(1);
177 const pageSize = 20;                      // hard-coded const, NOT state
427 params.page = currentPage; params.limit = pageSize;
1983 "Showing {(currentPage-1)*pageSize+1}–{Math.min(currentPage*pageSize, totalCount)} of {totalCount}"
1986–1998 Previous / Next, disabled at bounds
```
Page resets: 417–418 (debounced search) · 1220 (Enter) · 1234 (Browse-all toggle).

### Card interaction map
Card `onClick` **1292**: `if (!selectionMode) setViewingId(item.id)`; `cursor` forced to `default` while `selectionMode` (1291).
`e.stopPropagation()`: **1680** (selection checkbox) · **1833** (Match Clients) · **1867** (blanket stop on the whole action-button container) · **1874/1879** (call dropdown) · **1915** (Manager tel anchor).
Everything else in the card **does** open the detail view.

### Pre-existing defects — REPORTED, NOT FIXED (fixing would change behaviour)
1. **1281–1283** — empty-state "+ Add Property" CTA renders with **no** `edit_inventory` gate, unlike the real button at 1194. A user without `edit_inventory` sees an Add button that will 403 on submit.
2. **615–628** `clearFilters()` resets 12 filter states but **omits** `filterState`, `filterBrowseAll`, `filterListingSource`, `filterDataSource`, `filterDaysInSystem`, `filterDaysNoVisit`, `filterFloors` — "Clear" leaves those filters active.

### Bulk actions — ALREADY EXIST
Bar 3150–3176 (when `selectionMode && selectedIds.size>0`): Share via WhatsApp (3161) · Reassign (3168) · Cancel (3172).
`POST /api/inventory/bulk-transfer` (3203) `{ids, to_agent_id}` · `POST /api/inventory/share-batch-to-client` (513) · `POST /api/inventory/share/add-lead` (550) · `POST /api/inventory/share-pdf` (588) · `POST /api/team/inventory/bulk-upload` (1048, multipart).

### Filter counts
`GET /api/inventory/filter-counts` (231), fetched **only when `showFilterSheet` flips true** (229–234); consumed by `getCount()` 237–243 at 3541 (ownership_type) and 3553 (intent).

### Overlay state
`showFilterSheet`(204) · `showAddForm`(258) · `viewingId`(261) · `editingId`(263) · `deletingId`(276) · `shareItem`(280) · `shareOptionsItem`(283) · `bookVisitItem`(284) · `soldItem`(286) · `holdItem`(287) · `renamingDocId`(314) · `sharingDocId`(317) · `callDropdownId`(325) · `selectionMode`(328) · `showReassignModal`(331) · `matchInvId`(335) · `showBatchShareModal`(336) · `showUploadModal`(356).
Edit modal default tab `editTab = 'media'` (294), re-set on every `handleEdit` (772).

---

## C) DealPipeline.tsx — table/board
- Board view (`/api/deals/pipeline` counts per status) plus a dense table at **1439** (`minWidth` per column set, `fontSize: 13`).
- Columns read `deal.demand_contact?.name`, `deal.type`, `deal.demand_location`, `formatBudget(demand_budget_min, demand_budget_max)`, `deal.coordinator?.name`, status, stage metadata.
- Keep board + table both present. `lead-tasks` view is an alias of `deals` (App.tsx:710–711).

## D) InventoryDetailView.tsx — property detail
- Permission-driven price split that MUST survive: `:200` **Demand price** = `inv.customer_price || inv.price`;
  `:203` **Display price** = `inv.display_price || inv.price`, rendered blue and labelled `fullAccess ? 'Display price' : 'Price'`.
  `fullAccess` comes from the auth context — this is a public/internal price boundary, not styling.
- `canEdit = hasPermission('edit_inventory')` (38–40).
- `formatPrice` (65) — one of the 14 divergent copies; unify via `lib/format.ts` with **identical output**.

---

## E) Cross-cutting invariants

### Supplementary screens (before their presentation pass)

- `AgentLogs`: action log and QA table, each retains its own loading branch,
  filters, expansion rows and server pagination; no request or handler changes.
- `CalendarView`: appointments loading/empty/table branches and detail overlay;
  refresh and all per-row handlers retained. Only the existing table wrapper changes.
- `TeamPerformanceDashboard`: existing `SORTS` controls and client ordering retained;
  no new sort or column control is added.
- `MobileInventoryList`: existing independent card renderer, select mode, detail and
  add/edit callbacks remain; no replacement of this screen with desktop markup.
- `FilterBar`: defaults to `today` via `defaultRange`; custom dates apply only through
  existing Apply; multiselect null means all; no changes to preset calculations.
- `DashboardLayout` / `MobileLayout`: original permission predicates, partner
  allowlists and navigation callback retained. Approved palette searches only the
  destinations admitted by each layout's existing predicates; no entity fetch added.
- `DashboardTabs`: no props/API calls; initial tab `main`; teams only for manager or
  super_boss. Approved `rpDashboard` URL state changes this only when a valid,
  role-permitted tab was explicitly saved. Unknown/disallowed values use `main`.
- `InventoryDetailView`: fetches inventory and contacts in parallel for inventoryId;
  alive flag prevents late results; gallery wraps via touch/buttons/arrow keys;
  onEdit invokes the existing callback only under all three current gates.

The read-only `agents/browser-qa/tests/ui-contracts.test.cjs` compares API call
expressions, permission calls and all existing state initializers against HEAD.
This supplements the manual checklist; it is not proof of server authorization.

### Sign-in surface before visual pass

`LoginPage.tsx`: no props; modes login/partner/forgot. Keep the phone/password
form submit handler, Google sign-in, partner OTP/password branches, reset flow,
card-exit/skyline transition, error/success state and all network calls unchanged.
Only wrapper/card surfaces, decorative background, colours and label associations
change. The existing house mark and Realty Pandit name stay intact. No credential,
validation, OTP length, password requirement or auth behaviour is changed.

### Shared demand form before visual pass

`leads/DemandRequirementsForm.tsx`: preserve forwardRef/imperative submit, initial
normalisation, taxonomy/node-field fetches and cancellation, location autocomplete,
all field values and handlers, schema parsing, canonical onSubmit payload, and the
hideSubmitButton/submitting gates. This pass only adds label associations, unique
DOM IDs, and spacing/type tokens. No new validation rule or input restriction.

`AdvancedAnalytics.tsx`: preserve loading/no-data/data branches, fetchAnalytics,
date-range controls, tabs, refresh/export and existing computed metrics. Only add
scoped styles to previously unresolved utility class names; no Tailwind dependency
or global utility framework. Existing static comparison copy is not promoted to
verified data by this visual change.

### Inventory creation dialog before accessibility pass

`InventoryModal.tsx` props: isOpen/onClose/onCreated/onEditInventory. Keep
useWorkflow, all phase state initializers and handlers, body lock, Escape listener,
source/contact selection, prefill, clone, confirmation and onCreated semantics.
handleClose retains its phase-dependent discard confirmation and wf.reset.
This pass only adds dialog semantics/focus containment and a labelled close control.

| Invariant | Where |
|---|---|
| 14 divergent `formatPrice`/`formatINR` implementations | `InventoryList:38`, `InventoryDetailView:65`, `MobileInventoryList:35`, `PropertyMapView:57`, `MatchShareTab:53`, `SharedTab:35`, `MatchedPropertiesSection:40`, `BookVisitModal:186`, `LeadWorkflowPage:117`, `PropertyLiveStatus:61`, `InventoryQuickView:59`, `LogCallOverlay:825`, `clay.tsx:52`, `BuyerChatWorkflow:269` |
| Public/internal price separation | `InventoryList:1772–1781`, `InventoryDetailView:200–203` |
| `lib/phone.ts` normalisation — never re-implement | 13 inputs across 10 files use `<PhoneInput>` |
| Shared inventory workflow (admin/website/WhatsApp) | `routes/inventory.ts:2839,2852,2865`, `workflows/inventory_machine.ts` |
| Nav permission filter | `DashboardLayout.tsx:175–183` |
| State-machine routing, no router | `App.tsx:206`, `lib/drill.ts:5` ("This app has no URL router") |
| Existing deep links that must keep working | `?deal=<id>` App.tsx:267–276 · `?google=<status>` :246–263 · `/setup-password` :428–430 |
| iOS 16px input floor + 44px touch targets | `index.css:343–359` |
