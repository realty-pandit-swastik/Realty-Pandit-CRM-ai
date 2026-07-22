# Dashboard Redesign — Phase 5: New Instrumentation

> **For agentic workers:** Phase 5 is **several largely-independent features**, not one build. Each
> sub-phase (5A–5E) is separately shippable and separately valuable — implement and deploy them one at a
> time, in the order below (value × (1/risk)). Backend has vitest; frontend verifies with build + live
> Playwright. **Schema changes use the project's real migration flow** (see the recipe box) — NOT
> schema-push.

**Goal:** Add the genuinely-new instrumentation the earlier phases showed as "not tracked yet":
speed-to-lead, per-manager configurable targets, a GCI forecast, plus the two Phase-4 follow-ups
(routing-method persistence, an agent-detail scorecard).

**Spec:** [`docs/design/2026-07-16-dashboard-redesign-spec.md`](../design/2026-07-16-dashboard-redesign-spec.md) ·
**Phase 4:** [`docs/plans/2026-07-16-dashboard-phase4-user-team-distribution.md`](2026-07-16-dashboard-phase4-user-team-distribution.md)

---

## Recommended sequence & why

| Sub-phase | Feature | Kind | Risk | Recommend |
|---|---|---|---|---|
| **5A** | **Speed-to-lead** | analytics query only (no schema, no pipeline) | LOW | **Do first** — highest value, lowest risk |
| **5B** | **Per-manager targets** | new table + form + endpoint wiring | LOW-MED (1 migration) | Do second — real feature the owner asked for |
| **5C** | Routing-method persistence | additive column + shared helper across ~12 sites | MED (many files) | Do third — makes Team "by route" precise |
| **5D** | Agent-detail scorecard | reuse `/user-performance` in a profile section | LOW | Do anytime — cheap |
| **5E** | GCI forecast | fixed-assumption weighted pipeline | LOW code / **HIGH "fakeness"** | **Owner decision** — ship clearly-labelled, or defer |

**Two need an owner call before/at build:** 5B (who may edit targets — recommend managers via
`manage_team`, super_boss too) and 5E (whether a fixed-assumption GCI is wanted at all, or defer until
deals carry real close-date/probability/rate).

---

## ⚙️ Schema-migration recipe (used by 5B + 5C) — the REAL flow

This repo has a tracked `backend/prisma/migrations/` folder applied on deploy via `npx prisma migrate
deploy && npx prisma generate` (see `update-server.sh`). Additive/nullable changes are safe to apply
before the code that uses them. Per-change:

1. **Backup first.** `pg_dump` after stripping `?connection_limit` from `DATABASE_URL`
   (`DBURL="${DBURL_RAW%%\?*}"`), gzip to `/root/backups/`. (SSH `root@72.62.231.224`, key
   `~/.ssh/realty_pandit_key`, path `/var/www/realty-pandit/backend`.)
2. Edit `schema.prisma` (additive + nullable). **Strip em-dashes from schema before generate** (known
   prod quirk).
