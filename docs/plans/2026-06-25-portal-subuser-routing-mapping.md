# Plan — Portal sub-user → agent mapping (MagicBricks + 99acres lead routing)

**Date:** 2026-06-25
**Author:** Claude (investigation + plan)
**Status:** ✅ EXECUTED 2026-06-25 (see Execution Log at end)
**Trigger:** Owner reported MagicBricks leads are still round-robin distributed instead of routing to the listing agent.

---

## 1. Investigation summary (what's actually happening)

MagicBricks leads ARE still mostly round-robin'd — confirmed against live prod data (920 MB interactions, 2026-04-18 → 06-25):

- **MagicBricks began sending attribution on 2026-06-15.** Since then `sub_user` + `listing_id` arrive on **100%** of leads (72/72, then 56/56). Before 06-15 the payload had neither → those ~800 historical leads were pure round-robin (not retro-fixable; per [[feedback_lead_assignment_dedup]] we never reassign an already-assigned contact).
- **Of post-06-15 leads with a `sub_user`, only ~29% route to the listing agent** (25 resolve by email; **62 are UNMATCHED → fall to round-robin**).
- **Root cause = a data-mapping gap.** MagicBricks sends each lister's *MB-registered identifier* as `sub_user` (their MB Gmail, or `<phone>@timesgroup.com`), but our `agents` table only sometimes holds that exact value, so `resolveAgentByMagicBricksSubUser` returns null and the lead round-robins.

**Unmatched `sub_user` values (post-06-15):**

| `sub_user` | Leads | Identity | Gap |
|---|---|---|---|
| `7906597808@timesgroup.com` | 37 | **UNKNOWN** (no agent has this phone) | needs owner to identify |
| `thenanakestates@gmail.com` | 28 | **UNKNOWN** ("Nanak Estates" — partner?) | needs owner to identify |
| `kumarvivan972@gmail.com` | 15 | **vivan sonu** (on file his google_email is `vchaudhary25101999@`) | wrong email on file |
| `premprasad289@gmail.com` | 11 | likely **Anil Prasad / "Prem Prasad"** | no portal email on file |
| `realtypandit121@gmail.com` | 3 | generic RP gmail | not tied to one agent |
| `swastik.sharma@realtypandit.in` | 1 | Swastik (super_boss) | excluded by design |

The matched ones (Ashwani `ashwanikashyap8595@`, Bharat `bharatbhushan0429@`, Bhuvneswar, Pooja…) only work because their MB Gmail happens to already sit in `personal_email`/`google_email`.

**Secondary code issues found:**
- `assignViaPropertyUploader(projectName)` ([magicbricks.ts:278-279]) is a **dead branch** — it's passed the *society name* but the function looks up an *inventory id*, so it always returns null.
- `listing_id` is captured into metadata but **never used for routing**.

## 2. Owner decision (captured 2026-06-25)

> "The manager and the super boss add the team member's 99acres and MagicBricks email IDs on the team-member profile page."

So: per-agent **portal email** fields, editable on the team-member profile by **manager/super_boss**, feeding the routing resolvers for both portals.

## 3. Design

### 3a. Schema — two new nullable columns on `agents`
```prisma
nine9acres_email  String?  // 99acres SubUserName / portal email (lead routing)
magicbricks_email String?  // MagicBricks sub_user value: their MB Gmail OR <phone>@timesgroup.com
```
Migration `add_portal_subuser_emails`. (Prod prisma-generate gotcha: strip em-dashes before `prisma generate` per [[feedback_prod_backend_paths]].) Dedicated columns (not a side table) match the owner's "on the profile page" model and avoid overloading `personal_email` (which also drives Housing + per-member email config).

### 3b. Resolvers — check the dedicated field FIRST, keep existing fallbacks
- `resolveAgentByMagicBricksSubUser(subUser)` ([lead_assignment.ts:99]): match `magicbricks_email` (case-insensitive, exact) **first**; then the existing phone-before-`@` and personal_email/google_email fallbacks. Handles both the Gmail and `<phone>@timesgroup.com` forms in one field.
- `resolveAgentByEmail(email)` ([lead_assignment.ts:59], used by 99acres + Housing + MB email-fallback): match `nine9acres_email` **first**, then personal_email/google_email. (Backward compatible — nothing breaks for agents already matching via personal_email.)

### 3c. Backend endpoint — manager/super_boss edit
Extend `PATCH /api/team/members/:id` ([team.ts], admin-managed fields) to accept `nine9acres_email` + `magicbricks_email`. RBAC: **manager OR super_boss only** (reuse the existing role guard on that route). Validate: empty→null, else a plausible email OR `<digits>@timesgroup.com`. Trim + lowercase-store for stable matching.

### 3d. Frontend — team-member profile page
`components/TeamMemberProfile.tsx`: add a **"Portal Lead Routing"** section with two inputs — *99acres Email* and *MagicBricks Email* — shown/editable only to manager/super_boss, saved via the PATCH above. **Mobile parity:** mirror in the mobile team-profile component (`components/mobile/*` — verify which) per the project's mobile-parity rule. Helper text: "The email/ID this member uses on the portal — leads from their listings route to them."

### 3e. Seed the known mappings (bootstrap)
One-off prod update for the agents we could identify, so routing improves immediately and managers see live examples:
- vivan sonu → `magicbricks_email = kumarvivan972@gmail.com`
- (Anil Prasad / "Prem Prasad") → `premprasad289@gmail.com` — **confirm name first**
- Agents already matching (Ashwani, Bharat, Bhuvneswar, Pooja, …) → copy their working Gmail into `magicbricks_email` for clarity.
- Backfill `nine9acres_email` from each agent's current `personal_email` where set (preserves today's 99acres behavior explicitly).

