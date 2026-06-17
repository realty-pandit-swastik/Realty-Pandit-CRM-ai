---
name: feedback-webhook-lead-visibility
description: Webhook leads created via prisma.contact.upsert bypass the $extends auto-assign and become invisible in the Leads section
metadata:
  type: feedback
---

`prisma.contact.**upsert**` does NOT trigger the `db.ts` `$extends` `contact.create` hook. That hook does two things: (1) auto-assigns WhatsApp/voice-source leads to Sunny, (2) fires new-lead alerts (WhatsApp + push). Any code path that creates a contact via `upsert` (or `update`) silently skips BOTH.

**Why this is a critical gap:** a contact with `assigned_agent_id = null` AND `created_by = null` is hidden by `buildContactVisibilityFilter` ([middleware/contact_visibility.ts](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/middleware/contact_visibility.ts)) for every role except `super_boss` — so it does **not** appear in the **Leads section** for managers/employees. It *does* appear in the **Deal Pipeline** (different scoping), so the classic symptom is **"lead shows in Deal Pipeline but not in Leads."** This is exactly why Facebook lead-ad leads were "missing" (2026-05-17).

**Confirmed instance & fix:** `integrations/facebook.ts handleLeadgenEvent` used `prisma.contact.upsert` → Facebook ad leads landed unassigned/ownerless → invisible in Leads. Fixed 2026-05-17 by resolving Sunny via `resolveSunnyAgentId` from `services/new_lead_alerts` and setting `assigned_agent_id` on the upsert **create** branch only (never the update branch — don't reassign an already-owned/reassigned lead). Non-fatal try/catch so a resolver failure still saves the lead.

**How to apply:** any new inbound lead creator (webhooks, integrations, importers) MUST either (a) go through `prisma.contact.create`, or (b) if it must `upsert`, explicitly set `assigned_agent_id` (resolveSunnyAgentId) AND fire `fireNewLeadAlerts` itself. Otherwise the lead is invisible to the team and triggers no alert. When a user says "ad/webhook leads not in Leads but in Deal Pipeline" → this is the cause. Related: [[reference_new_lead_alerts]], [[feedback_meta_ctw_ads]], [[leads_system]].
