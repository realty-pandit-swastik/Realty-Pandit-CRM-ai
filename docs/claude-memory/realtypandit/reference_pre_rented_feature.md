---
name: reference_pre_rented_feature
description: "Pre-rented" (pre-lease) inventory feature — for-sale property already tenanted; flag + monthly rent shown in admin + public website. Plus renovated-on-website map + zero-downtime additive-migration recipe.
metadata:
  type: reference
---

**2026-06-10 SHIPPED + live-verified.** "Pre-rented" = a FOR-SALE property that already has a sitting tenant paying rent (an investor selling point).

**Decisions (Puneet):** public label **"Pre-rented"**; show **rent amount only** (NO yield/ROI in v1 — but data is built so yield = rent×12÷price is a 1-line add later); capture at **add-time** too.

**Data — 2 new inventory COLUMNS** (parallel to `renovated`, all 3 are columns, NOT specs): `pre_rented Boolean @default(false)` + `pre_rented_monthly_rent Decimal?`. Migration `20260610120000_add_pre_rented_columns`.

**Wiring (all live):**
- Backend [inventory.ts](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/routes/inventory.ts): POST create (destructure + data block) + PATCH (explicit bool/number handling beside `renovated`).
- Backend [public.ts](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/routes/public.ts): added `pre_rented`/`pre_rented_monthly_rent` to BOTH selects (list ~L167, detail ~L242); `...p`/`...property` spreads pass them through.
- Admin Edit [InventoryList.tsx](clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/InventoryList.tsx): toggle + "Current rent (₹/month)" in **Details tab** under Renovation Status, **gated on `editData.intent === 'sell'`**; `editData` carries both → `{...rest}` payload → PATCH. List card badge `🏷 Pre-rented · ₹X/mo` beside `🔨 Renovated`.
- Admin Add [InventoryModal.tsx](clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/InventoryModal.tsx): the "+ Add Property" wizard is conversational (workflow engine) — captured pre-rented WITHOUT touching the engine by injecting on the **confirm step**, exactly like the `sourcePartner` pattern: `buildPreRentedExtras(preRented, wf.answers.intent)` merged into both `wf.submit(...)` calls; a `PreRentedField` rendered in `ConfirmStep` + `ConfirmationPanel` (shown only when intent is sale). **`AddInventory.tsx` is DEAD code** (never imported — don't edit it).
- Website: [api.ts](clients/sunny-sharma/projects/reality-pandit/agents/website/src/lib/api.ts) type fields; [PropertyCard.tsx](clients/sunny-sharma/projects/reality-pandit/agents/website/src/components/PropertyCard.tsx) badge; [PropertyDetailClient.tsx](clients/sunny-sharma/projects/reality-pandit/agents/website/src/app/properties/[id]/PropertyDetailClient.tsx) badge row + a "Pre-rented · Current rent ₹X/mo" line in the Price Details card.

**Renovated was ALREADY on the website** (not a gap people thought): `renovated` column → public API both endpoints → PropertyCard "Newly Renovated" badge, all pre-existing. The only gap = the **detail page** didn't show it; FIXED here (added the badge to PropertyDetailClient). Renovated stays **edit-only** at capture (NOT in the add wizard) — 1-line follow-up if wanted.

**Zero-downtime additive-migration recipe (reusable):** deploy-agent only runs `prisma generate`, NOT `migrate deploy`. To add columns without a runtime window: (1) **pre-apply** the `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` via `prisma.$executeRawUnsafe` from a `.cjs` script placed **inside** `/var/www/realty-pandit/backend/` (module resolution needs it there, not /tmp) — old code ignores new cols; (2) deploy backend (generate + restart, cols already exist); (3) `npx prisma migrate deploy` records the migration (idempotent via IF NOT EXISTS). After any data change, bust the website cache: keys are `cache:${req.originalUrl}` ([middleware/cache.ts]) — `redis-cli -u "$REDIS_URL" --scan --pattern "cache:/public/properties*" | xargs -r redis-cli -u "$REDIS_URL" DEL` (REDIS_URL from backend `.env`; redis needs AUTH).

**Verified live:** admin Edit toggle (Sell only) + rent 25000 → Save → public API `pre_rented:true,rent:'25000'` → website card+detail show "Pre-rented · ₹25,000/mo" → reverted test data + flushed cache (API back to false). Stamp `v20260610g-pre-rented`. Related: filters [[reference_taxonomy_filters]], add-wizard renderers [[reference_add_inventory_two_renderers]], data-correction discipline [[feedback_data_corrections_owned_by_lead_owner]].
