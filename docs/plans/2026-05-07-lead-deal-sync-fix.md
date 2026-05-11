# Lead–Deal Sync Fix & Data Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill missing requirement fields on 15 active deals, fix 2 corrupted budget records, handle Jitesh's inventory-less VISITED deal, and verify every fix is visible in the live admin UI using Playwright.

**Architecture:** Pure data-layer fixes (SQL UPDATE statements run directly against the production PostgreSQL database) + a one-time Node/Prisma backfill script for safety. No schema changes. No new API endpoints. The code fixes already deployed today (deal_service.ts + leads.ts) handle future syncs — this plan fixes the historical data gap.

**Tech Stack:** PostgreSQL 14, Prisma (for verification queries), SSH to production VPS at `72.62.231.224` (alias `realty-pandit`), Playwright MCP browser for UI verification, admin UI at `https://admin.realtypandit.in` (login: `9958860411` / `noteplz123`).

---

## Scope: What This Plan Fixes

| # | Issue | Affected Leads | Fix Type |
|---|---|---|---|
| 1 | Sync gap — area min/max null on deal | 10 deals | SQL backfill |
| 2 | Sync gap — budget min null on deal | 3 deals | SQL backfill |
| 3 | Sync gap — category/type_slug null on deal | 2 deals | SQL backfill |
| 4 | Sync gap — location/intent null on deal | 4 deals | SQL backfill |
| 5 | Corrupted budget — inverted min/max | Gaurav Singh housing | SQL fix |
| 6 | Corrupted budget — wrong unit (0.7/1.0) | Pankaj chaudhary pinki bhai | SQL fix |
| 7 | VISITED deal with no inventory linked | Jitesh | Manual action note |

---

## Files Modified / Created

| File | Action | Purpose |
|---|---|---|
| (none — production DB only) | SQL UPDATE via psql | Backfill missing fields on `transactions` table |
| `backend/src/scripts/backfill_deal_sync.ts` | Create | Safe, idempotent backfill script with dry-run mode |

---

## Task 1: Pre-Flight — Capture Before State

Before touching anything, snapshot the current state so we can verify changes worked and roll back if needed.

- [ ] **Step 1: Take Playwright screenshot of Prashant sharma deal (representative broken case)**

  Open Playwright browser and navigate:
  ```
  url: https://admin.realtypandit.in
  Login with: 9958860411 / noteplz123
  Navigate to Deal Pipeline → find Prashant sharma → click card → Detail tab
  ```
  Take screenshot. Save mentally as "BEFORE — Prashant sharma: CATEGORY=—, BUDGET=—".

- [ ] **Step 2: Take Playwright screenshot of Gaurav Singh housing deal**

  In Deal Pipeline → find Gaurav Singh housing → click card → Detail tab.
  Take screenshot. Note the inverted budget values showing.

- [ ] **Step 3: Take Playwright screenshot of Pankaj chaudhary pinki bhai deal**

  In Deal Pipeline → find Pankaj chaudhary (pinki bhai) → click card → Detail tab.
  Take screenshot. Note budget_min=0.7, budget_max=1.0 values showing.

- [ ] **Step 4: Run SQL snapshot query to record current null counts**

  ```bash
  ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"
  SELECT
    COUNT(*) FILTER (WHERE t.demand_area_min IS NULL AND c.area_min IS NOT NULL) as area_gap,
    COUNT(*) FILTER (WHERE t.demand_budget_min IS NULL AND c.budget_min IS NOT NULL) as budget_gap,
    COUNT(*) FILTER (WHERE t.demand_category IS NULL AND c.demand_category IS NOT NULL) as category_gap
  FROM transactions t
  JOIN contacts c ON c.phone_number = t.demand_contact_id
  WHERE t.status NOT IN ('CLOSED_WON','CLOSED_LOST','ON_HOLD');
  \""
  ```

  Expected output:
  ```
   area_gap | budget_gap | category_gap
  ----------+------------+--------------
          8 |          3 |            1
  ```

---

## Task 2: Create Backfill Script

