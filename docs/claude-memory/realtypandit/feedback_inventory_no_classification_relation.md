---
name: Inventory has NO 'classification' relation — use flat_property_type / property_type_link
description: prisma.inventory include/select of 'classification' throws PrismaClientValidationError at runtime; the real relations are flat_property_type, property_type_link, property_category, property_sub_category.
metadata:
  type: feedback
---

The `Inventory` model has **no relation named `classification`**. Its classification relations are `flat_property_type` (FlatPropertyType, the v2 field — usually the right one for a display name), `property_type_link` (PropertyType, legacy hierarchical), `property_category`, `property_sub_category`, `property_configuration`. There is also **no `property_type` column** — the raw type slug column is just `type` (e.g. "builder_floor", "villa", "shop").

**Why it matters:** `prisma.inventory.findUnique({ include: { classification: true } })` (or `select`) compiles to JS even though tsc flags it (`TS2353 'classification' does not exist in InventoryInclude`), so it ships, then throws `PrismaClientValidationError: Unknown field 'classification' for include statement on model 'Inventory'` **at runtime → route 500**. This was the live bug behind "Company WhatsApp" share 500ing on the deal workspace (2026-05-19/22). It was duplicated in two places — `services/property_sharing.ts` (`shareSpecificProperty`) and `routes/deals.ts` `book-appointment` — so grep the whole backend when you see it.

**How to apply:**
- For a readable property type label use `inv.flat_property_type?.name || inv.property_type_link?.name || prettify(inv.type)` (turn the slug into Title Case). Never reference `inv.classification` or `inv.property_type`.
- The match-result payload (`MatchedProperty` in `matching_engine.ts`, served by `GET /api/deals/:id/matched-inventory`) historically carried only `location` — **not** `city`, `description`, `slug`, `display_id`. As of 2026-05-22 those four were added to the interface + both `return {}` blocks so manual/personal shares can show real location + description + a public link (`https://www.realtypandit.in/properties/<slug || display_id || id>`). The underlying `findMany` has no `select`, so all scalar columns are already in memory — adding a field is one line.
- Personal-WhatsApp share is `wa.me/<phone>?text=` — **text + link only, cannot attach images** (by WhatsApp design). Only the Company-WhatsApp Business-API template path (`rp_property_card_*_v2`) can carry image+text+buttons. See [reference_test_tsc_baseline] (tsc emits despite errors — diff against baseline) and [feedback_verify_before_done].
