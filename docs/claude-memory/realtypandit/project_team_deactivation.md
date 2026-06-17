---
name: Team Deactivation Workflow
description: Deactivating a team member is now a TWO-STEP UI: transfer assets first, then flip status. Backend rejects direct deactivation if assets remain. New endpoints + cleanup scripts.
metadata:
  type: project
---

**Canonical doc:** [`docs/plans/2026-05-12-lead-mgmt-cleanup-plan.md`](clients/sunny-sharma/projects/reality-pandit/docs/plans/2026-05-12-lead-mgmt-cleanup-plan.md) (status: SHIPPED).

**Current production behavior (as of 2026-05-12 deploy):**

1. **Deactivating a team member is two-step.** Old single-click cascade-to-super_boss is gone for the UI path. New flow:
   - Step 1 = transfer the agent's assets to a chosen successor (any active agent, defaults to super_boss in the picker)
   - Step 2 = once all asset counts hit zero, the `Deactivate` button activates and flips the status
   - The backend route `PATCH /api/team/members/:id/deactivate` REJECTS with **400 + `requires_transfer: true`** if any assets remain. The cascade safety net in `ownershipService.cascadeOnAgentDeactivation` is still present but no longer the UX path.

2. **New endpoints / service methods:**
   - `POST /api/team/members/:id/transfer-assets` body `{ to_agent_id, asset_types?, reason? }` — bulk reassignment (super_boss-gated)
   - `ownershipService.transferAssets(fromId, toId, performedBy, options)` — service method, idempotent
   - `PATCH /api/leads/:phone/mark-lost` body `{ reason?, note? }` — sets `lead_status='lost'` + `lifecycle_stage='CLOSED_LOST'` AND closes any open deals for that contact via the deal state machine

3. **New UI affordances:**
   - `TeamDeactivateDialog` rewritten as the two-screen wizard (Transfer → Deactivate)
   - `ChatView` + `MobileChatView` now have a red **❌ Mark Lost** button next to `🚨 No-Show`

4. **Bug fixes baked into the cascade itself (Bug C):**
   - `cascadeOnAgentDeactivation` now also clears `Contact.assigned_agent_id` (was missing — caused orphans for ~19 records historically)
   - `getOwnershipSummary` now matches the cascade exactly (was undercounting `assigned_agent_id` rows)

5. **One-shot maintenance scripts at `agents/backend/scripts/`:**
   - `cleanup-deactivation-orphans.ts` — idempotent flush of any assets still pointing at inactive agents (already ran 2026-05-12, moved 19 records to super_boss)
   - `migrate-lead-status-new-to-cold.ts` — idempotent migration of `lead_status='NEW'` → `'cold'` (Bug D — fixed 12 rows on 2026-05-12)

6. **Bug D — dashboard pills now reconcile:** root cause was `workflow_engine.ts` writing `lead_status='NEW'` (a `lifecycle_stage` value, not a `lead_status` value) on LANDLORD/PARTNER_AGENT creation. Code fixed (3 sites stripped), data migrated, new `❌ LOST` tile added to dashboard. Math now reconciles: `HOT + WARM + COLD + LOST = totalContacts`.

**Why:** today's session uncovered that the team-deactivation UX was silently broken (Bug 1 CSRF + Bug 2 Prisma + Bug C cascade gap), the dashboard math didn't reconcile (Bug D), and there was no lead-level lost path. All shipped 2026-05-12 with Playwright verification.

**How to apply:**
- When asked to add an "offboard X" feature, use the existing two-step wizard, do not reintroduce single-click cascade
- When closing a buyer lead, prefer `/api/leads/:phone/mark-lost` over creating a fake deal
- When fixing data-integrity issues for inactive agents, re-run `cleanup-deactivation-orphans.ts` first to baseline
- When a contact has `lead_status` outside `{cold, warm, hot, closed, lost}`, suspect another code path mixing up `lifecycle_stage` with `lead_status` — grep for `lead_status: '` to find writers
- Related: [[feedback-verify-before-done]] — each of the above was verified live via Playwright before being marked done