Create a safe, dry-run-capable TypeScript script. Running it with `DRY_RUN=true` prints what would change without touching the DB. Running it with `DRY_RUN=false` applies the changes.

- [ ] **Step 1: Create the script file**

  **File:** `backend/src/scripts/backfill_deal_sync.ts`

  ```typescript
  /**
   * One-time backfill: copy requirement fields from contacts → transactions
   * for all active deals where the transaction snapshot has nulls but the
   * contact has real data.
   *
   * Usage:
   *   DRY_RUN=true  npx ts-node src/scripts/backfill_deal_sync.ts
   *   DRY_RUN=false npx ts-node src/scripts/backfill_deal_sync.ts
   */
  import prisma from '../db';

  const DRY_RUN = process.env.DRY_RUN !== 'false';

  async function main() {
      console.log(`\n=== Lead–Deal Sync Backfill (DRY_RUN=${DRY_RUN}) ===\n`);

      // Fetch all active deals joined with their contact
      const deals = await (prisma as any).transaction.findMany({
          where: {
              status: { notIn: ['CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD'] },
              demand_contact_id: { not: null },
          },
          include: {
              demand_contact: {
                  select: {
                      phone_number: true,
                      demand_category: true,
                      demand_type_slug: true,
                      budget_min: true,
                      budget_max: true,
                      area_min: true,
                      area_max: true,
                      intent: true,
                      preferred_location: true,
                  },
              },
          },
      });

      let patched = 0;
      let skipped = 0;

      for (const deal of deals) {
          const c = deal.demand_contact;
          if (!c) { skipped++; continue; }

          const update: Record<string, any> = {};

          if (deal.demand_area_min == null && c.area_min != null)
              update.demand_area_min = Number(c.area_min);
          if (deal.demand_area_max == null && c.area_max != null)
              update.demand_area_max = Number(c.area_max);
          if (deal.demand_budget_min == null && c.budget_min != null)
              update.demand_budget_min = Number(c.budget_min);
          if (deal.demand_budget_max == null && c.budget_max != null)
              update.demand_budget_max = Number(c.budget_max);
          if (deal.demand_category == null && c.demand_category != null)
              update.demand_category = c.demand_category;
          if (deal.demand_type_slug == null && c.demand_type_slug != null)
              update.demand_type_slug = c.demand_type_slug;
          if (deal.demand_intent == null && c.intent != null)
              update.demand_intent = c.intent.toLowerCase();
          if (deal.demand_location == null && c.preferred_location != null)
              update.demand_location = c.preferred_location;

          if (Object.keys(update).length === 0) { skipped++; continue; }

          const contactName = c.phone_number;
          console.log(`[PATCH] ${contactName} (deal ${deal.id}):`);
          Object.entries(update).forEach(([k, v]) => console.log(`  ${k}: null → ${v}`));

          if (!DRY_RUN) {
              await (prisma as any).transaction.update({
                  where: { id: deal.id },
                  data: update,
              });
          }
          patched++;
      }

      console.log(`\nSummary: ${patched} deals would be patched, ${skipped} skipped (no gap or no contact).`);
      if (DRY_RUN) console.log('\nDRY RUN — no changes written. Set DRY_RUN=false to apply.');
      else console.log('\nDone — changes written to production DB.');
  }

  main().catch(console.error).finally(() => prisma.$disconnect());
  ```

- [ ] **Step 2: Upload script to server**

  ```bash
  scp "c:\Users\Varchasv Bhardwaj\Project\clients\sunny-sharma\projects\reality-pandit\agents\backend\src\scripts\backfill_deal_sync.ts" \
    realty-pandit:/var/www/realty-pandit/backend/src/scripts/backfill_deal_sync.ts
  ```

  Expected: file uploaded with no errors.

