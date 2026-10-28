# Dashboard behaviour baseline

Captured 2026-10-26 from the **current working tree**, including the pre-existing UI edits. This session must compare against this tree, not HEAD. No dashboard or global styling changes had been made by this session at capture.

## Shared contracts

- Entry: `App.tsx` dashboard view -> `DashboardTabs`. Navigation remains the existing view state / `rp:drill` event system, not new routes.
- Tabs, in order: Main Dashboard, Lead Intelligence, User Performance (My Performance for employees), Team Performance (manager/super_boss only), Property Analytics. Default `main`, unless valid `?rpDashboard=` exists. Team tab is rejected for other roles. `pickTab` updates state and replaces only this query parameter, preserving other parameters and history.state. ArrowLeft/Right/Home/End use the existing handlers. IDs `rp-tab-*`, `rp-dashboard-panel`, roles, aria-label `Dashboard views`, and all existing accessible names remain.
- Role/data scope is supplied by backend plus `useAuth`; no client-side broadening. Partners cannot navigate to dashboard through the normal partner navigation.
- Every dashboard range initializes from `defaultRange()` -> **Today**, local day start through 23:59:59.999. Presets in order: Today, Yesterday, 3D, 7D, 14D, 30D, This Month, Last Month, Custom. Preset arithmetic remains in `FilterBar.tsx` untouched.
- `RangeBar` props: range/onRange/right. `FilterBar` adds agentOptions/selectedAgents/onAgents/sourceOptions/selectedSources/onSources. Custom date values start as empty strings. Choosing Custom applies existing fallback range immediately; changing date inputs alone does not apply until Apply. Preserve this behaviour.
- MultiSelect starts closed, selected=null means All. Selecting an option from All excludes that option; selecting all explicit options normalizes to null. All resets null. Click-outside closes; Escape closes and focuses trigger. Preserve existing handlers.
- `useAsyncData(fetcher,deps,isEmpty)` starts loading/data=null/nonce=0; dependency or retry refetches; request ID ignores outdated responses. Refresh shows loading again, not background refresh. Error logs and renders retry. No polling, subscriptions, or realtime transport in dashboard components. Remounting tabs refetches their data and resets local filters/sort.
- `LoadingState` labels per screen below; ErrorState default "Couldn't load this dashboard." with Retry->reload; EmptyState uses each screen's title/hint. Main is never empty. Secondary fetch failures retain the current fallback semantics, even where zeros are displayed.
- `ClayCard` props title/subtitle/right/accent/padding(default20)/style/children. `KpiCard` label/value/sub/delta/deltaSuffix/spark/accent/icon. Preserve every value, sublabel, delta, sparkline, and number/date/currency format. Icons and colours are presentation only.
- Formatting stays in `clay.tsx`/`lib/format.ts`: counts, INR rounding/Cr/L spacing, percentages and minutes unchanged. `leadData.ts` calculations unchanged.
- Charts preserve geometry, maxima, series, sorting, truncation, tooltips and interactions. Allowed changes: colour, font, spacing, legend marks. Existing source/category legends retain their item limits.

## API map

`api/client.ts` owns calls. Paths below are GET unless stated otherwise.

| Helper | Endpoint | Parameters / shape consumed |
|---|---|---|
| getContacts | /api/contacts | role-scoped array |
| getManagementAlerts | /api/analytics/alerts | alerts array |
| getWorkflowTaskQueue | /api/workflow-tasks/my-queue | tasks array |
| getMarketTrends | /api/analytics/market-trends | from,to; leads/visits/sales daily arrays |
| getFinancialSummary | /api/analytics/financial-summary | from,to; total_commission/total_revenue |
| getInventory | /api/inventory | Main: status=active,limit=1; total |
| getDealPipeline | /api/deals/pipeline | data/status counts |
| getTeamActivity | /api/team/activity | from,to,limit=20; shares/appointments |
| getSpeedToLead | /api/analytics/speed-to-lead | from,to; median_minutes/by_agent |
| getUserPerformance | /api/analytics/user-performance | from,to; performance |
| getPropertyTrends | /api/analytics/property-trends | from,to; breakdowns and metric objects |
| getTeamPerformance | /api/analytics/team-performance | from,to; teams |
| getDistribution | /api/analytics/distribution | from,to; load/unassigned_leads/by_route/by_method |
| getGciForecast | /api/analytics/gci-forecast | weighted_gci/raw_ceiling/by_stage/disclaimer |
| getTeamTargets | /api/team/targets | targets |
| updateTeamTargets | PUT /api/team/targets | leads,appointments,inventory,conversion_rate |

