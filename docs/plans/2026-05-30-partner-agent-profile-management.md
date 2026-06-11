# Plan — Partner Agent profile & management page

**Date:** 2026-05-30
**Author:** Claude (for Puneet)
**Status:** PROPOSED — not executed (plan only)

## Goal

Replace the ad-hoc ✎ name-edit (2026-05-30, too narrow) with a **full Partner Agent profile
page**: open a partner from the Partner Agents list → see/edit their **complete profile** and
**manage** them (status, verification, manager, plan, password) and **see their assets**
(listings, referred leads/deals, commissions, sub-agents) in one place. Mirrors the proven
`TeamMemberProfile.tsx` pattern.

## Codebase findings (studied 2026-05-30)

**`PartnerAgent` model fields** (`schema.prisma` ~903-970) — what a profile can show/edit:
- Identity: `name`, `email`, `phone_number` (PK — immutable), `company_name`, `city`
- Business: `business_name`, `business_address`, `registration_number`, `agency_name`,
  `partner_type` (HAS_PROPERTIES/HAS_BUYERS/BOTH), `partner_category` (INDIVIDUAL/COMPANY)
- Plan/limits: `package_type` (FREE/PRO/ADVANCE_PRO), `listing_limit`, `priority_score`,
  `commission_rate`, `subscription_start`, `subscription_end`
- Status: `status` (ACTIVE/SUSPENDED/EXPIRED/PENDING_PAYMENT), `verified`
- Relations: `managing_agent` (internal coordinator), `parent_partner`/`sub_agents` (company
  hierarchy), `referred_inventory` (Inventory[]), `commission_entries_received`
  (DealCommissionEntry[]), `reassignment_logs`
- Auth/onboarding: `password_hash`, `onboarded_by_agent_id`, `onboarded_at`

**Existing partner routes** (`routes/api.ts`):
- `POST /partners` (create) · `GET /partners` (list) · `GET /partners/search`
- `PATCH /partners/:id` (name/email/company/city/agency — **added today; will extend**)
- `PATCH /partners/:id/verify` · `/status` · `/commission` · `/package`
- `GET /partners/:id/inventory` (listings — already exists)
- `POST /partners/:id/reassign` (transfer manager + assets — `PartnerReassignDialog`)
- **MISSING: `GET /partners/:id`** (full detail + relations + counts)

**Current UI** (`PartnerManagement.tsx`): list (desktop table / mobile cards) + register form +
inline actions (Verify / Suspend·Activate / package `<select>` / Reassign) + the ad-hoc ✎ name
edit. **No detail/profile page.**

**Reference pattern**: `TeamMemberProfile.tsx` — opened from `TeamManagement`, fetches
`getTeamMemberProfile(id)`, has `editMode`+`editForm`, manager reassignment, password panel.
Partner self-service profile precedent: `MyProfile.tsx` + `routes/agent.ts` (partner auth).

## Decisions (locked 2026-05-30, Puneet)
1. **Full separate page** (not a slide-over). The admin SPA has **no URL router** (see
   [[reference_public_route_hoist_pattern]]) → add a new **state-based view** in `App.tsx`
   (e.g. `view='partner-profile'` + `selectedPartnerId`), opened from a partner row, with a
   **← Back to Partner Agents** button. Mirror `TeamMemberProfile`'s internals (data load, edit
   form, panels) but render as a full page, not an overlay.
2. **Edit scope:** profile Save edits identity + business + plan/limits/commission/subscription.
   **Verify** and **Suspend/Activate** stay as separate one-click quick-actions (list + page header).
