# Daily Lead Recycler — drain the un-worked stock (one-time, 10/agent/day)

> **For agentic workers:** BullMQ scheduled job. Lane `wt/backend`. Build → tsc (diff vs 381) → vitest (pick logic) → commit → merge → deploy → **run once for ONE agent + verify** → enable for all. TDD where possible; reuse, don't rebuild.

**Goal:** Each day, take **10 oldest un-converted leads per team member**, turn each into a **fresh NEW deal** (same member, fires the "call this lead in 30 min" Calendar/Task/push) **and** re-engage the customer with a matching card. Each lead is recycled **exactly once**; the job runs daily until the ~1,152 backlog is drained (~31 days), then idles. No perpetual loop, no auto-close.

## Decisions (owner-confirmed 2026-06-12)
- **Engage both**: create the deal + notify the agent **and** send the customer a fresh property card (if matchable).
- **Once only**: each lead recycled a single time; 10/member/day; keep the **same** assigned member; oldest-first; continue until all reassigned.
- Skip junk/placeholder phones; bound customer sends to the 10/member/day cap (WhatsApp quality).

## Building blocks (all exist — verified)
- `services/ensure_deal.ts#ensureDealForLead({contactPhone, source, assignedAgentId})` → creates a NEW deal for a contact with no active deal, keeps the agent, side-effect kicks off the qualification cadence + the new-lead Calendar/Task/push ([[project_google_reminder_sync]]). Idempotent (returns existing active deal unchanged — so only truly un-converted leads get a new deal).
- `services/property_sharing.ts#shareNextProperty(dealId)` → sends one v5 card (or graceful "we'll keep looking"); has the 50% floor + Fix D budget guard.
- `queues/workers/scheduled_worker.ts` → `scheduledJobsQueue.upsertJobScheduler(name, {pattern}, …)` + switch handler (cron in UTC; 9 AM IST = `'30 3 * * *'`). NOT node-cron ([[feedback_legacy_cron_is_dead]]).
- `lead_recycled` interaction = the once-only marker (no schema change).

## Files
- Create: `agents/backend/src/services/lead_recycler.ts`
- Create: `agents/backend/src/__tests__/lead_recycler.test.ts`
- Modify: `agents/backend/src/queues/workers/scheduled_worker.ts` (register job + handler case)
- Modify: `agents/backend/src/agents/admin_agent.ts` (`getOwnerDigest` — add the recycler line)

---

## Task 1 — `lead_recycler.ts`: the pure pick + a runnable recycle
- [ ] **Test first** (`lead_recycler.test.ts`): export a pure `pickForAgent(leads, recycledSet, dealSet, limit=10)` that returns the **10 oldest** un-converted, not-recycled, non-junk leads.
```ts
import { describe, it, expect } from 'vitest';
import { pickForAgent, isJunkPhone } from '../services/lead_recycler';
describe('pickForAgent', () => {
  const L = (p: string, d: string) => ({ phone_number: p, created_at: new Date(d), name: 'x' });
  it('takes oldest first, skips converted/recycled/junk, caps at limit', () => {
    const leads = [L('+919000000001','2026-05-01'), L('+919000000002','2026-04-01'), L('+TEMP_x','2026-03-01'), L('+919000000003','2026-03-15')];
    const out = pickForAgent(leads as any, new Set(['+919000000001']) /*recycled*/, new Set() /*hasDeal*/, 10);
    expect(out.map(x=>x.phone_number)).toEqual(['+919000000003','+919000000002']); // +TEMP_ junk dropped, recycled dropped, oldest first
  });
  it('isJunkPhone', () => { expect(isJunkPhone('+TEMP_a')).toBe(true); expect(isJunkPhone('+919000000003')).toBe(false); });
});
```
- [ ] Run → fails. Implement `isJunkPhone` (`!/^\+\d{10,15}$/.test(ph) || /TEMP|PENDING/i.test(ph)`) + `pickForAgent` (filter dealSet/recycledSet/junk, sort `created_at` asc, slice limit). Run → passes. Commit.

## Task 2 — `recycleOneLead(contact)` + `runDailyRecycle()`
- [ ] `recycleOneLead(contact)`: `const r = await ensureDealForLead({ contactPhone: contact.phone_number, source: 'recycled_stock', assignedAgentId: contact.assigned_agent_id })`. If `r.created` and the deal has matchable criteria (location/budget/bhk present) → `await shareNextProperty(r.dealId).catch(()=>{})`. Always log a `lead_recycled` interaction `{ tenant_id, phone_number, channel:'system', direction:'outbound', event_type:'lead_recycled', content:'recycled stock → fresh deal', metadata:{ deal_id:r.dealId, agent:contact.assigned_agent_id } }`. Wrap per-lead in try/catch (one failure never blocks the batch).
- [ ] `runDailyRecycle({ dryRun=false, perAgent=10 })`: load all BUYER/TENANT/UNKNOWN assigned contacts; build `dealSet` (distinct `demand_contact_id` in transactions) + `recycledSet` (distinct phone with a `lead_recycled` interaction); group by `assigned_agent_id`; for each **active** agent → `pickForAgent(list, recycledSet, dealSet, perAgent)` → recycle each (skip when dryRun). Return `{ agents, recycled, cardsSent, remaining }`. Commit.

## Task 3 — register the daily job
- [ ] In `scheduled_worker.ts`, add a scheduler: `upsertJobScheduler('lead-recycler', { pattern: '30 3 * * *' } /*9 AM IST*/, { name:'lead-recycler', data:{} })` + a `case 'lead-recycler': await (await import('../../services/lead_recycler')).runDailyRecycle({}); break;`. Idempotent (safe on every restart). Commit.

## Task 4 — owner digest line
- [ ] In `admin_agent.getOwnerDigest`, add a query for today's `lead_recycled` interactions + the remaining backlog, and a line: `♻️ Recycled <n> stock leads today · <remaining> left.` Commit.

## Verification
1. `npx tsc --noEmit` → 381 baseline; `npx vitest run lead_recycler` → green.
2. **Day-1 dry-run already produced** (read-only): 200 leads / 28 agents, longest drain ~31 days, 6 junk skipped (this doc's run).
3. Deploy. **Run once for ONE agent only** (`runDailyRecycle({ perAgent:10 })` scoped to a test agent, or a manual invoke) → confirm: N deals created (status NEW, same agent), the agent got the Calendar/Task/push, matchable ones got a card, each has a `lead_recycled` marker, re-running does NOT re-pick them.
4. Enable the cron for all; watch the digest count + the daily volume.

## Rollback
The marker + deals are additive. To stop: remove the scheduler (redeploy). To undo a run: close the created deals (`status=CLOSED_LOST, close_reason='recycler_rollback'`) — the `lead_recycled` markers can stay (they just prevent re-pick). No schema change to revert.
