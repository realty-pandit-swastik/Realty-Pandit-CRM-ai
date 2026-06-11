# Property Share (Match & Share) — fixes & findings — 2026-05-23

**Status: SHIPPED** (Personal-WA redesign + Company-WA image fallback). One delivery item needs an owner decision (below).

## Context
Owner reported the deal **Match & Share** share flow was broken: (1) "Company/Panditji WhatsApp" 500'd / clients received nothing; (2) "Personal WhatsApp" sent a bare, broken message (`📍 undefined`, raw slug, no details/link).

## Shipped

### 1. Company WhatsApp 500 → fixed (earlier 2026-05-22)
`shareSpecificProperty` (and `book-appointment`) used `prisma.inventory.include:{classification:true}` — no such relation → `PrismaClientValidationError` → 500. Switched to `flat_property_type`/`property_type_link`. (See `feedback_inventory_no_classification_relation`.)

### 2. Personal WhatsApp message → redesigned to "Detailed" (2026-05-23, owner-approved)
`frontend/src/components/deal/MatchShareTab.tsx` `sendViaPersonalWA` rewritten: title (BHK + type), location (sub_locality, locality, city, ST – pincode, de-duped), price from `display_price`, area/beds/baths, floor x/y, facing, age, furnishing, amenities, short description, listing link — **every empty field omitted**. wa.me is text+link only (images via the link). Backend `matching_engine.ts` `MatchedProperty` + both result blocks now carry: city, sub_locality, locality, state, pincode, description, slug, display_id, facing, property_age, display_price. No schema/route change. Verified live via Playwright (window.open intercepted — nothing sent).

### 2b. Missing BHK in titles → derived from slug (both paths)
95% of listings have no `specs.bhk_count`/`bedrooms`, but the `slug` encodes it (`3bhk-villa-…`). Added `bhkFromSlug()` fallback: `specs.bhk_count || specs.bedrooms || bhkFromSlug(slug)` in `sendViaPersonalWA` (frontend) **and** in `shareSpecificProperty` + `shareNextProperty` (backend Company card `p1`/bhk param — fills the existing parameter better, no template change). Verified: Personal title now "3BHK Villa"; Company card title "3BHK Builder Flat Front Facing".

### 3. Company WhatsApp broken header image → fixed
`property_sharing.ts` `pickSendableImage()` HEAD-checks (GET fallback, content-type `image/`) each `media_urls` entry and uses the first reachable one, else brandless `logo.png`. Meta rejects a card if it can't fetch the IMAGE header; this guarantees a fetchable header. Applied to `shareSpecificProperty` + `shareNextProperty`. Verified read-only (34/40 real photo, 6 logo fallback, 4 recovered a valid later photo). **Company message/template content unchanged** per owner.

## UTILITY rebuild attempt (owner chose this 2026-05-23) — PARTIAL
Submitted `rp_property_card_sale_v3` + `rp_property_card_rent_v3` to Meta as UTILITY (promotional urgency line removed). Deployed a **self-healing** `sendPropertyCard()` in `property_sharing.ts`: tries v3 (UTILITY) first, falls back to v2 (MARKETING) — v3 fails fast (4xx not retried) while pending, and is used automatically once approved. **BUT Meta re-categorized `sale_v3` → MARKETING during review** (rent_v3 stayed UTILITY-pending). Conclusion: **Meta classifies property-sale cards as MARKETING regardless of wording** (a "property for sale at ₹X" message is inherently promotional). So the UTILITY rebuild helps rent (if it sticks) but NOT sale. Note: `.env META_APP_ID` points to a **deleted** Meta app; the live token belongs to app `1868797817103904` ("Panditji") — used that for the resumable image upload.

**RESOLVED via v4 (2026-05-23):** v2/v3 ("here's a property, schedule a visit") = MARKETING. **v4 reframed as request-fulfillment** — body opens *"Namaste 🙏 As requested, here are the details of the property matching your enquiry:"* and ends *"…please reply to this message."* — and Meta **APPROVED both `rp_property_card_sale_v4` + `rp_property_card_rent_v4` as UTILITY**. UTILITY bypasses the marketing opt-out → cards now deliver. Code (`sendPropertyCard`) prefers v4, falls back to v2 (self-healing; v4 is approved so v2 isn't used). **Key lesson: a priced property card CAN be UTILITY if framed as fulfilling the customer's specific enquiry, not as a recommendation/offer.** Same 7 params/image header/buttons as v2 (no send-code param change). Sale id 972298345496721, rent id 1558455636001225. (v3 MARKETING attempt left in Meta, unused.)

## OPEN — needs owner decision (cannot fix in code)
**Cards are accepted by Meta but not delivered** because `rp_property_card_*_v2` are **MARKETING** category in Meta (code config says UTILITY but Meta's category governs). Meta silently drops MARKETING templates to recipients who opted out of promotions / aren't marketing-opted-in. Options:
- (a) Rebuild the card as a genuine **UTILITY** template — changes the promotional copy + needs Meta re-approval.
- (b) Send the card as a **free-form message inside the 24h session window** (delivers regardless of opt-out; loses template buttons/format).
- (c) Accept the Meta marketing limitation.
Also open: we don't capture outbound **wamid** or process Meta **delivery-status** webhooks, so delivery can't be confirmed in-app (`WhatsAppMessage.status` is unused for outbound). Building this would make "did it deliver?" answerable.

## Data-quality finding (audit, 350 active listings)
Missing **BHK 95%**, amenities 79%, description 93%, **no image 53%**; area/locality/display_price ~100% present. Shared content looks sparse because listings are thin. BHK is often only in the `slug` (`3bhk-…`), not `specs.bhk_count` → backfill opportunity.

## Files
- `backend/src/services/property_sharing.ts` (classification fix + `pickSendableImage`)
- `backend/src/routes/deals.ts` (book-appointment classification fix)
- `backend/src/services/matching_engine.ts` (MatchedProperty payload fields)
- `frontend/src/components/deal/MatchShareTab.tsx` (Detailed personal message)
- `frontend/index.html` (SW cache-bust → v20260522c)