3. Author `prisma/migrations/<timestamp>_<name>/migration.sql` with **idempotent** SQL
   (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`). Template:
   `prisma/migrations/20260713000000_partner_teams/migration.sql`.
4. Deploy: `migrate deploy` → `generate` → `pm2 restart realty-backend`.
5. **Stale-Prisma-Client gotcha** (`docs/precautions/deployment-gotchas.md:25`): after adding a field,
   PM2 may keep throwing "Unknown argument" even after generate — if so, hard-restart the process (not
   just reload). Watch for it in the post-deploy probe.

---

# 5A — Speed-to-lead (analytics query; NO schema, NO pipeline change)

**Why it's now safe:** `speed_to_lead = MIN(Interaction.created_at WHERE direction='outbound' AND
phone_number=contact.phone_number AND created_at >= contact.created_at) − contact.created_at`. The
dominant first-outbound (auto welcome + AI replies) has been logged since the 2026-07-13 fix; both
`@@index([tenant_id, phone_number, created_at])` and `@@index([channel, direction, created_at])` support
it. Residual: a slight *over*-estimate for the narrow set of leads whose true first touch was a raw
`WhatsAppService` send / real Vapi call with no paired log — acceptable v1; note it in the UI subtitle.

**Files:** Create `backend/src/services/speed_to_lead.ts` (+ `__tests__/speed_to_lead.test.ts` for the
pure bucket/median helper); Modify `backend/src/routes/analytics.ts` (`/user-performance` per-agent
`avg_response_min`; a small `stl` block on an existing endpoint or a new `GET /speed-to-lead`); Modify
`LeadIntelligenceDashboard.tsx` (pulse tile + a "Slow to Respond" action), `UserPerformanceDashboard.tsx`
("Slow Responders" coaching signal + column), `MainDashboard.tsx` (pulse tile — replaces the omitted
speed placeholder).

- [ ] **Task 5A.1 — pure helpers (TDD):** `minutesBetween`, `median(nums)`, and a bucketer
  `stlBucket(minutes) → '<5m'|'5–30m'|'30m–2h'|'2–24h'|'>24h'|'no response'`. Vitest.
- [ ] **Task 5A.2 — service `computeSpeedToLead(ctx)`:** role-scoped (`resolveVisibleAgentIds` +
  `rawContactFilter`). One `$queryRaw` over contacts created in the window:
  ```sql
  SELECT c.phone_number, c.created_at, c.assigned_agent_id,
    (SELECT MIN(i.created_at) FROM interactions i
       WHERE i.phone_number = c.phone_number AND i.direction = 'outbound' AND i.created_at >= c.created_at
    ) AS first_out
  FROM contacts c
  WHERE c.tenant_id = $tenant AND c.created_at BETWEEN $from AND $to <rawContactFilter>
  ```
  Returns `{ median_minutes, responded_pct, distribution: [{bucket,count}], by_agent: [{agent_id, avg_minutes, n}] }`
  (skip rows with null `first_out` from the median but count them as "no response").
- [ ] **Task 5A.3 — endpoints:** add `avg_response_min` to each `/user-performance` agent row (join
  `by_agent`), and expose the overall block via a lightweight `GET /api/analytics/speed-to-lead?from&to`
  (or fold into `/market-trends`). `tsc --noEmit` clean; deploy backend; probe: median is a sane number
  (minutes), `responded_pct` < 100, per-agent avgs present.
- [ ] **Task 5A.4 — frontend:** Lead Intelligence pulse gets a **"Median Speed-to-Lead"** tile (+ a
  "Slow to Respond" mini-insight); User Performance adds a **"Slow Responders"** coaching tile
  (agents with `avg_response_min > 60`) and a Response column; Main pulse shows median STL. Subtitle
  notes "first outbound incl. bot; a few unlogged sends may read slightly slow." Deploy + live-verify.

---

# 5B — Per-manager configurable targets (new table + form) — ✅ DONE 2026-07-17

**Owner decision (confirm):** managers edit their own team's targets (gate `manage_team` — managers
have it; super_boss also). Targets are monthly; the endpoints already scale to the window.

> **Shipped 2026-07-17** (`v20260717a`, backend redeployed + prod migration behind a pg_dump). **Two
> deviations from the sketch below, both intentional:** (1) the editor lives on the **User Performance**
> dashboard (`analytics/TargetsEditor.tsx`), NOT `TeamManagement.tsx` — that file doesn't exist and
> `MyTeam.tsx` is partner-owner-only; User Performance is where the target-driven scores (Score
> Composition, Below-Target) render, so the config sits next to its effect. (2) Only **`/user-performance`**
> was target-wired — `/team-performance` shows structure/distribution, not per-agent-vs-target scores, so
> per-manager targets don't change its output today (wire it if/when it grows a target-vs-actual panel).
> Live-verified: editor renders defaults for super_boss (proves `GET` + `manage_team` gate), edit→Save
> round-trip persisted + toast + reload (proves `PUT`→upsert), test row deleted (prod back to 0 rows).

**Files:** `schema.prisma` + a migration (`Target` table); `backend/src/services/targets.ts`
(`getTargetsForManager`, `upsertTargets`); `backend/src/routes/team.ts` (`GET`/`PUT /api/team/targets`);
`backend/src/routes/analytics.ts` (`/user-performance` + `/team-performance` look up per-manager targets,
fall back to `DEFAULT_MONTHLY_TARGETS`); `frontend/src/api/client.ts` (`getTeamTargets`,
`updateTeamTargets`); `frontend/src/components/TeamManagement.tsx` (a "Team Targets" form,
`manage_team`-gated).

- [x] **Task 5B.1 — schema + migration** (follow the recipe box). Add:
  ```prisma
  model Target {
    id                String   @id @default(uuid())
    tenant_id         String
    manager_agent_id  String   // the manager whose team these targets apply to
    period            String   @default("monthly")
    leads             Int      @default(30)
    appointments      Int      @default(15)
    inventory         Int      @default(10)
    conversion_rate   Float    @default(0.2)
    created_at        DateTime @default(now())
    updated_at        DateTime @updatedAt
    @@unique([tenant_id, manager_agent_id, period])
    @@map("targets")
  }
  ```
  `pg_dump` → migration SQL (`CREATE TABLE IF NOT EXISTS "targets" (...); CREATE UNIQUE INDEX IF NOT
  EXISTS ...`) → `migrate deploy` → `generate` → restart (watch the stale-client gotcha).
- [x] **Task 5B.2 — service + endpoints:** `getTargetsForManager(tenantId, managerId)` returns the row or
  `DEFAULT_MONTHLY_TARGETS`; `upsertTargets(...)`. `GET /api/team/targets` (self manager) + `PUT
  /api/team/targets` (`checkPermission('manage_team')`, mirrors `team.ts` gates). `tsc` clean.
- [x] **Task 5B.3 — wire scoring:** in `/user-performance`, resolve each agent's manager
  (`reports_to_id`; a manager is their own team) → look up that manager's targets (batch-load all
  relevant managers once into a Map) → `scaleTargets(managerTargets, days)` per agent instead of the
  const. Same for `/team-performance`. Deploy backend; probe: an agent under a manager with custom
  targets scores against those; others still use defaults.
- [x] **Task 5B.4 — UI:** a "Team Targets" card in `TeamManagement.tsx` (4 numeric inputs + Save,
  `hasPermission('manage_team')`), prefilled from `getTeamTargets`. Deploy + verify a manager can set
  targets and the User/Team scores shift accordingly (test with a minted manager token or a real manager
  login). Note in the dashboard that scores are "vs your team's targets".

---

# 5C — Routing-method persistence (Phase-4 follow-up) — ✅ DONE 2026-07-17

**Makes the Team "Distribution by Channel" panel a true "by route"** (round-robin / sub-user / uploader /
partner / manual) instead of channel inference.

> **Shipped 2026-07-17** (`v20260717c`) as a formal data-migration — see the full SOP + 21-site table:
> [`2026-07-17-phase5c-assignment-method-migration.md`](2026-07-17-phase5c-assignment-method-migration.md).
> Reality vs this sketch: discovery found **29 write-sites** (not ~12) across contacts+leads; **21 live
> contact-writes instrumented**, 6 skipped with cause, 3 gaps documented. Kept `by_route` (channel) and
> ADDED a separate `by_method` panel (cleaner than overloading `by_route`). Instead of one central write
> helper for every site, the resolvers still return only an agentId, so simple sites use `assignContact()`
> and the 6 branch-dependent cascades track `method` inline (exact branch order preserved → zero routing
> change, confirmed by an adversarial-review workflow: GO, 0 missed / 0 mislabels). Column applied
> column-first behind a pg_dump (reads/writes aren't catch-guarded).

**Files:** `schema.prisma` + migration (`Contact.assignment_method String?`); new
`backend/src/services/assign_contact.ts` (`assignContact(phone, agentId, method)` — the single write
helper); refactor the ~12 auto-assign write sites to call it (per the site list in the Phase-4 audit);
`backend/src/routes/analytics.ts` (`/distribution` `by_route` groups on `assignment_method` when present,
falls back to `classifyRoute`).

- [x] **Task 5C.1 — migration:** `ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "assignment_method"
  TEXT;` (recipe box).
- [x] **Task 5C.2 — shared helper:** `assignContact(phone, agentId, method, tx?)` in
  `services/assign_contact.ts` writes `{ assigned_agent_id, assignment_method }` in one place (nulls the
  method on unassign). Methods: sub_user / uploader / round_robin / manager_review / manual / partner / other.
- [x] **Task 5C.3 — instrument the 21 live sites** (99acres/magicbricks/housing/facebook/external_leads/
  ensure_deal/both pollers/public website/db.ts $extends/scheduled_worker escalations/deals+leads reassign/
  transfer wizard). Simple updates → `assignContact(...)`; branch-dependent cascades track `method` inline;
  complex upserts/$extends stamp inline. `tsc` 0-new; deployed backend behind the column.
- [x] **Task 5C.4 — distribution + UI:** `/distribution` ADDS `by_method` (kept `by_route` channel panel
  intact) with legacy nulls → "Unknown (legacy)". Team Performance shows a new **"Lead Distribution by
  Routing Method"** panel. Live-verified: renders Unknown (legacy) 4,775 = 100% (all pre-migration), fills
  forward; write-probe confirmed assignContact records the method end-to-end. 0 console errors.
  > Note: existing rows stay null (method wasn't recorded); the panel fills going forward.

---

# 5D — Agent-detail scorecard (Phase-4 follow-up; cheap reuse) — ✅ DONE 2026-07-17

**Files:** `frontend/src/components/TeamMemberProfile.tsx` (add a "Performance" section); optionally a thin
`GET /api/analytics/user-performance/:agentId` (or filter the existing list client-side).

> **Shipped 2026-07-17** (`v20260717b`, frontend-only — no thin endpoint needed, the existing role-scoped
> list is filtered client-side by `agent_id`). Evaluator-gated (`super_boss`/`manager`; a plain employee
> viewing self sees no score). Live-verified: Bobby Yadav's card matches his User Performance row exactly
> (40 · Average, Deals 1 / ₹1.17 Cr / ₹0 commission / 4h 37m response, components 100/6/0/40), 0 console errors.

- [x] **Task 5D.1:** In `TeamMemberProfile`, fetch `getUserPerformance(range)` and pick the row matching
  the profile's agent id; render the **4 score components** (RankedBars), score/category, deals/revenue/
  commission, and (if 5A shipped) `avg_response_min`. Gate by existing profile permission.
- [x] **Task 5D.2:** Build + verify the scorecard renders for a member; role scope holds (a manager
  sees their reports). **Trend deferred** (analytics routes are single-window; a trend needs a new
  time-series call — note it).

---

# 5E — GCI forecast — ✅ SHIPPED 2026-07-17 (directional, labelled)

> **Shipped 2026-07-17** (`v20260717d`) as a **directional weighted-pipeline**, NOT a committed forecast.
> The owner decision (ship vs defer) was resolved on data: a prod probe found the commission ledger EMPTY
> (0 `DealCommissionEntry`, 2 closed-won deals ever) — so a real GCI forecast is ungroundable — but **88%
> of open leads carry a stated budget**, which is exactly what the methodology below uses. Backend: pure
> `utils/gci.ts` (6 vitest green) + `GET /api/analytics/gci-forecast` returning the estimate + **all
> assumptions + a disclaimer**. Frontend: a "🔭 Pipeline Outlook — directional GCI estimate" panel on Team
> Performance with three "not a committed forecast" labels. Live: weighted GCI **₹13.23 Cr** (by-stage sum
> reconciles), 3,382/3,567 open deals with a budget, 0 console errors.

**Honesty gate:** deals carry no expected-close-date, no probability, and no per-deal commission rate.
A GCI number can only be `Σ over open deals of value × rate × stageProbability` with **all three
assumed**. Ship ONLY as a clearly-labelled directional "Weighted Pipeline (GCI · assumptions)" with a
visible assumptions panel, or defer until deals carry real close/probability/rate data. **Do not present
it as a precise forecast.**

**Files (if built):** `backend/src/utils/gci.ts` (pure: `STAGE_PROBABILITY` const per `Transaction.status`,
`COMMISSION_RATE = 0.02` anchored on the `Commission` default, `annualizeIfRent`); `analytics.ts`
(`GET /api/analytics/gci-forecast` — Σ over open `Transaction`s of `budgetMidpoint × rate × prob`,
role-scoped; group into 30/60/90 by a crude bucket since there's no close-date — or present a single
weighted number + a by-stage breakdown); a panel on Main or Team Performance.

- [ ] **Task 5E.1 (TDD):** pure `weightedValue(deal)` + `STAGE_PROBABILITY` table; vitest that a
  NEGOTIATION deal weights higher than a NEW one and rent budgets annualize.
- [ ] **Task 5E.2:** endpoint + a **"Weighted Pipeline (GCI, assumptions)"** card with an assumptions
  footnote (rate 2%, stage probabilities, rent annualized) and a by-stage bar. Deploy + verify it
  reconciles to Σ(open deal weighted values) and is clearly labelled as directional.
  > The 30/60/90 split is not real (no close-date); present a single weighted figure + by-stage instead,
  > unless/until an `expected_close_date` is added. State this in the card.

---

## Cross-cutting verification & docs (per sub-phase)

- [ ] Backend: new vitest green (5A bucketer, 5E weighting), `tsc --noEmit` 0 new vs the 395 baseline.
- [ ] Frontend: `npm run build` clean; live Playwright per role; drill/scope/empty-states intact.
- [ ] `server_health` all-green; `glitchtip_digest` no new errors after each backend deploy (watch the
  stale-Prisma-Client gotcha on 5B/5C).
- [ ] Update `docs/PROJECT_STATUS.md` + the spec status after each sub-phase. When 5A lands, the
  "speed-to-lead not tracked" notes on Main/Lead-Intel/User can be removed.

## Self-review (against the spec's Phase-5 instrumentation list)

- **Speed-to-lead capture** → 5A (as a query — the 2026-07-13 logging fix made this feasible without
  touching the pipeline; residual unlogged-send caveat stated). ✅
- **Price-vs-median** → **already shipped in Phase 1** (own-median price positioning on Property
  Analytics) — NOT re-done here. ✅ (removed from Phase-5 scope)
- **Configurable (per-manager) targets** → 5B (new `Target` table + `manage_team` form + scoring
  lookup). ✅
- **GCI 30/60/90 forecast** → 5E, honestly scoped: data is too poor for a real 30/60/90 split, so ship a
  labelled weighted-pipeline + by-stage, or defer (owner decision). ✅ (partial by necessity, stated)
- **Follow-ups:** routing-method column → 5C; agent-detail perf page → 5D. ✅
- **Migration flow corrected:** uses the real `prisma migrate deploy` + idempotent SQL + pg_dump, not
  schema-push. ✅
- **No placeholders:** each sub-phase names files, the query, the schema, the gate, and the verification;
  the two owner-decision points (5B editors, 5E build-or-defer) are called out explicitly rather than
  silently assumed.
