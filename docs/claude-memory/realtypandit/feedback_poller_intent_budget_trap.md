---
name: feedback_poller_intent_budget_trap
description: 99acres/MagicBricks mislabel RENTAL leads as intent=buy; a rent-sized budget on a residential lead means RENT — use the budget-aware guard
metadata:
  type: feedback
---

**Portal pollers mislabel rentals as "buy" → un-matchable dead-end deals.** MagicBricks had `else intent='buy'` as the default (`integrations/magicbricks.ts`) and 99acres `extractIntent` returns null on ambiguous labels (`ninety_nine_acres_poller.ts`) → the deal defaults to buy, and the monthly rent (₹16–35k) is stored as `demand_budget_max`. Matching then hunts to BUY a flat at ₹16k → 0 matches → silent dead-end. Found **128 such deals (≈32% of the 404 NEW backlog)** on 2026-06-12.

**Root cause:** intent inference ignored the budget magnitude.

**How to apply:** a residential lead (has BHK) with `intent=buy` and `budget_max` in the **monthly-rent band ₹3k–₹2L is a RENTAL** — buying a flat for <₹5L is impossible in NCR. Both pollers now apply this budget-aware guard (deployed `ad18ba6`). When repairing existing data: **dry-run + backup first** (per [[reference_prod_db_backup]]; revert file `/root/backups/intentfix-*.json`), then flip `demand_intent='rent'` + `demand_budget_type='per_month'`. **The deal's `demand_intent` (NOT contact.intent) drives matching** (`property_sharing.shareNextProperty`). Verified via the match survey (bad-budget 17→0, card-able 26→33). Extends [[feedback_poller_silent_loss]] + [[reference_99acres_lead_routing]].
