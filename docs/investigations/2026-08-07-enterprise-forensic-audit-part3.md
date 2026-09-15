# Enterprise Digital Forensic Audit — Part 3

**Business process · Revenue model · Redevelopment blueprint**
**Date:** 2026-08-07 · **Method:** live production database queried read-only, plus workflow/enum source on the server.

Parts 1–2 cover infrastructure/backend and frontend/SEO.

> **Framing:** Parts 1 and 2 found technical defects. Part 3 found something more important — the platform is **technically healthier than it is commercially effective**. The engineering is not the bottleneck.

---

## 1. The funnel — measured, not estimated

Every number below is a live `COUNT(*)` from production on 2026-08-07.

```
Contacts                 5,735
   └─ Deals created      5,354
        ├─ NEW           2,603   (48.6%)  ← never worked
        ├─ CLOSED_LOST   2,077   (38.8%)
        ├─ QUALIFIED       478   ( 8.9%)
        ├─ ON_HOLD         145
        ├─ VISIT_SCHEDULED  29   ( 0.5%)
        ├─ VISITED          18
        └─ CLOSED_WON        4   ( 0.07%)
```

**Four closed-won deals in the platform's entire history.**

Stage-to-stage conversion:

| Transition | Rate | Read |
|---|---|---|
| Deal → Qualified | 8.9% | Plausible for portal-sourced volume |
| **Qualified → Visit scheduled** | **6.1%** | 🔴 **The primary leak.** 478 qualified, 29 visits |
| Visit → Visited | 62% | Healthy |
| **Visited → Won** | **22%** | 🟢 Genuinely good — when a human views a property, one in five closes |

The closing ability is **not** the problem. 22% visit-to-win is a respectable real-estate number. The problem is that only 29 visits were ever scheduled from 478 qualified leads. **Nearly half of all deals (2,603) sit in `NEW` and have never been touched.**

### The corroborating number

```
tasks:  TODO 8,172   |   DONE 578
```

**93.4% of all follow-up tasks are never completed.** The system generates work diligently and the work is not done. This is the same failure as the 2,603 untouched `NEW` deals, seen from the task side.

No amount of frontend or infrastructure work changes this. It is an operational-capacity and accountability problem, and it is the single highest-value thing to fix in the business.

---

## 2. Acquisition — where leads actually come from

```
recycle 2      2,411   ← re-surfaced existing leads, NOT new acquisition
99acres        2,040
magicbricks      634
manual           450
whatsapp          48
admin_created     39
auto_created      30
voice             18
facebook          17
inventory_share   12
website            9   ←
website_popup      3   ←
```

**Portals supply 2,674 of ~5,700 leads (47%). The website supplies 12 — about 0.2%.**

This reframes Part 2 entirely. The SEO, GEO/AEO, Core Web Vitals and `og:image` findings are real, but they are optimising a channel that currently produces **twelve leads**. That is either:

- **an opportunity** — the site is a 952-URL programmatic-SEO surface that has never been made to convert; or
- **a cost centre** — if organic acquisition is not the strategy, the effort belongs on portals and Meta.

That is a strategy decision for the owner. It should be made explicitly rather than by default.

⚠️ `recycle 2` being the largest single "source" means **the biggest driver of apparent pipeline activity is the system re-showing its own old leads.** The July spike (3,186 deals created vs 1,403 in June) should be read with that in mind — it is recycler output, not market demand.

---

## 3. Communication load

```
interactions          33,689
  whatsapp   16,278 (48%)      outbound  26,440
  system      4,228            inbound    7,277
  voice       3,174            ratio      3.6 : 1
  99acres     2,717
  email       2,557
  admin       2,268
  magicbricks 1,401
  web         1,051
  website        30 · facebook 17 · instagram 5
```

**3.6 outbound messages for every inbound one.** For a product whose value proposition is a *conversational* AI assistant, the conversation is heavily one-sided. Combined with the WhatsApp delivery findings already in memory (a 200 + `wamid` does not mean delivered), some of that outbound volume may not be reaching anyone.

Instagram (5) and Facebook (17) interactions confirm what memory already records: **the social bot has effectively never worked.**

---

## 4. Revenue model — built, never used

| Table | Rows |
|---|---|
| `deal_commission_entries` | **0** |
| `subscriptions` (ACTIVE) | 333 |
| `partner_agents` | 292 |
| `transactions` CLOSED_WON | 4 |

The business model is recorded as **commission-on-sale, not subscription** (locked 2026-05-15). Yet:

- **Not one commission has ever been recorded.** With 4 closed-won deals, the commission machinery has had almost nothing to record — but it is also not being used for those four.
- 333 `ACTIVE` subscriptions exist against a model that is explicitly not subscription-based. These are almost certainly auto-assigned FREE-tier rows, not revenue.

**The platform currently has no working record of money earned.** Whatever revenue the business is making is being tracked outside this system. For a redevelopment, that is a first-order requirement, not a phase-7 nicety.

### Partner channel is dormant

**292 registered partner agents produced 70 deals** (`PARTNER_INTERNAL`) out of 5,354 — **1.3%**. Partner auth is recorded in memory as dormant and the portal ~70% built. The registrations exist; the channel does not function.

---

## 5. Inventory lifecycle is not maintained

```
active 815 · inactive 23 · pending_approval 3 · sold 2 · on_hold 1 · withdrawn 1
intent: sell 758 · rent 87
```

**Two listings have ever been marked sold, one withdrawn.** With 845 listings accumulated over a year, the real number of properties that left the market is certainly far higher. Stale listings degrade match quality, waste agent time, and misrepresent availability to customers — including in ad-driven property cards.