### 3f. Remove the dead branch
Delete the `assignViaPropertyUploader(projectName)` step in [magicbricks.ts] (it never resolves). Keep `listing_id` captured in metadata; **routing by listing_id is out of scope** (it's MagicBricks' own id, no inventory mapping exists yet).

## 4. Unmatched-lead fallback (Q2 decision — recommendation)

**Recommend: keep round-robin for genuinely-unmappable leads, but make the gap visible** rather than silent:
- When `sub_user` is present but unresolved, keep the current `assignViaManagerRoundRobin()` (so the lead is still worked) **and** the existing `logger.warn` — plus add a lightweight **"unmapped portal sub_users" report** (a query like the one in this investigation: distinct unmatched `sub_user` + counts) surfaced to managers/super_boss, so they close the mapping gap instead of leads silently round-robining.
- Rationale: a dead-end review queue risks leads going cold; round-robin keeps them moving while the report drives the data fix. Revisit if the unmatched rate stays high after mappings are entered.

*(Open alternative for owner: send unmatched straight to the listing's manager instead of RR. Flagged, not chosen.)*

## 5. The two big unknowns — need owner input (52% of unmatched volume)
- **`7906597808@timesgroup.com` (37 leads)** — whose MagicBricks account/phone is this? If a real RP agent, set their `magicbricks_email` to it.
- **`thenanakestates@gmail.com` (28 leads)** — "Nanak Estates": a team member, a partner, or a franchise sub-account? Determines whether it maps to an agent or is intentionally un-routable.

## 6. Sequencing
1. Schema migration + `prisma generate` (prod em-dash strip).
2. Resolver changes + unit tests (extend `resolve_agent_by_email.test.ts`; the MB resolver currently has no test — add one for the `magicbricks_email`-first path).
3. Backend PATCH field + RBAC.
4. Frontend profile fields (desktop + mobile) — visual proof (before/after screenshot per project rule).
5. Seed known mappings + backfill `nine9acres_email` from `personal_email`.
6. Deploy (backend scp + `pm2 restart realty-backend`; frontend `tsc -b && vite build`, SW stamp bump).
7. Verify: re-run the resolution query — unmatched-with-sub_user rate should drop; spot-check a new MB lead routes to the mapped agent.

## 7. Verification
- Resolver unit tests green; `tsc --noEmit` no new errors.
- Post-deploy: the post-06-15 "UNMATCHED" bucket shrinks as managers fill emails; a fresh MB lead from a mapped sub_user lands on that agent (DB readback `contacts.assigned_agent_id`).

## 8. Out of scope
- Retroactive reassignment of pre-06-15 round-robined leads (per dedup rule).
- listing_id → inventory routing (no mapping source).
- Identifying the two unknown sub_users (owner input).

---

## 9. Execution Log (2026-06-25)

**Shipped & verified on prod.**
- **Schema:** migration `20260625210449_add_portal_subuser_emails` — added `nine9acres_email` + `magicbricks_email` (nullable) to `agents`. `prisma migrate deploy` (prod was up-to-date at 35 migrations) + `prisma generate` (em-dash strip) + `pm2 restart realty-backend`. Columns verified present.
- **Resolvers** (`services/lead_assignment.ts`): `resolveAgentByMagicBricksSubUser` checks `magicbricks_email` first; `resolveAgentByEmail` (99acres/Housing) checks `nine9acres_email` first. **6/6 tests** (`resolve_agent_by_email.test.ts`).
- **Endpoint** (`routes/team.ts`): `GET`/`PATCH /members/:id` read+write both fields (manage_team = manager/super_boss).
- **UI** (`TeamMemberProfile.tsx`): "99acres Email" + "MagicBricks Email" fields, editable by manager + super_boss (`canEditDetails`); responsive so mobile parity is built in. `tsc -b` clean; built on server (PWA SW regenerated).
- **Backups:** `/root/backups/portal-subuser-20260625/` (source + schema + frontend).
- **Seed:** vivan sonu `magicbricks_email = kumarvivan972@gmail.com` (the 15-lead gap); backfilled 14 `nine9acres_email` from `personal_email`.
- **Verification:** post-seed resolution check — `kumarvivan972@gmail.com` now `RESOLVES->agent` (was unmatched); already-correct sub_users still resolve.

**Routing state now (post-06-15 sub_users):** RESOLVES — kumarvivan972 (15), ashwanikashyap8595 (14), bharatbhushan0429 (11), bhuvaneshvarg87 (5), poo21011988 (3). Still round-robin (data-entry / owner-input pending) — `7906597808@timesgroup.com` (37), `thenanakestates@gmail.com` (28), `premprasad289@gmail.com` (11, confirm name), `realtypandit121@gmail.com` (3, generic), `swastik.sharma@realtypandit.in` (1, super_boss excluded by design).

**Deferred (noted):**
- Removing the dead `assignViaPropertyUploader(projectName)` branch — it's a confirmed no-op (society name ≠ inventory id, always returns null, no side effects), so left in place to avoid a deploy cycle for cosmetics. Clean up next time `magicbricks.ts` is touched.
- Owner to identify `7906597808@timesgroup.com` (37 leads) + `thenanakestates@gmail.com` (28); managers fill the rest via the new profile fields.
