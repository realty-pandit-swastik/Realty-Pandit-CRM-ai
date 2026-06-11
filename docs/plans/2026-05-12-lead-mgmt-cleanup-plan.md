# Plan — Lead Management Cleanup (Categorization, Deactivation Reassignment, Lost-Lead UI)

**Status:** ✅ SHIPPED 2026-05-12 — Phases 1, 2, 3, 4 all live and Playwright-verified on production. Phase 5 (UNKNOWN categorization) deferred per your call.
**Date:** 2026-05-12
**Trigger:** Investigation into "per-team-member counts don't sum to 1571" + how to mid-flow close leads/deals

## TL;DR — what this plan delivers

1. **Bug C fix** — agent deactivation cascade now also clears `Contact.assigned_agent_id` so future deactivations don't orphan contacts.
2. **One-shot orphan cleanup** — flush the 19 existing orphans (Navneet's 2 inventory, Shashank's 2 contacts, Ankit's 15 contacts) to super_boss with a single Prisma script.
3. **Two-step Reassign-then-Deactivate UX** — new "Transfer Assets" workflow that lets the admin split a leaving team member's pipeline across multiple successors *before* clicking deactivate.
4. **Mark Lead Lost button** on the contact profile — close a lead without forcing a deal creation.
5. **UNKNOWN categorization deferred** — investigation found zero hidden non-lead types (key holders / owners / builders / sellers). Recommendation is to auto-categorize the 140 active ones as BUYER but **NOT NOW** per your instruction. Documented for future.

---

## Investigation results — what the codebase actually does today

### Cascade coverage (current)

`OwnershipService.cascadeOnAgentDeactivation` at [services/ownership_service.ts:120](../../agents/backend/src/services/ownership_service.ts#L120) currently transfers, in one DB transaction:

| Entity / field | Status | Notes |
|---|---|---|
| `PartnerAgent.managing_agent_id` | ✅ Covered | line 131 |
| `Inventory.owning_manager_id` | ✅ Covered | line 135 |
| `Inventory.assigned_agent_id` | ✅ Covered | line 139 |
| `Lead.assigned_agent_id` | ✅ Covered (fixed today) | line 145 |
| `Contact.owning_manager_id` | ✅ Covered | line 149 |
| **`Contact.assigned_agent_id`** | ❌ **MISSING (Bug C)** | needs new updateMany |
| `Transaction.owning_manager_id` | ✅ Covered | line 153 |
| `Agent.status = inactive` | ✅ Covered | line 157 |

`getOwnershipSummary` (the cascade preview shown in the deactivation dialog) misses the same `Contact.assigned_agent_id` count too.

### Existing reassign endpoints (per-record)

These already exist and are well-isolated:

| Endpoint | Purpose |
|---|---|
| `POST /api/partners/:id/reassign` (super_boss only) | Move a partner agent to a different manager — calls `ownershipService.reassignPartner` |
| `PATCH /api/deals/:id/reassign` | Reassign a deal's coordinator |
| `PATCH /api/transactions/:id/reassign` | Reassign a transaction's owning manager |
| `PATCH /api/workflow-tasks/:id/reassign` | Reassign a task |
| `PATCH /api/leads/:phone/assign` | Assign/reassign a buyer lead |
| `POST /api/inventory/:id/transfer` | Transfer ownership of an inventory listing |
| `POST /api/inventory/:id/transfer-ownership` | Same, with more options |
| `POST /api/internal-tools/reassign-lead` | For voice-bot triggered reassignments |

What is **MISSING**: a single bulk endpoint "transfer everything owned by agent X to agent Y" — useful both for offboarding (today's need) and load-balancing.

### Deactivation paths

There is only ONE deactivation endpoint: `PATCH /api/team/members/:id/deactivate` at [routes/team.ts:380](../../agents/backend/src/routes/team.ts#L380). It internally calls `cascadeOnAgentDeactivation` if `status='inactive'`. No other code path flips an agent to inactive.

### Existing orphans on production (as of 2026-05-12)

| Agent | Status | Orphaned contacts (assigned_agent_id) | Orphaned inventory |
|---|---|---|---|
| Ankit singh | inactive (today) | **15** | 0 |
| Shashank Singh | inactive | **2** | 0 |
| Navneet Singh | inactive | 0 | **2** |
| Sonia | inactive (today, post-fix) | 0 | 0 ✓ |

**Total: 19 orphans.** All from pre-fix deactivations where the cascade rolled back due to Bug 2 (`tx.leads` typo).

### UNKNOWN contacts deep-profile (154 records)

Queried prod DB for cross-references with other tables. Findings:

| Sub-bucket | Count | Interpretation |
|---|---|---|
| Active leads (have interactions/leads/deals) | 140 | Real demand-side leads, just untagged. Safe to auto-mark as BUYER. |
| Named with no activity | 14 | Mix of legit names (Davender Malhotra, Saurabh Goyal) and obvious junk ("Sir" with TEMP_xxx phone, "Not Mentioned", "THE LEGEND PERFECTIONIST DICTATOR KD SINGHANIA"). Manual review or deletion. |
| Anonymous, no activity | 7 | Likely import junk. |
| **Key holders** | **0** | Database says NONE of the UNKNOWN are linked as a property keyholder. |
| **Property owners** | **0** | NONE own a property. |
| **Builder leads** | **0** | NONE have a builder_lead record. |
| **On supply side of any deal (sellers)** | **0** | NONE are participating as seller. |

**Conclusion:** the worry that UNKNOWNs might secretly be key-holders or sellers is **not backed by the data**. Every UNKNOWN with any real engagement is on the buyer side. The remaining ~21 with no engagement are import junk or test entries.

By source:
- 99acres: 119 (typical of 99acres imports — names but no intent until follow-up)
- manual: 17
- whatsapp: 9
- voice: 9

---

## PHASES

### Phase 1 — Bug C fix (cascade + summary)

**Files:** `agents/backend/src/services/ownership_service.ts`

**Change 1** (cascade — line 149 region): add a SECOND `contact.updateMany` for `assigned_agent_id`:

```ts
const contactsOwned = await (tx as any).contact.updateMany({
    where: { owning_manager_id: agentId },
    data: { owning_manager_id: targetAgent.id },
});
// NEW: also clear assigned_agent_id
const contactsAssigned = await (tx as any).contact.updateMany({
    where: { assigned_agent_id: agentId },
    data: { assigned_agent_id: targetAgent.id },
});
```

**Change 2** (getOwnershipSummary): include the assigned counts so the deactivation dialog preview is accurate:

```ts
async getOwnershipSummary(agentId: string) {
    const [partners, invOwned, invAssigned, contactsOwned, contactsAssigned, leadsAssigned, transactions] = await Promise.all([
        prisma.partnerAgent.count({ where: { managing_agent_id: agentId } }),
        (prisma as any).inventory.count({ where: { owning_manager_id: agentId } }),
        (prisma as any).inventory.count({ where: { assigned_agent_id: agentId } }),
        (prisma as any).contact.count({ where: { owning_manager_id: agentId } }),
        (prisma as any).contact.count({ where: { assigned_agent_id: agentId } }),
        (prisma as any).lead.count({ where: { assigned_agent_id: agentId } }),
        (prisma as any).transaction.count({ where: { owning_manager_id: agentId } }),
    ]);
    return {
        partners,
        inventory: invOwned + invAssigned,
        contacts: contactsOwned + contactsAssigned,
        leads: leadsAssigned,
        transactions,
    };
}
```

**Verification:** unit test + Playwright check of the preview dialog against Sonia (who now has 0) and Ankit (has 15).

**Effort:** ~15 min code, ~10 min verify.

---

### Phase 2 — One-shot orphan cleanup (19 records)

**Files:** new `agents/backend/scripts/cleanup-deactivation-orphans.ts`

A Prisma script that runs once on the server:

```ts
// Pseudocode — full script will live in scripts/ and be runnable via `node -r ts-node/register/transpile-only scripts/cleanup-deactivation-orphans.ts`
const inactives = await prisma.agent.findMany({ where: { status: 'inactive' } });
const superBoss = await prisma.agent.findFirst({ where: { role: 'super_boss', status: 'active' } });

await prisma.$transaction(async (tx) => {
    for (const agent of inactives) {
        // run the SAME logic as cascadeOnAgentDeactivation but only for fields that still point to this inactive agent
        const counts = await ownershipService.cascadeOnAgentDeactivation(agent.id, superBoss.id);
        console.log(`Reassigned for ${agent.name}:`, counts);
    }
});
```

But — `cascadeOnAgentDeactivation` also calls `tx.agent.update({status: 'inactive'})` which is a no-op for already-inactive agents, so we can reuse it as-is.

**Expected output (based on today's prod data):**
- Ankit singh: 15 contacts → super_boss
- Shashank Singh: 2 contacts → super_boss
- Navneet Singh: 2 inventory → super_boss
- Sonia: 0 (already clean)
- Logged + idempotent — running twice is harmless.

**Verification:** re-run the count script from earlier; expect "0 orphans" across the board.

**Effort:** ~15 min script, ~5 min run + verify.

**Risk:** very low. The cascade is well-tested (we just fixed it today), and idempotent on already-cleaned agents.

---

### Phase 3 — Two-step Reassign-then-Deactivate UX

This is the biggest piece. Per your decision: REASSIGN FIRST, then deactivate.

#### 3a. New service method: `transferAssets(fromAgentId, toAgentId, options)`

Same `prisma.$transaction` as cascade, but parameterized to allow PARTIAL transfers:

```ts
async transferAssets(
    fromAgentId: string,
    toAgentId: string,
    performedByAgentId: string,
    options: {
        partners?: boolean;
        inventory?: boolean;
        contacts?: boolean;
        leads?: boolean;
        transactions?: boolean;
    } = { partners: true, inventory: true, contacts: true, leads: true, transactions: true },
): Promise<TransferResult>
```

This lets the admin split — e.g., transfer inventory + contacts to one successor, partners to another, leads to a third.

#### 3b. New API route: `POST /api/team/members/:id/transfer-assets`

```ts
router.post('/members/:id/transfer-assets', requireSuperBoss, async (req, res) => {
    const { to_agent_id, asset_types, reason } = req.body;
    // asset_types is the options object above
    const result = await ownershipService.transferAssets(req.params.id, to_agent_id, req.agent.id, asset_types);
    res.json({ success: true, ...result });
});
```

Permission: super_boss only (matches existing partner-reassign pattern).

#### 3c. Modify existing deactivate route

`PATCH /api/team/members/:id/deactivate` stops calling cascade if the agent already has ZERO assets. If they still have assets, return 400 with a friendly error "Please transfer this agent's assets first." This forces the admin through the new flow.

```ts
if (status === 'inactive') {
    const summary = await ownershipService.getOwnershipSummary(id);
    const total = summary.partners + summary.inventory + summary.contacts + summary.leads + summary.transactions;
    if (total > 0) {
        return res.status(400).json({
            error: `Cannot deactivate while this agent owns ${total} assets. Use 'Transfer Assets' first to redistribute their pipeline.`,
            requires_transfer: true,
            summary,
        });
    }
    // Cascade is now a no-op for the deactivated path — just flip the status.
    await prisma.agent.update({ where: { id }, data: { status: 'inactive' } });
    return res.json({ success: true, message: 'Agent deactivated.' });
}
```

The existing cascade safety net STAYS in `cascadeOnAgentDeactivation` for the orphan cleanup script (Phase 2) and as a fallback — but the UI-driven path goes through transfer first.

#### 3d. New frontend dialog: TransferAssetsDialog

Replace the existing `TeamDeactivateDialog.tsx` flow with a two-screen wizard:

**Screen 1 — "Transfer Assets"** (replaces today's dialog):
- Shows the same cascade-preview counts (partners / inventory / leads / contacts / deals)
- Each row has its own [Agent ▼] picker (default super_boss) + a [✅ Transfer] button
- After each row is transferred, count drops to 0 and row dims
- When all rows are 0, the [Continue to deactivate →] button activates

**Screen 2 — "Confirm Deactivation"**:
- Now an empty-cascade confirmation. Just "Are you sure? This agent will lose access."
- One [✅ Deactivate] button.

**Routes / hooks**:
- `getOwnershipSummary(memberId)` — unchanged endpoint, just enhanced response (Phase 1)
- `transferAssets(memberId, toAgentId, assetTypes)` — new endpoint
- `deactivate(memberId)` — existing endpoint, now a no-op cascade

**Files to change:**
- NEW `agents/backend/src/services/ownership_service.ts` — add `transferAssets` method
- `agents/backend/src/routes/team.ts` — add `POST .../transfer-assets`, modify `PATCH .../deactivate` to check for zero assets
- `agents/frontend/src/components/TeamDeactivateDialog.tsx` — heavy rewrite into the two-screen wizard (rename to `TransferAndDeactivateDialog.tsx`)
- `agents/frontend/src/components/TeamMemberProfile.tsx` — its "Deactivate" button toggles same flow
- `agents/frontend/src/api/client.ts` — new `transferAssets` API helper

**Effort:** ~2-3 hours. The biggest UI piece in this plan.

**Risk:** Medium. Lots of moving parts. Plan mitigates by:
1. Keeping the underlying `cascadeOnAgentDeactivation` intact as a fallback
2. Adding a Playwright walkthrough as the verification step (just like the inventory + Sonia fixes)
3. One Playwright assertion per row: transfer Sonia's 0 assets, then transfer test-user's assets — confirm counts visibly drop, then deactivate works

---

### Phase 4 — Mark Lead Lost UI

**Files:**
- `agents/backend/src/routes/leads.ts` — new `PATCH /api/leads/:phone/mark-lost`
- `agents/frontend/src/components/[contact profile / Buyer Lead view]` — new button

#### 4a. Backend route

```ts
router.patch('/:phone/mark-lost', checkPermission('edit_lead'), async (req, res) => {
    const { reason, note } = req.body;
    const phone = req.params.phone;
    // Update Contact.lead_status='lost', lifecycle_stage='CLOSED_LOST'
    // If there's an active deal, ALSO close it (CLOSED_LOST via transition_state_machine)
    // Cancel any pending workflow tasks
    // Log the action
    const updated = await prisma.contact.update({
        where: { phone_number: phone },
        data: {
            lead_status: 'lost',
            lifecycle_stage: 'CLOSED_LOST',
            next_action_at: null,
            next_action_type: null,
        },
    });
    // Also close any active deals for this contact
    const activeDeals = await prisma.transaction.findMany({
        where: { demand_contact_id: phone, status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
    });
    for (const deal of activeDeals) {
        await transitionTransaction(deal.id, 'CLOSED_LOST', req.agent!.id, 'admin', { reason });
    }
    res.json({ success: true, contact: updated, deals_closed: activeDeals.length });
});
```

Permissions: `edit_lead` (already exists in the permissions config).

#### 4b. Frontend button

Add to the contact profile / Buyer Lead view:
- Red "❌ Mark Lead Lost" button next to existing status controls
- Click → modal with: dropdown for reason (Just Browsing / Wrong Number / Spam / Budget Mismatch / Already Bought / Other) + optional note textarea + Confirm button
- On confirm → API call → toast "Lead marked lost. N deals closed." → page reloads

**Effort:** ~1 hour code, ~15 min Playwright verify.

**Risk:** Low. Read-modify-write pattern, no transactions across services.

---

### Phase 5 — UNKNOWN categorization (DEFERRED per your instruction)

**Documented for future, NOT shipping in this plan.**

The investigation showed every UNKNOWN with engagement is buyer-side. Cleanest future approach when you're ready:

1. Auto-mark the 140 with-engagement UNKNOWNs as BUYER
2. Delete the 7 anonymous-no-activity rows
3. Manually review the 14 named-no-activity rows (likely 4 are obvious junk: TEMP_xxx phones / "Sir" / "Not Mentioned")

Or: build a `/admin/categorize-unknowns` page with a one-by-one card-flip UI (BUYER / TENANT / LANDLORD / PARTNER / DELETE) — slower but error-free.

Not blocking anything else. Revisit when you want.

---

## Recommended execution order

1. **Phase 1 (Bug C)** — ~25 min — Smallest, safest, fixes the data-integrity gap right now
2. **Phase 2 (orphan cleanup)** — ~20 min — Depends on Phase 1 (uses the now-correct cascade)
3. **Phase 4 (Mark Lead Lost)** — ~75 min — Independent of 1/2, mostly new code, low risk. Could ship in parallel with 1/2.
4. **Phase 3 (transfer-then-deactivate)** — ~3 hours — Biggest piece, ship LAST so you've already proven the cascade is solid

**Total estimated effort:** ~5 hours of focused work end-to-end. Could be split across two sessions if you want approval gates between phases.

---

## What I want from you before any code change

Pick one of:

- **A.** "Proceed with all phases in the recommended order (1 → 2 → 4 → 3)" — I'll execute autonomously, verify each phase in Playwright, report at the end.
- **B.** "Proceed with Phase 1 + 2 only for now; we'll review before Phase 3 and 4." — Smaller batch, faster ship, more checkpoints.
- **C.** "Change something in the plan first." — Push back, I'll adjust.
- **D.** "Investigate something specific further before any code." — Tell me what.

I will not write any production code until you pick.

---

## Risks acknowledged

| Risk | Mitigation |
|---|---|
| Phase 3's two-step UX changes admin daily workflow | Keep the old `cascadeOnAgentDeactivation` intact as a backup. If team complains, we can revert by adding back the cascade-on-deactivate auto-path. |
| Bulk transfer in Phase 3 could mis-route assets if admin picks the wrong target | New endpoint logs every transfer with `performed_by_agent_id` — full audit trail; reversible by transferring again. |
| Orphan cleanup script could double-cascade | Idempotent by design (re-running on a clean agent transfers 0 records). Logs counts before exiting. |
| Lead-lost button could close deals the admin didn't want closed | The modal will explicitly say "This will also close N active deals" with the count visible before confirmation. |
| Future deactivations still go through Bug-C-fixed cascade if admin clicks Deactivate directly | Phase 3's check forces them through the transfer dialog. But the cascade safety net IS there. |