---

## 6. Data quality signals

- `demand_intent` contains `buy` (3,842), `rent` (1,491), plus **`null` 17, `rent_lease` 3, `buyer` 1** — inconsistent values still present, consistent with the case-sensitivity class of bug already documented.
- **15 of 40 agents have no `reports_to_id`** — team scoping cannot resolve a manager for those. *(Memory records "only 8/39"; the live figure is 25/40 with a manager, so this has improved and memory is out of date.)*
- Roles: 34 employee · 4 super_boss · 2 manager. **Four super_boss accounts** is high for a 40-person org and is worth reviewing on least-privilege grounds.

---

## 7. Domain model (verified from Prisma enums)

The vocabulary is well designed and worth preserving in any rebuild:

- **`ContactType`** — BUYER, TENANT, LANDLORD, PARTNER_AGENT, REAL_ESTATE_BUILDER, MANAGEMENT, UNKNOWN. Note the deliberate split of the old `BUYER_TENANT` and `SELLER_LANDLORD` into distinct types, with comments recording the migration.
- **`TransactionStatus`** — NEW → QUALIFIED → MATCHING_APPOINTMENT → VISIT_SCHEDULED → VISITED → NEGOTIATION → CLOSED_WON / CLOSED_LOST / ON_HOLD, plus a `MATCHED` value explicitly marked deprecated but retained to avoid breaking rows. That is disciplined schema stewardship.
- **`RoleContext`** DEMAND / SUPPLY / INTERNAL, **`OwnershipType`**, **`KeyHolderType`**, **`CommissionPartyType`** (INTERNAL_AGENT / PARTNER_AGENT / PLATFORM) — a genuinely thought-through real-estate domain model.

21 workflow modules exist (`buyer`, `seller`, `partner_agent`, `builder`, `management`, `unknown`, `inventory_machine`, `nlu_parser`, plus WhatsApp/chat adapters). The DB-backed `workflows` table holds **0 rows** — workflows run from code, not configuration.

---

## 8. Redevelopment blueprint

### Should this be rebuilt?

**On the evidence: no — not the backend.** A from-scratch rebuild would discard 332 source files, 466 endpoints, 66 well-modelled entities, 45 migrations, a working AI integration with circuit breakers, four portal integrations, and a WhatsApp automation estate — to solve problems that are **operational, not architectural**.

A rebuild would not have closed more than 4 deals. Nothing in Parts 1–3 indicates the architecture is what is limiting the business.

### What to do instead — in value order

**Phase A — Operational recovery (weeks 1–4). No new architecture.**
The only phase that moves revenue.
1. Triage the 2,603 untouched `NEW` deals and the 8,172 open tasks — this is a management process, not a feature.
2. Instrument and enforce the Qualified → Visit transition. It is the 6.1% leak where the business dies.
3. Make commission recording mandatory on `CLOSED_WON`, so revenue becomes visible.
4. Introduce an inventory-status discipline so listings get marked sold/withdrawn.

**Phase B — Stop the silent failures (week 1, parallel).** From Parts 1–2:
CSP fixes (restores frontend error visibility) · `/api-docs` lockdown · PM2 systemd persistence · logrotate · `og:image`.
Roughly one engineer-day for the whole set.

**Phase C — Frontend health (weeks 4–8).**
Hydration fix, code-split the 548 KB chunk, cut the 43 homepage fetches, `generateMetadata` + ISR on property pages. Introduce React Query in the admin and decompose `InventoryList.tsx` (3,508 lines) — this removes an entire class of race bug structurally.

**Phase D — Channel decision (owner, not engineering).**
Decide whether the website is an acquisition channel. If yes, Part 2's SEO/GEO/AEO work becomes high-value and the 952-URL programmatic surface is the asset to exploit. If no, redirect that effort to portals and Meta, and stop paying for site optimisation.

**Phase E — Partner channel (weeks 8–16).**
292 registered partners producing 1.3% of deals is the largest untapped asset in the system. Completing the partner portal has a clearer return than any rebuild.

### If a rebuild is nonetheless mandated

Keep: PostgreSQL schema (66 models), the domain enums, Prisma, the Express service layer, BullMQ, the taxonomy tree.
Change: admin frontend → React + TypeScript + **TanStack Query** + a real design system (replacing 4,119 inline styles); add an API gateway with generated OpenAPI clients; extract WhatsApp/AI into a separate service so bot deploys stop coupling to CRM deploys.
Team: 1 tech lead, 2 backend, 2 frontend, 1 QA, 1 DevOps (part-time). **9–12 months** to functional parity — during which no new business capability ships. That opportunity cost is the strongest argument against it.

---

## 9. Limits of this audit — what I could not verify

Stated explicitly so nothing here is mistaken for fact:

- `commissions` table could not be read with the assumed `amount`/`status` columns; only `deal_commission_entries = 0` is confirmed.
- `notifications.type` and `integration_sync` returned nothing under the assumed column names — the 26,081 notification rows exist but their type distribution is unconfirmed.
- `needs_taxonomy_review` / `needs_owner_fix` counts did not return; memory's figures (179 taxonomy flags, 466 staff-as-owner) are unconfirmed against current data.
- The `requirePermission` grep did not match, so the permission catalogue is not enumerated here.
- Core Web Vitals in Part 2 are a single desktop cold load, not field (CrUX) data.

None of these affect the funnel, acquisition, task-completion or revenue findings, which are direct counts.
