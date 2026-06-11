# Address Capture Redesign — Implementation Plan

**Date:** 2026-05-27
**Goal:** Replace the single free-text geocode box with a guided, **type-aware**, hierarchical address capture (City → Locality → Society/Building → Unit) that pulls **building/society names + an exact building pin from Google**, so inventory matches client requirements more reliably.

**Status:** PLAN (awaiting approval). No code yet.

---

## Locked design decisions (from discussion)
- **Type-aware**: flats → society/tower/unit; plots/land → plot no/dimensions/road; independent house → house no/locality.
- **Building source**: Google **establishment** autocomplete **now**; promote frequent societies into our own DB **later** (separate phase).
- **Scope (first build)**: **admin forms only** — the Add wizard's address step + the Edit "Address" tab (desktop + mobile). Website-chat / WhatsApp keep their current simpler capture.

## Current state (grounded)
- `components/GooglePlacesInput.tsx`: one box, `types:['geocode']` → extracts `sub_locality, locality, district, state, pincode, lat/lng`. **Excludes establishments** (no society/building suggestions); apartment name is free-typed; pin is street-level, not the building.
- Address step is the workflow `address_block`; per-type rules come from `workflow_engine.getAddressRules()` → `{ sub_category_slug, floor_required, bhk_required, plot_area_required }` (a small type-aware foundation already exists).
- Stored columns: `city, district, locality, sub_locality, apartment_name, flat_no, floor_number, total_floors, plot_no, state, pincode, latitude, longitude, full_address`.
- **Matching** (`matching_engine.ts`): PRIMARY = lat/lng Haversine radius (2→5→10 km); text locality is fallback; **society name unused**. → A building-exact pin is the single biggest matching win; consistent city/locality helps the fallback.
- Google **Places library is already loaded** (`loadGoogleMaps`), so establishment autocomplete adds no new API/setup — only more Autocomplete calls (same billing line).

---

## Field map by property class (type-aware)
Driven by an extended `getAddressRules` → an `address_layout` hint:

| Class (from taxonomy/sub-category) | Fields shown |
|---|---|
| **Flat / Apartment / Builder Floor / Penthouse / Studio / Service Apt** | City → Locality → **Society/Building** (establishment autocomplete) → Tower/Block, Floor, Total Floors, Unit no |
| **Independent House / Villa / Bungalow / Kothi / Farm House** | City → Locality → **House/Building name** (optional establishment) → House no, Floors |
| **Plot / Land (all plot types) / Agriculture** | City → Locality/Sector → **Plot no**, Dimensions, Road width-context → (no society/tower) |
| **Commercial (shop/office/showroom/etc.)** | City → Locality → **Building/Complex** (establishment) → Unit/Shop no, Floor |

---

## Tasks

### Task 1 — Establishment autocomplete in `GooglePlacesInput`
- Add a `mode?: 'geocode' | 'establishment'` prop (default `geocode` = today's behavior, so nothing else breaks).
- `establishment` mode: `types:['establishment']` (fallback `['premise']`), `locationBias` to the chosen locality/city (passed via a new optional `bias?: {lat,lng}` or city string), and **include `place.name`** in the `PlaceResult` (extend the interface with `name?`).
- Returns: `name` (society/building), exact `lat/lng`, plus pincode/locality it can resolve.

### Task 2 — Extend `getAddressRules` (backend) with an `address_layout`
- Add `address_layout: 'flat' | 'house' | 'plot' | 'commercial'` derived from the taxonomy node / `sub_category_slug` (reuse the existing cache). Keep the existing `*_required` flags.
- Served via the existing `address_block` metadata path (no route change).

### Task 3 — Rebuild the admin address UI (hierarchical + type-aware)
A shared `AddressFields` component used by the Add wizard renderers (`AddInventory.tsx` + `InventoryModal.tsx` `address_block` case) **and** the Edit Address tab (`InventoryList.tsx` + `MobileInventoryEdit.tsx`):
- **City** — Google **city autocomplete** (`types:['(cities)']`) → sets `city`; biases everything below.
- **Locality** — Google autocomplete scoped to the city → fills `locality` (+ pincode/state).
- **Sub-locality (OPTIONAL)** — shown right after Locality; Google autocomplete (sublocality/neighborhood) with manual fallback → `sub_locality`.
- **Society/Building** (establishment autocomplete, flat/commercial layouts) → fills `apartment_name` + **canonical building `lat/lng`**; "can't find → type manually" fallback.
- **Unit block** by layout: Tower/Floor/Unit (flat), House no (house), Plot no/Dimensions (plot).
- **Map-pin confirm — OPTIONAL, NOT mandatory** — a small map to let the uploader nudge the pin; fully skippable.
- Keep all values writing the **existing columns** (no schema change); building pin → `latitude/longitude`.

### Task 4 — Storage + matching
- Ensure `city` is written first-class (today derived from district).
- No matching code change required (already lat/lng-radius); building pin improves it for free. (Society-name matching = later DB phase.)

### Task 5 — Verify
- `npm run build` gate; deploy admin frontend (+ backend if `getAddressRules` changes ship).
- Playwright: Add wizard address step + Edit Address tab, for a **flat** (society autocomplete + building pin) and a **plot** (plot/dimensions, no society). Save round-trip → confirm `apartment_name`, `city`, building `lat/lng` persisted.
- Matching sanity: a saved building pin returns in a buyer's radius search.

## Out of scope (tracked for later)
- Website post-property chat + WhatsApp address capture (kept simple for now).
- Own **society/project DB** + society-level matching/dedup (the "later" phase).
- New Google Places API migration (legacy `Autocomplete` widget is fine for v1).

## Resolved specifics (2026-05-27)
- **City** = Google city autocomplete (`types:['(cities)']`) — not a fixed dropdown.
- **Locality** = Google autocomplete (scoped to city).
- **Sub-locality** = optional field after Locality.
- **Map-pin confirm** = included but **optional / skippable** (never blocks save).
