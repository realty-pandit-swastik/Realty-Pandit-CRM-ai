---
name: reference_inventory_search
description: BOTH the admin inventory search (top bar + Location filter) AND the public website property search use the word-aware matcher findInventoryIdsByAddress (utils/inventory_search.ts) — tokens classified text/numeric/phone; numbers match on WORD BOUNDARY so "Sector 4" ≠ "Sector 5"/pincode/phone-digit. Admin deployed 2026-06-07, public site 2026-06-08.
metadata:
  type: reference
---

As of **2026-06-07** the inventory search is **word-aware**, replacing the old `tokenizedTextSearch`
(which was wrong both ways: a lone "4" matched phones + any stray "4" → flooded results with other
sectors; AND-of-every-word over fields that omitted pincode/sub_locality/state/flat_no → a full address
returned zero).

**How it works now** — [`utils/inventory_search.ts`](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/utils/inventory_search.ts) `findInventoryIdsByAddress(query, { includePhone })`:
- Tokenize on whitespace/commas; **classify each token by shape** (`classifyToken`):
  - **text** (has a letter: "vaishali", "ganga", "S4", "GK1-180") → **substring** ILIKE → partial words match.
  - **numeric** (pure digits, <7: "4", "150", pincode "201310") → **word-boundary** regex `~* '\y<n>\y'` →
    "4" matches "Sector 4" but NOT "201014" / "Sector 40" / a phone digit.
  - **phone** (pure digits ≥7) → matched against `owner_phone`/`key_holder_phone` (digits-stripped) — only when
    `includePhone` (the top search bar). The **Location filter** passes `includePhone:false` (address only).
- AND of all tokens, via a parameterized `$queryRaw` over a lowercased `concat_ws` of **every** address column
  + `display_id` + `uploader_name`/`key_holder_name` + the owner contact's name (`LEFT JOIN contacts oc ON
  oc.phone_number = i.owner_phone`). Returns inventory ids.
- Wired in [`routes/inventory.ts`](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/routes/inventory.ts) (~L338 Location filter, ~L357 search bar): `where.AND.push({ id: { in: ids } })`,
  preserving the role-visibility OR — **mirrors the proximity filter id-prefilter** (~L402). So visibility/BHK/
  taxonomy/proximity still compose. Empty match → `id:{in:[]}` → no rows.

**Verified live (deployed endpoint, super_boss token):** "Vaishali sector 4" 145→**68** (sectors now
discriminate: 4→68, 5→35); a full address incl. pincode **finds** its property (was 0); plot-number search and
"vaish" partial both work. The user accepted this 2026-06-07.

**Public website (customer site) — same matcher, fixed 2026-06-08.** `realtypandit.in/properties` had the
SAME class of bug from a DIFFERENT path: (1) the Google-Places search box ([`PropertyToolbar.tsx`](clients/sunny-sharma/projects/reality-pandit/agents/website/src/components/properties/PropertyToolbar.tsx)) emitted only
`place.locality` (= the CITY "Ghaziabad"), throwing away "Sector 4"/"Vaishali"; (2) [`public.ts` GET
`/public/properties`](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/routes/public.ts) filtered by a single whole-string `location` `contains` → all-city dump (321/369). Fix:
- **Website `PropertyToolbar`** now emits the **full granular address** (`place.full_address`) via a new
  combined `onPlaceSelect(location, city)` callback, and keeps the clean **city** separately for the New-Launch
  **Projects** tab (which filters by `city`). Both set in ONE `setFilters` update — calling two `updateFilter`s
  in the same event clobbers (each reads the same stale `filters` closure). `properties/page.tsx` got a
  `filters.city` field; Projects uses `params.city = filters.city || filters.location`.
- **Public API** reuses `findInventoryIdsByAddress(location, { includePhone:false })` → `where.AND.push({id:{in}})`,
  first stripping Google formatted-address cruft (trailing ", India" + 6-digit pincode, with raw fallback) so a
  full address doesn't over-constrain to zero. Verified live (no auth): "Ghaziabad" 369 vs "Sector 4, Vaishali,
  Ghaziabad" **67** (5→33), full address incl. pincode/India also 67; first result slug
  `apartment-for-sale-in-sector-4-vaishali-ghaziabad`.
- Deploying the website needs the [[deploy_website_realty_user_pm2]] gotcha (restart under the realty user).

**Known boundary (acceptable, not a bug):** a standalone number matches anywhere on a word boundary, so
"sector 4" can also match a property with "Plot 4" etc. Tighter phrase/adjacency matching ("sector 4" as a
unit) is a possible future follow-up if precision complaints recur.

**Scope:** `tokenizedTextSearch` ([utils/search.ts](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/utils/search.ts)) was **inventory-only**; it's now unused by the route (kept
+ its test). Deals/leads search is separate and untouched. See [[reference_taxonomy_filters]] (the property-type
filters), [[feedback_prod_backend_paths]] (server build path).