3. **All 4 asset tabs in v1:** Listings, Leads & Deals, Commissions, Sub-agents.
4. **Phone read-only** (it's the PK + contact/WhatsApp link; rename = a separate migration).

## Design

A **full Partner Profile page** (mirror `TeamMemberProfile` internals), opened by clicking a partner
row; keep Verify/Suspend/Reassign quick-actions in the list too. Sections:

1. **Header** — name, phone, category badge, status, verified badge; quick Verify/Suspend.
2. **Profile (editable form)** — Edit toggle → all editable fields above. Save → `PATCH /partners/:id`.
   Phone read-only (PK; rename-phone is a separate migration concern). Name change cascades to
   contact + inventory via `syncContactName` (already wired).
3. **Manager** — current managing agent + Reassign (reuse `PartnerReassignDialog`).
4. **Plan & commission** — package, listing_limit, priority_score, commission_rate, subscription dates.
5. **Listings** — count + list from `GET /partners/:id/inventory` (exists).
6. **Leads & Deals** — referred contacts/deals (contacts where `referral_partner_id = :id`). [new endpoint]
7. **Commissions** — `commission_entries_received` summary. [new endpoint or include in detail]
8. **Sub-agents** — if COMPANY: `sub_agents` list. [from detail]
9. **Account** — set/reset partner portal password (mirror `setMemberPassword`); onboarding info.

## Work breakdown

### Backend
1. **`GET /api/partners/:id`** (`checkPermission('manage_agents')`) — partner + `managing_agent`,
   `sub_agents`, counts (`_count` of `referred_inventory`, referred contacts, commission entries),
   recent commissions. One payload to drive the profile.
2. **Extend `PATCH /api/partners/:id`** to accept the full editable set: `business_name`,
   `business_address`, `registration_number`, `partner_type`, `partner_category`, `listing_limit`,
   `priority_score`, `commission_rate`, `subscription_start`, `subscription_end` (keep
   name/email/company/city/agency + the `syncContactName` cascade). Validate enums.
3. **`GET /api/partners/:id/leads`** — referred contacts/deals (paginated). (Or reuse an existing
   contacts filter by `referral_partner_id`.)
4. **`POST /api/partners/:id/set-password`** — admin sets partner portal password (mirror member).
   (verify/status/commission/package routes stay; profile Save can also fold status/package or
   keep them as dedicated quick-actions — TBD in build.)

### Frontend
5. **New `PartnerProfile.tsx`** (mirror `TeamMemberProfile.tsx`) — slide-over with the sections above,
   edit form, save, manager/plan/password panels, listings/leads/commissions tabs.
6. **`PartnerManagement.tsx`** — row click → open `PartnerProfile`; **remove the ad-hoc ✎ name button**
   (superseded). Keep list quick-actions.
7. **`api/client.ts`** — add `getPartner(id)`, `getPartnerLeads(id)`, `setPartnerPassword(id, pw)`;
   extend `updatePartner` field set.
8. Mobile parity (PartnerManagement has separate mobile cards — see [[feedback_mobile_components]]).

### Verify / deploy
- Backend ts-node transpileOnly + `pm2 restart realty-backend`; frontend `tsc -b && vite build`
  ([[feedback_frontend_build_verify]]); md5-parity before scp; Playwright screenshot of the new
  profile page ([[feedback_browser_qa]]); employee→403 check.

## Open questions — RESOLVED (see Decisions above)
Full page · edit identity/business/plan (status/verify = quick actions) · all 4 tabs in v1 ·
phone read-only.

## Build sequence (once approved)
1. Backend: `GET /partners/:id` (detail + `managing_agent` + `sub_agents` + counts + recent
   commissions); extend `PATCH /partners/:id` to the full editable set; `GET /partners/:id/leads`;
   `GET /partners/:id/commissions`; `POST /partners/:id/set-password`. (Listings = existing
   `GET /partners/:id/inventory`.)
2. Frontend: `api/client.ts` fns; new full-page `PartnerProfile.tsx` (header + Profile edit +
   Manager + Plan + 4 tabs + Account); `App.tsx` view wiring + back button; `PartnerManagement.tsx`
   row-click → open profile, **remove the ✎ name button**; mobile parity.
3. Verify: md5-parity → scp → backend restart → `tsc -b && vite build` → Playwright screenshot of
   the new page → employee 403 check.

## Notes
- This **supersedes** the ✎ name-edit shipped earlier today; that was an under-scoped fix — the
  proper solution is this profile page. The backend `PATCH /partners/:id` + `syncContactName`
  cascade built today are reused (extended), not thrown away.
- The corrupted `+919650720167` "I have the key" record can be fixed from this page once shipped
  (or via the existing ✎ / a direct rename in the meantime).
