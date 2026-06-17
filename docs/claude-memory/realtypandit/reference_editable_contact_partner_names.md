---
name: Editing contact / partner-agent names — routes + cascade (2026-05-30)
description: How to rename a Contact or PartnerAgent in the admin panel and how the change cascades to all stores. Names used to be write-once (no edit route existed).
metadata:
  type: reference
---

Before 2026-05-30, contact/partner **names were write-once** — no admin endpoint wrote
`Contact.name` or `PartnerAgent.name`, and the UI showed them read-only. (Surfaced by the
corrupted owner `+919650720167` named "I have the key" — a `key_holder_type` UPLOADER option
label that leaked into the contact name ~2026-05-11; the client couldn't fix it.)

## Now (deployed 2026-05-30)

**Permission:** new `edit_contact` in `config/permissions.ts` → super_boss + manager only.

**Backend routes:**
- `PATCH /api/leads/:phone` (`checkPermission('edit_contact')`) — body `{name?, email?}`. (Note:
  distinct from the existing `/:phone/status`, `/:phone/requirements`, `/:phone/reassign`.)
- `PATCH /api/partners/:id` (`checkPermission('manage_agents')`) — body `{name?, email?, company_name?, city?, agency_name?}`.

**The cascade — `services/contact_identity.ts#syncContactName(tx, phone, oldName, newName)`:**
both routes call it inside a `$transaction`. It updates, by phone:
1. `contacts.name`
2. `partner_agents.name` (a `PARTNER_AGENT` has a name in BOTH tables — keep them in lock-step)
3. denormalized **`inventory.uploader_name` / `key_holder_name`** — but ONLY rows where they
   still equal the OLD name (so a legitimately different uploader isn't clobbered).

So a single rename self-heals everywhere. `inventory.uploader_name`/`key_holder_name` are
**snapshots, not FKs** — that's why the cascade is needed.

**Frontend:** Name+Save field in `ExternalLeads.tsx` lead detail (privileged-gated); ✎ per-row
edit (via `window.prompt`) in `PartnerManagement.tsx`, calling `updatePartner` / `updateContactIdentity`
in `api/client.ts`. A `PARTNER_AGENT` owner is NOT in the leads list (filtered to buyers/tenants)
→ edit it from **Partner Management**, not External Leads.

Plan: `docs/plans/2026-05-30-editable-contact-partner-names.md`.

## 2026-05-31 — the ✎ name-edit was SUPERSEDED by a full Partner Profile page
Puneet wanted a full profile/management surface, not a one-field edit ([[feedback_dont_underscope_fixes]]).
Shipped `frontend/components/PartnerProfile.tsx` — a **full-page** view (rendered in place of the
list by `PartnerManagement.tsx` when `profileId` is set; open via the blue partner-name link or the
**Manage** button; ← Back returns to the list). Sections: header (badges + Verify/Suspend/Reassign
quick-actions) · editable Profile form (name/email/company/agency/business/address/city/partner_type/
category/listing_limit/priority_score/commission_rate/subscription dates; **phone read-only**) · tabs
Listings/Leads & Deals/Commissions/Sub-agents · Account (set portal password). The ✎ name button was
removed. Backend endpoints (all `manage_agents`, non-super_boss gated by `managing_agent_id`):
`GET /api/partners/:id` (detail + `sub_agents` + `_counts`), `GET /partners/:id/leads`,
`GET /partners/:id/commissions`, `POST /partners/:id/set-password`; `PATCH /partners/:id` extended to
the full editable set (still cascades name via `syncContactName`). Listings reuse existing
`GET /partners/:id/inventory`. Plan: `docs/plans/2026-05-30-partner-agent-profile-management.md`.