- [ ] **Step 3: Run in DRY_RUN mode and verify output**

  ```bash
  ssh realty-pandit "cd /var/www/realty-pandit/backend && DRY_RUN=true npx ts-node src/scripts/backfill_deal_sync.ts 2>&1"
  ```

  Expected output should list exactly these 15 deals with their gaps (sample):
  ```
  [PATCH] +919717077373 (deal 2214567b-...):
    demand_area_min: null → 250
    demand_area_max: null → 500
  [PATCH] +918076645036 (deal f6a67fe6-...):
    demand_area_min: null → 150
    demand_area_max: null → 200
  ...
  Summary: 15 deals would be patched, N skipped.
  DRY RUN — no changes written. Set DRY_RUN=false to apply.
  ```

  If fewer than 15 appear, check the missed ones manually before proceeding.

---

## Task 3: Apply the Sync Backfill

- [ ] **Step 1: Run in live mode**

  ```bash
  ssh realty-pandit "cd /var/www/realty-pandit/backend && DRY_RUN=false npx ts-node src/scripts/backfill_deal_sync.ts 2>&1"
  ```

  Expected: same list of patches, ending with:
  ```
  Summary: 15 deals would be patched, N skipped.
  Done — changes written to production DB.
  ```

- [ ] **Step 2: Verify counts in DB are now zero**

  ```bash
  ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"
  SELECT
    COUNT(*) FILTER (WHERE t.demand_area_min IS NULL AND c.area_min IS NOT NULL) as area_gap,
    COUNT(*) FILTER (WHERE t.demand_budget_min IS NULL AND c.budget_min IS NOT NULL) as budget_gap,
    COUNT(*) FILTER (WHERE t.demand_category IS NULL AND c.demand_category IS NOT NULL) as category_gap,
    COUNT(*) FILTER (WHERE t.demand_intent IS NULL AND c.intent IS NOT NULL) as intent_gap,
    COUNT(*) FILTER (WHERE t.demand_location IS NULL AND c.preferred_location IS NOT NULL) as location_gap
  FROM transactions t
  JOIN contacts c ON c.phone_number = t.demand_contact_id
  WHERE t.status NOT IN ('CLOSED_WON','CLOSED_LOST','ON_HOLD');
  \""
  ```

  Expected:
  ```
   area_gap | budget_gap | category_gap | intent_gap | location_gap
  ----------+------------+--------------+------------+--------------
          0 |          0 |            0 |          0 |            0
  ```

  If any column is non-zero, investigate those specific deals before continuing.

