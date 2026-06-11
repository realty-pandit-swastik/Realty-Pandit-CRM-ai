# Property-share WhatsApp templates — v5 (8 templates, with link)

**Status:** ✅ APPROVED + WIRED + live-verified 2026-06-10. All 8 templates APPROVED (UTILITY) on Meta; `shareInventoryCard` (Inventory page + External-Lead share) now picks the category-correct v5 card (residential→BHK, commercial→type/area, plot→plot fields) with the link in the body, v4 fallback. Live-verified: res-building→`res_rent_v5` ("2 BHK Builder Floor"), commercial→`com_rent_v5` ("Commercial Shops", not BHK), plot→`res_plot_sale_v5` ("Land / Plot") — Meta accepted all (image fetched, no 400). Deal "Company WhatsApp" path still on v4 (can migrate later for consistency).

## Why
The Inventory + External-Lead share previously sent a raw free-form message (Meta rejected silently). It now sends the v4 template card — but v4 (a) has no clickable property link, and (b) labels everything "BHK" even for commercial/plots. v5 fixes both: a clickable website link in the body, and **category-correct templates** (residential→BHK, commercial→area/rooms, plots→plot fields). 8 templates = {Residential-home, Residential-plot, Commercial-building, Commercial-land} × {Sale, Rent}.

## Common to all 8
- **Category:** UTILITY (request-fulfillment framing → delivers outside the 24h window).
- **Header:** IMAGE (property photo, passed at send time).
- **Buttons:** 3 × QUICK_REPLY — `Call Back`, `Schedule Visit`, `Next Option`.
- **7 body params** `{{1}}`..`{{7}}`; `{{7}}` = `https://www.realtypandit.in/properties/<display_id>` (auto-linked by WhatsApp).
- Language `en`.

## The 8 templates (body text)

### A. Residential — Home (BHK)
`rp_property_card_res_sale_v5` / `rp_property_card_res_rent_v5`
```
Namaste 🙏 As requested, here are the details of the residential property you enquired about:

🏡 {{1}}
📍 {{2}}
💰 Price: ₹{{3}}            (rent variant: 💰 Rent: ₹{{3}}/month)
📐 {{4}}
🛋 {{5}}
🏢 {{6}}

🔗 View photos & full details:
{{7}}

Reply here or tap a button below to schedule a visit. 🙏
```

### B. Residential — Plot/Land (no BHK)
`rp_property_card_res_plot_sale_v5` / `rp_property_card_res_plot_rent_v5`
```
Namaste 🙏 As requested, here are the details of the residential plot you enquired about:

🏞 {{1}}
📍 {{2}}
💰 Price: ₹{{3}}            (rent variant: 💰 Rent: ₹{{3}}/month)
📐 {{4}}
🧭 {{5}}
📜 {{6}}

🔗 View photos & full details:
{{7}}

Reply here or tap a button below to schedule a site visit. 🙏
```

### C. Commercial — Building (area; Rooms only if present)
`rp_property_card_com_sale_v5` / `rp_property_card_com_rent_v5`
```
Namaste 🙏 As requested, here are the details of the commercial property you enquired about:

🏢 {{1}}
📍 {{2}}
💰 Price: ₹{{3}}            (rent variant: 💰 Rent: ₹{{3}}/month)
📐 {{4}}
🪑 {{5}}
🚻 {{6}}

🔗 View photos & full details:
{{7}}

Reply here or tap a button below to schedule a visit. 🙏
```

### D. Commercial — Land/Plot (no rooms)
`rp_property_card_com_plot_sale_v5` / `rp_property_card_com_plot_rent_v5`
```
Namaste 🙏 As requested, here are the details of the commercial land you enquired about:

🏗 {{1}}
📍 {{2}}
💰 Price: ₹{{3}}            (rent variant: 💰 Rent: ₹{{3}}/month)
📐 {{4}}
🧭 {{5}}
📜 {{6}}

🔗 View photos & full details:
{{7}}

Reply here or tap a button below to schedule a site visit. 🙏
```

## Field mapping (built in `shareInventoryCard`)
| Param | A. Res home | B. Res plot | C. Com building | D. Com land |
|---|---|---|---|---|
| {{1}} | `{bhk} BHK {type}` | `{type}` ("Residential Plot") | `{type}` + `(N Rooms)` if `specs.rooms` | `{type}` ("Commercial Land") |
| {{2}} | locality, city | locality, city | locality, city | locality, city |
| {{3}} | `formatPrice` | `formatPrice` | `formatPrice` | `formatPrice` |
| {{4}} | `{area} {area_unit}` | `{plot-area} {plot-area-unit}` | `{area} {area_unit} · {area-type}` | `{plot-area} {plot-area-unit}` |
| {{5}} | `furnishing` / "Ready to Move" | `facing` + road-facing | `furnishing` / "Ready to Move" | `facing` + road-facing |
| {{6}} | floor / facing | ownership + boundary-wall | `bathrooms` washroom / floor / top amenity | ownership + boundary-wall |
| {{7}} | property link | property link | property link | property link |

## Template selection (post-approval wiring in `sendPropertyCard`)
- **residential vs commercial** ← taxonomy root slug of the inventory's `taxonomy_node_id`.
- **plot vs building** ← leaf type slug matches `/plot|land|orchard/` (same rule as the Match & Share spec selector).
- **sale vs rent** ← `inventory.intent` (`sell`→sale, `rent`→rent).
- Fallback chain if a v5 is unavailable: v5 → existing v4 (`rp_property_card_sale_v4`/`_rent_v4`) → v2.

## Submission status
Submitted to Meta 2026-06-10 via `backend/src/scripts/submit_property_templates_v5.js` (app `1868797817103904`, WABA `2124684824933246`). All **PENDING · UTILITY**:

| Template | Meta id | Status |
|---|---|---|
| rp_property_card_res_sale_v5 | 1794891478522525 | PENDING |
| rp_property_card_res_rent_v5 | 1356145563117028 | PENDING |
| rp_property_card_res_plot_sale_v5 | 1006799695333309 | PENDING |
| rp_property_card_res_plot_rent_v5 | 27388748387387276 | PENDING |
| rp_property_card_com_sale_v5 | 1540533064108510 | PENDING |
| rp_property_card_com_rent_v5 | 27773303155586447 | PENDING |
| rp_property_card_com_plot_sale_v5 | 984029361073050 | PENDING |
| rp_property_card_com_plot_rent_v5 | 2271563413586812 | PENDING |

**Next (after APPROVED):** add the 8 to the `whatsapp_templates.ts` registry, then update `shareInventoryCard`/`sendPropertyCard` to (a) select res/com × building/plot × sale/rent, (b) build `{{1}}`/`{{4}}` per the field map, (c) pass the property link as `{{7}}`. Fallback v5 → v4 → v2. Re-check status: `GET /<WABA>/message_templates?fields=name,status` (filter `_v5`).
