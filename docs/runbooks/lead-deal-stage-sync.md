# Runbook — lead stage ↔ deal stage

`contacts.lifecycle_stage` (what the **Leads** page shows) is **derived from the deal**
(`transactions.status`, what the **Deal Pipeline** shows). The deal is the source of truth: it has
a validated state machine, the lead's stage dropdown never did.

Shipped 2026-08-09/10 — `6e82ae1`, `2a20bf3`, `8bf3438`, `c9033cd`, `8a6c9a0`.
Background + the original investigation: memory `project_lead_deal_stage_desync_2026-08-09`.

---

## Health check

Run this whenever stages look wrong. **Expected: `single_deal_mismatches = 0`.**

```sql
-- 1. The real signal. MUST be 0.
WITH one AS (
  SELECT demand_contact_id AS p, min(status::text) AS s
  FROM transactions GROUP BY 1 HAVING count(*) = 1)
SELECT count(*) AS single_deal_mismatches
FROM one o JOIN contacts c ON c.phone_number = o.p
WHERE c.lifecycle_stage <> o.s;

-- 2. Row-level count. ~13 is CORRECT — see "expected mismatches" below.
SELECT count(*) AS total_row_mismatches
FROM transactions t JOIN contacts c ON c.phone_number = t.demand_contact_id
WHERE c.lifecycle_stage <> t.status::text;

-- 3. Stage values outside the canonical 9. MUST be 0.
SELECT lifecycle_stage, count(*) FROM contacts
WHERE lifecycle_stage NOT IN ('NEW','QUALIFIED','MATCHING_APPOINTMENT','VISIT_SCHEDULED',
                              'VISITED','NEGOTIATION','CLOSED_WON','CLOSED_LOST','ON_HOLD')
GROUP BY 1;

-- 4. Deals whose current status has no audit row = something wrote status directly.
--    Historical baseline ~121 (pre-fix). It must NOT grow.
SELECT count(*) AS status_writes_without_audit
FROM transactions t WHERE t.status <> 'NEW' AND NOT EXISTS (
  SELECT 1 FROM transaction_logs l WHERE l.transaction_id = t.id AND l.new_status = t.status);
```

### Expected mismatches
Query 2 is **not** expected to be 0. A lead with several deals follows its **open** deal, so an
older `CLOSED_LOST` one legitimately differs. 13 such leads existed at rollout. If query 1 is 0,
the system is healthy regardless of query 2.

## Re-align after drift

```bash
cd /var/www/realty-pandit/backend
npx ts-node src/scripts/backfill_lead_stage.ts            # dry run — prints the transition tally
npx ts-node src/scripts/backfill_lead_stage.ts --apply    # writes
```
Idempotent — a clean system reports `total to change : 0`. **Back up first**
(`reference_prod_db_backup.md`); it can touch thousands of rows.

---

## 🔴 Rules for anyone changing this area

**1. Never write `transactions.status` directly.** Always `transitionTransaction()`. Three paths
used to bypass it and that was **24% of all QUALIFIED deals** with no audit row at all
(`routes/omnidim.ts` ×2 AI voice, `services/webhook_processor.ts` ×1). Query 4 above catches a
regression.

**2. The sync hook belongs in `transitionTransaction`, not in a route.** ~20 call sites reach it —
admin UI, WhatsApp bot, sales agent, workflow tasks, pipeline crons, property-card replies. A hook
in `routes/deals.ts` fixes the button and leaves every other path broken.

**3. Deal CREATION is not a transition.** Any new `prisma.transaction.create` must call
`syncLeadStageForContact(phone)` after it. This was missed on the first pass and a lead drifted
within a day — a deal created at `QUALIFIED` (agent-added lead, or a `TEAM_MEMBER` deal per DEC-003)
left its lead on `NEW`. Three creators exist: `ensure_deal.ts`, `deal_service.ts`,
`transaction_service.ts`.

**4. The contact write is INSIDE the atomic `$transaction`,** deliberately unlike the NEG-1
inventory lock a few lines below which is best-effort after the commit. Do not "fix" that
inconsistency — the point is that the two can never diverge, and `demand_contact_id` is a required
FK so the contact row always exists.

**5. Leads with no deal keep an independently-editable stage** — 399 contacts, almost all
`LANDLORD` / `PARTNER_AGENT`. `deriveLeadStage` returns `null` for them and the caller writes
directly. That is the only remaining direct writer of `lifecycle_stage`.

**6. The vocabularies are identical** — frontend `LIFECYCLE_STAGES` == the 9 non-deprecated
`TransactionStatus` values. It is a copy, not a mapping. `MATCHED` is the deprecated 10th and ranks
with `QUALIFIED`.

## Behaviour the team should expect

- **Stage picks on the lead page can be rejected.** An illegal jump returns 400 carrying the state
  machine's own message, e.g. *"Invalid transition: QUALIFIED → CLOSED_WON. Valid next:
  [VISIT_SCHEDULED, CLOSED_LOST, ON_HOLD]"*. Picks that silently "worked" before now fail — the
  deal could never legally make that move.
- **Reports moved at rollout.** The lost-lead report (`routes/reports.ts`) went **54 → 2,122** and
  the `analytics.ts` conversion funnels shifted with it. Correct: those reports had been reading a
  field nothing maintained.

## Known gap, not fixed

`routes/omnidim.ts:65` returns early when the AI-voice payload has no `phone`, so the outcome is
silently dropped and the deal never moves. Pre-existing, unrelated to the stage sync.