## Main Dashboard (`dashboard/MainDashboard.tsx`)

Supplier: `loadCockpit(range)` via useAsyncData, deps range.from/range.to. `getContacts` is required; other eight calls individually catch failures. Trend request spans previous+current period; financial/activity/speed calls current only. `now` is captured once on mount. Header greeting depends on hour; first name from agent; date uses en-IN long weekday/day/month/year. Summary includes current leads/visits/closed and existing actionTotal formula.

| Information order / widget | Data / formula | Interaction |
|---|---|---|
| Header, then range | greeting/name/date/summary, range state | RangeBar -> setRange |
| Do This Now: Callbacks Now | count tasks task_type=CALLBACK_REQUEST | drill tasks |
| Visits ASAP | task_type=VISIT_REQUEST | drill tasks |
| Overdue Tasks | due_date < mount-time now | drill tasks |
| Neglected Leads | stale_leads alert count | drill leads |
| Missing Photos | inventory_missing_photos alert count | drill inventory status=active |
| Pulse: New Leads | trend leads current vs previous window | no click |
| Visits | trend visits current/previous | no click |
| Deals Closed | trend sales current/previous | no click |
| Commission | financial total_commission | no click |
| Speed-to-Lead | median_minutes, formatMins; "median, 1st reply" | no click |
| Active Listings | inventory total | drill inventory status=active |
| Open Deals | sum pipeline counts except CLOSED_WON/CLOSED_LOST | drill deals |
| Lead Temperature | contacts BUYER/TENANT/UNKNOWN or missing type; hot/warm/cold counts | HealthBar; no drill |
| Next Actions | tasks sorted priority URGENT/HIGH/MEDIUM/LOW descending, then due ascending; first8 | no row click; OVERDUE label uses mount-time now; type replaces underscores, contact name/phone/dash |
| Live Activity | merge shares created_at + visits scheduled_at, newest first, first15 | no click; existing generated text and share/visit meaning preserved |
| Housekeeping: Listings missing price | inventory_missing_price alert | drill inventory status=active |
| Inactive team members | inactive_agents alert | no click |
| Google Calendar not connected | google_not_connected alert | no click |

Delta formula prev>0 ? percentage : cur>0 ?100:null. Task count overlaps preserved. Empty actions "All caught up"; empty activity "No activity in this period"; empty temperature "No active leads to score". Loading "Loading your dashboard…". No local widget permissions.

## Lead Intelligence (`dashboard/LeadIntelligenceDashboard.tsx`)

Required supplier getContacts once per mount; empty if array length0. Secondary effect on range fetches getUserPerformance/current financial/previous financial/speed, individual fallbacks. Selected agents/sources default null. `computeLead(contacts,{from,to,agentIds,sources})` is authoritative and unchanged. Agent options from performance sorted name; sources unique contacts sorted. Leaderboard filters selected agents only. Revenue/speed follow existing server date scope, not local source filter. Scope note organization/team/your leads by role.

| Information order / widget | Data / props | Action |
|---|---|---|
| Header + scope + date | fmtDate en-IN day/month | none |
| FilterBar | range + agent/source selects | existing setters |
| AI Insights (only length>0) | c.insights -> InsightCards | none |
| Lead Action: Neglected | c.actions.neglected | leads not_contacted_days=14 |
| Hot, Uncontacted | c.actions.hotUncontacted | leads status=hot,not_contacted_days=3 |
| Stagnant; Unqualified New | c.actions respective counts | leads (no filter) |
| Key Metrics in order | Total Leads (delta,spark=c.dailyLeads); Active(delta); Converted(delta); Lost(negative c.d_lost); Conversion(1decimal%,pp delta); Revenue(INR,server delta); Speed-to-Lead(minutes,median 1st reply) | none |
| Lead Sources | c.sources -> SourceDonut | tooltip unchanged |
| Conversion Funnel | c.funnel | none |
| Lead Health | c.health | segment titles unchanged |
| Active Lead Ageing | c.ageing | none |
| Lost Lead Reasons | c.lostReasons -> RankedBars | none |
| Active Lead Delay Reasons | c.delayReasons -> RankedBars | none |
| Top Demand Areas | c.areas -> RankedBars | none |
| What Buyers Want | c.demandProfile.bhk,budget,intent in that order | none |
| Agent Leaderboard | selected-agent performance -> Leaderboard, sorted productivity descending | none |

