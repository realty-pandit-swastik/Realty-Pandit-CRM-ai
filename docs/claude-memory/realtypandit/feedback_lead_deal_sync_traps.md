---
name: Lead↔Deal sync traps — coordinator, classification slugs, WA template keys, MARKETING vs UTILITY
description: Four recurring traps where lead data fails to reach the Deal pipeline or buyers, fixed 2026-05-17.
metadata:
  type: feedback
---

The Deal (Transaction) is a **snapshot** of the contact at `ensureDealForLead`
time, not a live view. **Lead⇄Deal must sync BOTH directions** (single source
of truth): `/api/leads/:phone/{reassign,requirements}` → deal, AND
`/api/deals/:id/{reassign,requirements}` → contact. Shipped 2026-05-17:
lead-side `/reassign` + `/requirements` sync the deal; deal-side `/reassign`
sets coordinator+executive+contact owner + a `lead_reassigned` interaction
(`metadata.via='deal'`); deal-side `/requirements` maps `demand_*` back to the
contact. Whenever you add a mutation on one side, wire the mirror on the other.
Recurring failure modes:

1. **Lead owner must always == deal coordinator.** `PATCH /api/leads/:phone/
   assign` synced the deal; `PATCH .../reassign` did NOT (only updated
   `contact.assigned_agent_id` + audit) → deal kept the stale
   `coordinator_agent_id`. Any new code that changes lead ownership MUST also
   `transaction.updateMany({where:{demand_contact_id, status notIn
   CLOSED_*/ON_HOLD}, data:{coordinator_agent_id, executive_agent_id}})`.

2. **Classification is stored two ways.** Manual-add / admin form store
   `category_id/sub_category_id/type_id` UUIDs (master_categories /
   master_sub_categories / master_property_types). The Deal + deal UI read the
   STRING fields `demand_category`/`demand_type_slug`. Bridge with
   `utils/classification.ts resolveDemandSlugs()` on any write that takes the
   IDs; `ensureDealForLead` also resolves as a safety net. `demand_category`
   = main category slug; `demand_type_slug` = type slug ?? sub slug.
   `Transaction` has NO sub_category column.

3. **WhatsApp template registry is keyed by LOGICAL name, not the versioned
   Meta name.** `whatsapp_templates.ts` maps `rp_buyer_lead_received` →
   `rp_buyer_lead_received_v3`. Callers must pass the logical key
   (`rp_buyer_lead_received`), NOT `rp_buyer_lead_received_v2`. Passing the
   `_vN` literal → "WhatsApp template X not found in registry" and the send
   silently fails. Audit: `grep -rn "sendTemplate(.*_v[0-9]" src`.

4. **MARKETING vs UTILITY delivery.** "Buyer confirmation template sent" in
   logs == Meta API accepted, NOT delivered. Buyer-facing welcome/lead
   templates were category **MARKETING** → WhatsApp silently drops them for
   recipients with marketing disabled (common default in India). Transactional
   acks (lead received, appointment) must be **UTILITY** category in Meta to
   deliver reliably. Re-categorizing is a Meta-dashboard task
   (`docs/runbooks/meta-template-approval.md`), not code. If users report
   "no welcome message" but logs say "sent" → check template CATEGORY first.

Shipped + backfilled 2026-05-17. Detail:
`docs/plans/2026-05-17-deal-sync-and-welcome-investigation.md`.
Related: [[feedback_lead_assignment_dedup]], [[feedback_phone_normalization]],
[[reference_test_tsc_baseline]], [[reference_prod_db_script_pattern]].
