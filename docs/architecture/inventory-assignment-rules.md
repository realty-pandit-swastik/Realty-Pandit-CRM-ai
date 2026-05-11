Two business rules implemented 2026-04-21:

## Rule 1 — New inventory auto-assigns to uploader

**Where**: `agents/backend/src/routes/inventory.ts`
- `POST /inventory` (admin panel upload): `assigned_agent_id: req.agent!.id` added alongside `uploaded_by_agent_id`
- `POST /inventory/commit` (WhatsApp bot): `assigned_agent_id: uploadedByAgentId || undefined` added

**Why:** 193 out of 232 inventories had no assigned agent because the upload flow never set `assigned_agent_id`. Rule: if not explicitly assigned, default to the person who uploaded it.

## Rule 2 — Deactivated agent's assets cascade to Sunny Sharma

**Where**: `agents/backend/src/services/ownership_service.ts` — `cascadeOnAgentDeactivation()`
- Added `inventory.updateMany({ where: { assigned_agent_id: agentId } })` → super_boss
- Added `leads.updateMany({ where: { assigned_agent_id: agentId } })` → super_boss
- The existing cascade already handled `owning_manager_id` for inventory/contacts/transactions — this plugged the gap for `assigned_agent_id`

**Why:** Deleted/inactive agents left orphaned inventory and leads with no one responsible.

**Sunny Sharma = Savikant Sharma** in the DB — ID: `503ebb67-9005-4d71-b167-36e900c1423b`, role: `super_boss`, phone: +91 99999 92400. All orphaned assets go to him.

## Backfill done 2026-04-21
- 188 inventories → assigned to their uploader
- 5 orphaned (uploader physically deleted from DB) → assigned to Sunny Sharma
- 0 unassigned remain
