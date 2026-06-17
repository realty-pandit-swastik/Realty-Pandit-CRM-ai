---
name: reference_partner_multi_lead
description: Partner agents (and admin on their behalf) can add UNLIMITED leads with optional client name/phone; one client can hold buy+rent as separate deals; admin "Add Lead" attaches to an existing client instead of 409; partner-portal claims on a direct client go to a PENDING_PARTNER_CLAIM approval queue (shipped 2026-06-07)
metadata:
  type: reference
---

Shipped 2026-06-07. A partner can bring **many leads**, client **name + phone optional everywhere** (admin
panel **and** partner portal). Key behaviours now in prod:

- **Multi-requirement per client:** [`ensureDealForLead`](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/services/ensure_deal.ts#L67) idempotency is now per-**(contact, type)**, so ONE
  client can hold an active **SALE** deal *and* an active **RENT** deal (buy a house + rent an office). Two
  requirements of the SAME type still fold into one deal (known boundary). A "requirement" = a Deal
  (Transaction), which carries its own `type` + demand snapshot — the contact holds the latest.
- **Admin "Add Lead" no longer 409s** on an existing client phone ([`routes/leads.ts`](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/routes/leads.ts) POST `/`): it **attaches
  the requirement to the existing contact** (refreshes demand, preserves identity/assignment/partner link) and
  creates a 2nd deal. Add a 2nd requirement to a direct client via: **Add Lead → 👤 Client → search & select
  the existing client → enter the new requirement → Submit** (name/phone are locked/not asked once selected;
  a brand-NEW direct client still requires name+phone).
- **Partner portal** [`POST /agent/deals`](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/routes/agent.ts#L1252): `customer_name` now optional; no-phone leads use a `PENDING-` key
  (was the un-guarded `partner_lead_<ts>`).
- **Direct-client conflict → approval queue (no migration):** if a partner submits a lead whose phone matches
  one of OUR existing **direct** clients, the contact is flagged **`verification_status='PENDING_PARTNER_CLAIM'`**
  and the partner sees "pending approval". The admin **🤝 Partner Approvals** queue (top of Ext. Leads,
  `hasPermission('edit_inventory')`) → **Approve** credits the partner (reuses the **convert-to-partner**
  attribution at [leads.ts:436](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/routes/leads.ts#L436): `demand_handler_type='PARTNER'` + `demand_handler_id` + `deal_scenario='PARTNER_INTERNAL'`
  + owning-manager cascade) and activates; **Reject** strips partner attribution back to DIRECT. Endpoints:
  `POST /api/leads/:phone/approve-partner-claim` & `/reject-partner-claim`; list: `GET /api/leads/pending-partner-claims`.
- "Credit" = **attribution** (eligible for commission at deal close via the existing `DealCommissionEntry`),
  NOT an immediate payout.

Touches **website** (partner portal) too — remember the [[deploy_website_realty_user_pm2]] gotcha. Related:
[[feedback_phone_dialable_guard]] (the `PENDING-` placeholder must pass `isPlaceholderPhone`/`toDialablePhone`).
