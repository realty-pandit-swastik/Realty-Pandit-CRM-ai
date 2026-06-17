---
name: reference-partner-commission-model
description: Partner agent business model is commission-on-sale, NOT subscription. No paid tiers, no listing limits, only name+phone required to onboard. Decision-locked 2026-05-15.
metadata:
  type: reference
---

# Partner Agent Business Model (locked 2026-05-15)

**Commission-on-sale, not subscription.** Realty Pandit earns commission when a property transaction closes (sale or rent finalized). Partners onboard free, list unlimited inventory, refer unlimited leads. No upfront payment, no subscription tier.

## What this means in code + data

| Concept | Before 2026-05-15 | After 2026-05-15 |
|---|---|---|
| Onboarding form | Required: name, phone, email, partner_category, business_name, business_address | Required: **name + phone only**. Everything else optional. |
| Initial status | `PENDING_PAYMENT` (couldn't login until paid) | `ACTIVE` immediately |
| `listing_limit` | 10 (FREE) / 50 (PRO) / 999 (ADVANCE_PRO) | **99999 universally** (effectively unlimited) |
| Inventory upload block | `routes/agent.ts:567` returned 403 at limit | Removed (commented out) |
| Subscription expiry cron | Flipped `subscription_end < now` → `status='EXPIRED'` | **No-op** — handler returns immediately |
| Form fields kept but optional | partner_category, email, business_name, business_address, registration_number, agency_name, partner_type | All filed-later by admin or partner |

## Code map of changes

| File | What |
|---|---|
| `agents/backend/src/routes/api.ts` (POST `/api/partners`) | Required = name+phone only; `resolvedCategory` defaults to INDIVIDUAL; listing_limit 99999 |
| `agents/backend/src/routes/agent.ts` (POST `/agent/inventory`) | Removed `listing_limit` enforcement block |
| `agents/backend/src/services/partner_auto_create.ts` (`ensurePartnerAgent`) | Default `status='ACTIVE'`, `listing_limit=99999`, no `business_*` placeholders |
| `agents/backend/src/queues/workers/scheduled_worker.ts` (`subscription-expiry` case) | No-op now; logs and returns |
| `agents/frontend/src/components/PartnerManagement.tsx` (admin add form) | name+phone required; everything else marked "(optional)"; package_type dropdown removed; added "Free onboarding · unlimited listings · we earn commission on closed deals only" banner |

## Backfill executed (2026-05-15)

```sql
UPDATE partner_agents
SET status='ACTIVE', listing_limit=99999, updated_at=NOW()
WHERE status IN ('PENDING_PAYMENT', 'EXPIRED') OR listing_limit < 99999;
-- 50 rows updated

UPDATE owners SET listing_limit=99999, updated_at=NOW()
WHERE scope='EXTERNAL' AND listing_limit < 99999;
-- 14 rows updated
```

Post-state: 49 partner_agents all ACTIVE with listing_limit=99999. Zero PENDING_PAYMENT, zero EXPIRED.

## What's still in the schema (kept for reversibility)

- `partner_agents.package_type` column (`FREE`/`PRO`/`ADVANCE_PRO`) — all rows are `FREE` now
- `partner_agents.subscription_start` / `subscription_end` columns — populated but unread
- `partner_agents.status` enum still includes `PENDING_PAYMENT` / `EXPIRED` — just unused
- `subscriptions` table — exists, unused by new partners

If the business model ever reverts to subscription, the columns and enums are still there. Just re-enable the checks at the 4 listed sites.

## Verification

```bash
curl -X POST 'https://api.realtypandit.in/api/partners' \
  -b cookies.txt -H "X-CSRF-Token: $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"phone_number":"+91XXXXXXXXXX","name":"Test Partner"}'
# Expected: HTTP 201 with status=ACTIVE, listing_limit=99999
```

## Related

- [[reference_new_lead_alerts]] — partner-aware lead routing
- [[reference_inventory_share_pdf]] — partner-side share UX with brandless PDF
- Partner portal visibility fix (3-way OR on owner/key_holder/referral) shipped 2026-05-15 — see `routes/agent.ts:getAgentInventoryWhere`