Loading "Loading lead intelligence…". Empty "No leads in your view yet" plus current hint. Each chart's existing specific empty text retained. No paging/polling/local widget permissions.

## User Performance (`dashboard/UserPerformanceDashboard.tsx`)

Required current+previous getUserPerformance; secondary distribution/alerts/speed catch to empty. Deps range.from/to; empty current performance0. Heading My Performance(employee), Team Performance(manager), User Performance(other). sortBy default **score** descending. Range Today.

| Information order / widget | Data / formula | Action / permission |
|---|---|---|
| Heading + RangeBar | role heading/sub; range | setRange |
| Monthly Targets | TargetsEditor | only hasPermission('manage_team') |
| Coaching Signals | Below Target(category Needs Improvement), Inactive Agents(alert), Overloaded(active_leads>150), Slow Responders(avg_minutes>60) | none |
| Team Totals | Leads sum, Deals Closed sum, Revenue sum, Appts Done sum completed, Hot Leads sum, Avg Score rounded avg | existing current/prev deltas; score delta pt |
| Score Composition | averages of components leads/conversion/appointments/inventory rounded | RankedBars; no click |
| Productivity Mix | counts Excellent/Good/Average/Needs Improvement | no click |
| Leaderboard | sorted rows; Leaderboard itself re-sorts productivity | no click |
| All Agents | columns Agent,Leads,Hot,Appts,Done,Deals,Revenue,Commission,Inventory,Response,Score | sort chips Productivity/Deals/Revenue/Leads; descending; no page size/paging |
| Agent name cell | p.agent_name | drill leads agent_id=p.agent_id |

Response from speed map formatMins; commission default0; score rounded and category label. All current formats retained. Loading "Loading performance…"; empty "No performance data yet" plus hint.

TargetsEditor: vals=null/busy=false/open=false. GET on mount; fallback leads30/appointments15/inventory10/conversion0.2. Closed summary field order Leads/Appointments/Inventory/Conversion, existing /mo suffix. Edit targets opens; Cancel closes without resetting edited vals. Four number inputs with current min/max and conversion percent mapping. Save rounds/clamps existing values, PUT, success toast, closes and onSaved->reload; error toast retains state. Buttons disabled busy; Saving… label. No changed validation or timing.

## Team Performance (`dashboard/TeamPerformanceDashboard.tsx`)

Tab accessible manager/super_boss only. Required getTeamPerformance(current); distribution fallback empty; GCI fallback null. sortBy default **deals** descending. range Today. Empty if teams0. Scope all org(super_boss), reporting line(other).

| Information order / widget | Data / formula | Action |
|---|---|---|
| Heading + RangeBar | scope and range | setRange |
| Structure & Distribution | Unassigned Agents(team name Unassigned member_count), Unassigned Leads(distribution), Teams Off-Target(score<40) | unassigned leads -> drill leads, existing click handler only |
| Across All Teams | Teams count, Leads sum, Deals sum, Revenue sum, Conversion(deals/leads*100,1decimal), Top Score rounded max | none |
| Team Scores | score desc -> ValueBars | none |
| Lead Load per Agent | load first12 -> RankedBars | none |
| Lead Distribution by Channel | by_route | none |
| Lead Distribution by Routing Method | by_method | none |
| Pipeline Outlook (gci truthy only) | weighted_gci,raw_ceiling,with_budget/total_open,by_stage label(stage/probability/count) and INR value, server disclaimer | none; all forecast caveats retained verbatim |
| Team Breakdown | Team,Members,Leads,Hot,Appts(completed/total),Deals,Conv%,Revenue,Score+category | sort chips Deals/Score/Revenue/Conv%, descending |

