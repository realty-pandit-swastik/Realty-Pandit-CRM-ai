---
name: reference_match_intent_and_reflect_fix
description: Matching returned 0 for a deal whose demand_intent was "buyer" (engine intent map was case-sensitive); + Match & Share now reflects in-session requirement edits
metadata:
  type: reference
---

**2026-06-10 SHIPPED + live-verified.** A deal's Match & Share found **0 inventories** + edited requirements didn't reflect.

**Bug 1 — 0 results (the real one).** The deal's `demand_intent` was **`"buyer"`** (lowercase, invalid). The matching engine mapped lead-intent → `inventory.intent` with a **case-sensitive, incomplete** map ([matching_engine.ts](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/services/matching_engine.ts) two where-builders + match-counts [deals.ts:497]): `{ buy→sell, BUYER→sell, rent→rent, TENANT→rent }` — had `'BUYER'` (upper) but **not `'buyer'`** → `where.intent='buyer'` → no inventory (all `sell`/`rent`) → 0. Proof: `?intent=buy`→1, `?intent=buyer`→0. Only 1 deal had `"buyer"`; the dropdown (buy/rent/lease) couldn't show/fix it so the form silently re-saved it.
**Fix:** exported **`toInventoryIntent(intent): 'sell'|'rent'`** in matching_engine.ts — case-insensitive + complete (`rent/tenant/lease/rent_lease/rental→'rent'`, else `→'sell'`). Replaced all 3 inline maps. Data: normalized `demand_intent` `buyer→buy`, `TENANT→rent` (snapshot `transactions_intent_bak_20260610`). Form (`DemandRequirementsForm`) now normalizes an unknown stored intent to a valid option on load. **Lesson: never do a case-sensitive/literal intent→inventory map; route through `toInventoryIntent`.**

**Bug 2 — edited requirements not reflecting in Match & Share (in-session).** `MatchShareTab` snapshots requirements via `useState(deal.…)`; tabs are conditionally rendered (remount on switch) but the **`deal` prop (`selectedDeal` in DealPipeline) wasn't refreshed** after a requirements save (only the list refreshed). A fresh close+reopen worked; switching tabs in-session showed stale values.
**Fix:** added `onDealUpdated` callback: RequirementsTab calls it after a successful save → DealPipeline re-fetches the open deal via `getDeal` + `setSelectedDeal` → Match & Share remounts with fresh requirements. **GOTCHA: `getDeal(id)` returns the raw body `{ success, data: deal }` (GET /api/deals/:id wraps it) — you MUST unwrap `res.data` before `setSelectedDeal`, else `deal.id` is undefined and the search fires `/deals/undefined/...`.** (The pre-existing deep-link `setSelectedDeal(getDeal(id))` at DealPipeline ~L191 has the same latent wrapping bug.)

**Verified live (API + Playwright):** Varchasv deal Match & Share 0→1 results (intent=buyer now maps to sell; deal data = buy); rent deal → 5 (no regression); edit budget 80L→2.5Cr in Detail → switch to Match & Share (no reopen) → chip shows ₹2.5Cr + 31 results, 0 console errors; restored to 80L. Bundle `index-D0nuyjdW.js`, stamp `v20260610d`.

Related: the same matching engine + Match & Share surface as [[reference_deal_match_category_fix]] (category-level taxonomy filter) and [[reference_matching_tree_alignment]] (sub_category alignment); the requirements-save path is [[reference_deal_requirements_save_fix]] (the "Done" never saved + onRefresh); demand fields SoT is [[reference_demand_canonical_sot]].
