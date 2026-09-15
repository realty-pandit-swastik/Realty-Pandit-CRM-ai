# Runbook — Staff-as-owner cleanup + the "Owner To Be Entered" placeholder

**Date:** 2026-07-28 · **Owner directive:** remove the staff member's name+number from the
owner field on every listing where a team member was recorded as the property owner, and make
agents enter the REAL owner (or partner agent). Chosen enforcement: **flag + worklist, no blocking.**

## What was done

- **466 inventory rows** (455 active) had an active team member as `owner_phone` (detected by
  last-10-digit match against active `agent.phone`). Concentrated: Bhuvneswar Gupta 164, Ashwani 82…
- The real owner was **not recoverable** (`key_holder_contact_id` was null on all 466 — the agent
  never captured the real owner). So this is a **human re-entry** task, not an automated repair.
- Each row's owner was **detached to a placeholder owner** and `assigned_agent_id` preserved.

## The placeholder-owner convention (IMPORTANT — lasting)

Two placeholder owners represent "owner not entered yet":

| Contact phone | Owner scope | Meaning |
|---|---|---|
| `+910000000000` | INTERNAL | staff-as-owner detached, was INTERNAL (441 rows) |
| `+910000000001` | EXTERNAL / INDIVIDUAL_AGENT | staff-as-owner detached, was external-agent (25 rows) |

Both placeholder Contacts are named **"Owner To Be Entered"**, `contact_type = LANDLORD` (so they
never leak into the Leads list), each with a FREE subscription so the **matching tier is unchanged**
(INTERNAL→INTERNAL, EXTERNAL+FREE→FREE). **Treat any inventory whose `owner_phone` is one of these
two as "owner pending re-entry" — never as a real owner.** The live re-entry queue is simply
`inventory where owner_phone IN (+910000000000, +910000000001)`.

## The flag (how agents see it)

`routes/inventory.ts` computes `needs_owner_fix` per tile — it was patched (commit `ec934c4`) so the
placeholder phones ALSO set it true. The frontend renders the badge **"⚠ Add owner details"**
(`InventoryList.tsx` + `MobileInventoryList.tsx`) — already existed, no frontend deploy. The badge
stays lit until an agent edits the property and enters the real owner. The #9 railguard
(`activeStaffOwnerName`, create/edit/owner-change) still blocks re-entering a staff member as owner.

## Artifacts

- **Rollback snapshot:** `/root/backups/staff_owner_detach_snapshot_20260728.json` — full per-row map
  of the original `owner_id` / `owner_phone` / `owner_contact_id` / scope / staff name. To revert a
  row, write these three fields back from the snapshot.
- **Per-agent re-entry worklist:** `docs/archive/2026-07-28-staff-owner-reentry-worklist.csv`
  (grouped by assigned agent, active-first, with address + the removed staff name).

## Follow-ups

- Hand each agent their slice of the worklist; re-entry uses the normal owner-entry flow (which
  captures owner vs partner-agent + real phone).
- When re-entry is largely complete, the placeholder owners/contacts can be retired (only once no
  inventory points at them).