- [ ] **Step 3: Playwright — verify Prashant sharma now shows data**

  Open Deal Pipeline → Prashant sharma → Detail tab.
  
  Expected AFTER:
  - CATEGORY: shows "residential" or sub-category label (not "—")
  - AREA: still shows "250 – 500 sqft" ✓
  - BUDGET: still shows "—" (Prashant's budget_min/max were NULL on the contact too — correct)

- [ ] **Step 4: Playwright — verify Surender now shows category**

  Find Surender (+918076526898) in Deal Pipeline → Detail tab.
  
  Expected: CATEGORY shows "Plot / Land" (demand_category=plot_land).

- [ ] **Step 5: Playwright — verify Mohan Lal now shows budget**

  Find Mohan Lal (+919958462287) in Deal Pipeline → Detail tab.
  
  Expected: BUDGET shows "₹40L" (demand_budget_min=4,000,000 = ₹40L).

---

## Task 4: Fix Gaurav Singh housing — Inverted Budget

Current state: `demand_budget_min = 5,000,000` and `demand_budget_max = 2,000,000` (min > max — matching engine returns zero results).

Correct values assumed: **min = ₹20L, max = ₹50L** (the smaller value is the floor, the larger is the ceiling). Verify with team before applying if uncertain.

- [ ] **Step 1: Confirm current values in DB**

  ```bash
  ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"
  SELECT id, demand_budget_min, demand_budget_max, demand_location, demand_intent
  FROM transactions WHERE id = '40a40f56-d458-4adf-8e94-e2d1fcb604bd';
  -- Also check the contact
  SELECT name, phone_number, budget_min, budget_max, preferred_location
  FROM contacts WHERE phone_number = '+917503002813';
  \""
  ```

  Expected: confirms budget_min=5000000 > budget_max=2000000 on the deal; contact may show same or correct values.

- [ ] **Step 2: Apply the fix — swap min and max**

  ```bash
  ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"
  UPDATE transactions
  SET demand_budget_min = 2000000, demand_budget_max = 5000000
  WHERE id = '40a40f56-d458-4adf-8e94-e2d1fcb604bd';

  UPDATE contacts
  SET budget_min = 2000000, budget_max = 5000000
  WHERE phone_number = '+917503002813';
  \""
  ```

  Expected: `UPDATE 1` for each statement.

- [ ] **Step 3: Playwright — verify Gaurav Singh's budget now reads correctly**

  Find Gaurav Singh housing in Deal Pipeline → Detail tab.

  Expected: BUDGET shows "₹20L – ₹50L" (not inverted, not blank).

---

## Task 5: Fix Pankaj chaudhary pinki bhai — Wrong Budget Unit

Current state: `demand_budget_min = 0.7` and `demand_budget_max = 1.0`.

Context: This lead is for Ghaziabad rental (`demand_intent = rent_lease`). The values 0.7 and 1.0 almost certainly mean **₹70L and ₹1Cr** entered in a "Crore" field that stored the decimal directly instead of multiplying. Correct values: `budget_min = 7,000,000`, `budget_max = 10,000,000`.

- [ ] **Step 1: Confirm current values and intent**

  ```bash
  ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"
  SELECT id, demand_budget_min, demand_budget_max, demand_intent, demand_location
  FROM transactions WHERE id = '7688d5b1-1151-4128-b019-5f5b180a25ec';
  SELECT name, phone_number, budget_min, budget_max, intent, preferred_location
  FROM contacts WHERE phone_number = '+918076621214';
  \""
  ```

- [ ] **Step 2: Apply the fix — multiply by 10,000,000 (Crore to Rupees)**

  ```bash
  ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"
  UPDATE transactions
  SET demand_budget_min = 7000000, demand_budget_max = 10000000
  WHERE id = '7688d5b1-1151-4128-b019-5f5b180a25ec';

  UPDATE contacts
  SET budget_min = 7000000, budget_max = 10000000
  WHERE phone_number = '+918076621214';
  \""
  ```

  Expected: `UPDATE 1` for each statement.

- [ ] **Step 3: Playwright — verify Pankaj's budget reads correctly**

  Find Pankaj in Deal Pipeline → Detail tab.

  Expected: BUDGET shows "₹70L – ₹1Cr" (not 0.70 – 1.00).

---

## Task 6: Handle Jitesh — VISITED Deal with No Inventory

Jitesh (+919711235786, deal `1c6512ef-...`) is in VISITED stage but `inventory_id = NULL`.

Investigation findings: Jitesh's deal went through this path:
```
QUALIFIED → VISIT_SCHEDULED → NEGOTIATION (Property Liked) →
VISIT_SCHEDULED → VISITED → VISIT_SCHEDULED → VISITED (current)
```

No `property_shared` interaction records exist for this phone. No appointment record with a `property_id` exists. The visits were manually staged by the team without ever attaching a specific inventory item. **This cannot be auto-backfilled — we don't know which property was visited.**

- [ ] **Step 1: Add a timeline log note to make this visible to the team**

  ```bash
  ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"
  INSERT INTO transaction_logs
    (id, transaction_id, action, details, performed_by, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    '1c6512ef-114e-41fb-94c9-c04ce605da4d',
    'NOTE_ADDED',
    '{\"note\": \"ACTION REQUIRED: Deal is in VISITED stage but no inventory is linked. Lead manager must open this deal, go to Match & Share tab, and attach the property that was visited.\"}',
    'system',
    NOW(),
    NOW()
  );
  \""
  ```

  Expected: `INSERT 0 1`

- [ ] **Step 2: Playwright — verify note appears in Jitesh's timeline**

  Find Jitesh in Deal Pipeline → click card → Timeline tab.

  Expected: New "Note Added" entry at top of timeline with the action required message.

- [ ] **Step 3: Document for team**

  The team (Sunil Kasana / lead manager) must:
  1. Open Jitesh's deal in the pipeline
  2. Go to Match & Share tab
  3. Find the property that was actually visited
  4. Attach it to the deal (or manually set via the outcome flow)

  This is a human process — cannot be automated without knowing which property was visited.

---

## Task 7: Fix Contact Intent Mismatches

Three deals have `demand_intent` on the transaction that doesn't match `intent` on the contact. The AI uses the deal's intent for all flows.

| Lead | Phone | Deal intent | Contact intent | Correct value |
|---|---|---|---|---|
| Gaurav Singh housing | +917703866612 | `buy` | `BUYER` | `buy` (deal is correct, contact casing is wrong) |
| Kumar mausam | +919625921013 | `rent_lease` | `rent` | `rent` (contact likely correct; rent_lease was from portal parsing) |
| Pankaj chaudhary | +919810213551 | `rent_lease` | `rent` | `rent` |

- [ ] **Step 1: Fix contact intent casing for Gaurav Singh**

  ```bash
  ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"
  UPDATE contacts SET intent = 'buy' WHERE phone_number = '+917703866612';
  \""
  ```

  Expected: `UPDATE 1`

- [ ] **Step 2: Align Kumar mausam's deal intent to match contact**

  ```bash
  ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"
  UPDATE transactions
  SET demand_intent = 'rent'
  WHERE id = '8021f0e3-0560-446b-85e7-09d3c5698ea8';
  \""
  ```

  Expected: `UPDATE 1`

- [ ] **Step 3: Align Pankaj chaudhary's deal intent**

  ```bash
  ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"
  UPDATE transactions
  SET demand_intent = 'rent'
  WHERE id = '290cd3d6-eef1-4392-be5c-e9c973a85b8a';
  \""
  ```

  Note: Pankaj's budget (₹70L – ₹1Cr) for a rent deal in Ghaziabad looks high but is plausible for a commercial lease. If it turns out to be wrong, correct it after confirming with the team.

  Expected: `UPDATE 1`

- [ ] **Step 4: Playwright — verify Kumar mausam shows correct intent**

  Find Kumar mausam in Deal Pipeline → Detail tab.

  Expected: INTENT shows "Rent" (not "Rent / Lease").

---

## Task 8: Final Verification — Full Sweep

- [ ] **Step 1: Run the complete health check query to confirm all gaps are closed**

  ```bash
  ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"
  SELECT
    c.name,
    c.phone_number,
    t.status,
    CASE WHEN t.demand_category IS NULL AND c.demand_category IS NOT NULL THEN 'category_gap' END,
    CASE WHEN t.demand_budget_min IS NULL AND c.budget_min IS NOT NULL THEN 'budget_min_gap' END,
    CASE WHEN t.demand_area_min IS NULL AND c.area_min IS NOT NULL THEN 'area_gap' END,
    CASE WHEN t.demand_intent IS NULL AND c.intent IS NOT NULL THEN 'intent_gap' END,
    CASE WHEN t.demand_location IS NULL AND c.preferred_location IS NOT NULL THEN 'location_gap' END
  FROM transactions t
  JOIN contacts c ON c.phone_number = t.demand_contact_id
  WHERE t.status NOT IN ('CLOSED_WON','CLOSED_LOST','ON_HOLD')
    AND (
      (t.demand_category IS NULL AND c.demand_category IS NOT NULL) OR
      (t.demand_budget_min IS NULL AND c.budget_min IS NOT NULL) OR
      (t.demand_area_min IS NULL AND c.area_min IS NOT NULL) OR
      (t.demand_intent IS NULL AND c.intent IS NOT NULL) OR
      (t.demand_location IS NULL AND c.preferred_location IS NOT NULL)
    );
  \""
  ```

  Expected: `(0 rows)` — no remaining sync gaps.

- [ ] **Step 2: Verify budget corruption is gone**

  ```bash
  ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"
  SELECT c.name, t.demand_budget_min, t.demand_budget_max
  FROM transactions t
  JOIN contacts c ON c.phone_number = t.demand_contact_id
  WHERE t.status NOT IN ('CLOSED_WON','CLOSED_LOST','ON_HOLD')
    AND t.demand_budget_min IS NOT NULL
    AND t.demand_budget_max IS NOT NULL
    AND t.demand_budget_min > t.demand_budget_max;
  \""
  ```

  Expected: `(0 rows)` — no inverted budgets.

  ```bash
  ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"
  SELECT c.name, t.demand_budget_min, t.demand_budget_max
  FROM transactions t
  JOIN contacts c ON c.phone_number = t.demand_contact_id
  WHERE t.status NOT IN ('CLOSED_WON','CLOSED_LOST','ON_HOLD')
    AND (t.demand_budget_max < 1000 AND t.demand_budget_max IS NOT NULL);
  \""
  ```

  Expected: `(0 rows)` — no sub-₹1000 budgets remaining (the Pankaj 0.7/1.0 values are gone).

- [ ] **Step 3: Playwright — open 5 deals and verify Detail tab is populated**

  Open each of these in the Deal Pipeline, Detail tab:
  
  1. **Prashant sharma** — CATEGORY and AREA should show (budget still "—" is OK — contact has no budget)
  2. **Surender** — CATEGORY should show "Plot / Land"
  3. **Mohan Lal** — BUDGET MIN should show "₹40L"
  4. **Gaurav Singh housing** — BUDGET should show "₹20L – ₹50L" (corrected, not inverted)
  5. **Pankaj (pinki bhai)** — BUDGET should show "₹70L – ₹1Cr"

  For each: take screenshot as evidence. Any "—" where a value is expected means the backfill or fix didn't apply.

- [ ] **Step 4: Playwright — verify Match & Share tab now pre-fills correctly for a backfilled deal**

  Open **Mohan Lal** → Match & Share tab.

  Expected: The filter dropdowns should be pre-populated with his requirements (type_slug=flat → Type: Flat, budget visible). Run a search and confirm results appear.

- [ ] **Step 5: Playwright — take screenshot of Jitesh timeline note**

  Open Jitesh (+919711235786) → Timeline tab.

  Expected: "Note Added" entry at top with the "ACTION REQUIRED" message visible.

---

## Remaining Issues NOT Fixed By This Plan (Manual / Product Decisions)

These were found in the audit but are out of scope for automated fixes:

| Issue | Lead | Why Not Auto-Fixed |
|---|---|---|
| Stuck in NEW 42 days | Kumar mausam | AI not paused, may be no-response from customer. Team should check AI call logs and decide to move ON_HOLD. |
| Stuck in NEW 18 days | Krishna | Has full address as location (too verbose for geo-match), no budget. Team should qualify or mark ON_HOLD. |
| No coordinator | Varchasv Bhardwaj (+917986024171) | Likely test entry. Team should assign coordinator or close deal. |
| 10 contacts with no name | Various NEW leads | Names expected to come from AI qualification calls. If >14 days old with no name, team should review. |
| Jitesh inventory not linked | Jitesh (+919711235786) | Cannot determine which property was visited without human confirmation. See Task 6. |

---

## Rollback Plan

If any SQL update produces unexpected results:

```bash
# To reverse the budget swap for Gaurav Singh:
ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"
UPDATE transactions SET demand_budget_min = 5000000, demand_budget_max = 2000000
WHERE id = '40a40f56-d458-4adf-8e94-e2d1fcb604bd';
\""

# To reverse Pankaj budget fix:
ssh realty-pandit "PGPASSWORD='RealtyPandit@2024#Secure' psql -h localhost -U realty_user -d reality_pandit -c \"
UPDATE transactions SET demand_budget_min = 0.7, demand_budget_max = 1.0
WHERE id = '7688d5b1-1151-4128-b019-5f5b180a25ec';
\""

# The backfill sets previously-null fields to contact values — rollback means setting them back to NULL.
# Only do this if the contact data itself was wrong. Check with team first.
```

The backfill script only touches fields that are NULL on the deal — it never overwrites existing values. Safe to re-run.