No paging; no polling. Loading "Loading team performance…"; empty "No teams to show yet" plus current hint. Region aria-label "Team performance table", tabIndex0 preserved.

## Property Analytics (`dashboard/PropertyAnalyticsDashboard.tsx`)

Required getPropertyTrends({from,to}); deps range; empty no status_breakdown entries. Missing pulse/needs/price subobjects use current zero defaults. Range Today. No per-widget permission gates.

| Information order / widget | Data / formula | Action |
|---|---|---|
| Heading + RangeBar | title/subtitle/range | setRange |
| Needs Action | Missing Photos,Stale60d+,Pending Approval,Overpriced,No Matched Buyer | only Stale->inventory days=60; Pending->inventory status=pending_approval |
| Inventory Pulse | Total Properties,Active Listings,Added(period),With Photos%,Avg Days on Market,Shareable% | Total->inventory; Active->inventory status=active; others static |
| Status Breakdown | status_breakdown -> CategoryDonut | tooltip unchanged |
| Intent Breakdown | intent_breakdown -> ValueBars | none |
| Supply vs Demand | supply_demand rows; both values/max(supply,demand,1) share scale; gap short/surplus/balanced | none |
| Inventory Ageing | ageing buckets/count | none |
| Price Positioning | under,at,over order; subtitle sample/unpriced | none |
| Property Type Distribution | type_breakdown count descending | none |
| By Location | by_location order | none |
| Top-Performing Listings | top_listings unchanged order; Listing,Shares,Visits,Enquiries,Score | no row navigation/paging |

Loading "Loading property analytics…"; empty "No inventory in your view yet" plus hint. Existing panel-specific empties preserved.

## Chart contracts (analytics/charts.tsx)

- SourceDonut: first8 sources as pie; total all sources; legend first6; existing conversion-rate thresholds; radii62/92; tooltip unchanged.
- Funnel: all rows, existing ofTop minimum6 for nonzero, count and drop percentage; no changes to formula.
- HealthBar: hot/warm/cold order; segment width pct(value,total), title label:value; count and rounded percentage in legend.
- AgeingBars: current buckets/order and height count/max,170px plot; zero minimum0/nonzero4.
- RankedBars: supplied order, count/max width, count + percent of total; current label truncation.
- Leaderboard: score desc; rank, score ring radius18 and score/100 circumference, agent name, leads/deals/revenue, category. Top3 rank represented by medals originally; numeric ranks may replace medals without changing ordering.
- InsightCards: supplied order; tone map, title/detail/icon; length0 returns null.
- CategoryDonut: positive values only, value desc; all rows as pie, legend first7; radii56/84; totals/percentages/tooltips unchanged.
- ValueBars: supplied order, value/max width; supplied format callback retained.

## Unchanged-code verification and smoke checklist

Existing `agents/browser-qa/tests/ui-contracts.test.cjs`: executed before edits, **18/18 passed**. Baseline `npm run build`: **passed**, with large-bundle warning. These existing tests cover only a subset of dashboard contracts, so a dedicated fixture browser characterization is added before styling.

- [ ] Test-only roles super_boss/manager/employee: four requested widths, all allowed tabs, before screenshots.
- [ ] Assert tab ordering and employee team-tab absence; preserve URL parameter state.
- [ ] Assert Today default, range change query, custom inputs/Apply; source/agent filters.
- [ ] Record each panel's visible text in order; compare after excluding only emoji/whitespace.
- [ ] Verify Main task/inventory/lead/deal drills and existing filter payloads.
- [ ] Verify performance sorting and table column order; target editor controls remain permission-gated.
- [ ] Observe loading/error/Retry and empty states with test-only API responses.
- [ ] Check request methods/paths/query, console, overflow, keyboard focus and accessibility.

Synthetic browser fixtures are isolated to tests. They do not verify real authentication, backend authorization, production data, or actual role credentials. No live test account is currently available.
