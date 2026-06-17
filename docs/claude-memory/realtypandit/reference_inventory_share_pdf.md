---
name: reference-inventory-share-pdf
description: 3-option inventory share UX (PDF / WhatsApp / Link) + brandless redaction for partner agents
metadata:
  type: reference
---

# Inventory Share — 3-option UX (live 2026-05-13)

When a team member clicks "Share" on an inventory tile, a small popover offers three options:
1. **📄 PDF** → sub-popup: `With branding` (RP logo + agent contact) / `No branding` (locality only, no contact)
2. **💬 WhatsApp** → existing share-to-client flow via WhatsApp Business API
3. **🔗 Link** → public URL copied to clipboard

## Code map

| Piece | File |
|---|---|
| Frontend popover | `agents/frontend/src/components/SharePropertyOptions.tsx` |
| PDF generator | `agents/backend/src/services/pdf_generator.ts` (uses `pdfkit`) |
| PDF endpoint | `POST /api/inventory/share-pdf` in `agents/backend/src/routes/inventory.ts` (~line 747) |
| Link endpoint | `GET /api/inventory/:id/share-link` in same file (~line 834) |
| WhatsApp branch | existing `POST /api/inventory/:id/share-to-client` (unchanged) |

## Security model

**Server-side variant gating** — partner_agents are FORCED into brandless regardless of what they post. Body has `variant` field but server overrides:
```ts
let effectiveVariant: 'branded' | 'brandless' = variant === 'brandless' ? 'brandless' : 'branded';
if (agent.role === 'partner_agent') effectiveVariant = 'brandless';
```

**Authorization** preserved across all 3 options:
- super_boss: bypass
- manager: needs inventory owned by their team (via `reports_to_id` chain — fixed in audit 2026-05-13)
- employee/partner: needs direct `uploaded_by_agent_id` / `assigned_agent_id` / `reference_agent_id` / `shared_with_ids` match

## Brandless redaction

`redactForBrandless()` in `pdf_generator.ts` strips:
- `owner_phone`, `owner_name`
- `full_address`, `flat_no`, `plot_no`, `apartment_name`, `sub_locality`

Keeps: `locality`, `city`, `district`, `state`, `specs`, `features`, `price`, `images`, `type`.

Partner watermark: brandless PDFs can carry the partner's name + phone in the footer (passed as `partner_name`/`partner_phone` in the request body, defaults to the agent's own name+phone).

## Reuse

For any future inventory list (e.g., on Deal cards), import:
```tsx
import SharePropertyOptions from './SharePropertyOptions';
<SharePropertyOptions item={inventory} onClose={...} onWhatsAppChosen={...} />
```

The component already handles PDF download (Blob → anchor click → revokeObjectURL) and clipboard copy.

## Recipient-aware sharing + dealer brochure (live 2026-06-13)

When a team member multi-selects inventories and shares, the system now recognizes the recipient and routes:
- **direct customer** → the existing **v5 property card** (`shareInventoryCard`) — UNCHANGED.
- **dealer/partner** (an ACTIVE `PartnerAgent` by phone) → a **brand-free single-property PDF brochure** delivered as a **WhatsApp DOCUMENT template** (`rp_property_brochure_v2`, APPROVED **UTILITY**), one message per property, "k of N". They can forward it to their own buyer with no RP trace.

**Template category trap (2026-06-13):** `rp_property_brochure_v1` was auto-reclassified **MARKETING** by Meta (its name is now locked ~4 weeks — abandoned, do not use). `rp_property_brochure_v2` is the LIVE one — got **UTILITY** by mirroring the v5 cards' request-fulfillment framing: *"As requested, here are the complete details of the {{1}} (Property {{2}}) you enquired about."* `BROCHURE_TEMPLATE_NAME` in `config/whatsapp_templates.ts` points at v2. Lesson: property-share templates land UTILITY only with explicit "as requested … you enquired about" wording; generic "here are the details" → MARKETING.

Code map (additive — never touched the v5 card path):
| Piece | File |
|---|---|
| Recognizer `resolveShareMode(phone)` → `{mode:'direct'|'dealer', partner}` | `backend/src/services/share_recognition.ts` |
| Batch endpoint `POST /inventory/share-batch-to-client` (loops, picks mode, stamps deal_id) | `backend/src/routes/inventory.ts` |
| Public brochure PDF `GET /inventory/:id/brochure.pdf?variant=&token=` (token-signed) | `backend/src/routes/inventory.ts` |
| `shareInventoryBrochure` + `resolveActiveDealId` | `backend/src/services/property_sharing.ts` |
| `sendDocumentTemplate()` | `backend/src/services/whatsapp.ts` |
| HMAC link token (id+variant+exp) | `backend/src/utils/pdf_token.ts` |
| Submission script | `backend/src/scripts/submit_brochure_template.js` |
| Own-WhatsApp follow-up button + `buildWhatsAppShareText` | `frontend/src/components/InventoryList.tsx` (+ mobile), `frontend/src/lib/buildWhatsAppShareText.ts` |

**⚠ Brochure link MUST use the bare `/inventory/:id/brochure.pdf` mount — NOT `/api/inventory/...`.** The `/api` prefix is auth-gated by an earlier router (`app.use('/api', apiRoutes)` in `app.ts` runs before the inventory mount) → `/api/inventory/...` returns **401**. The router is mounted at BOTH `/inventory` (public) and `/api/inventory` (proxied/auth). The brochure URL uses `API_BASE_URL` (`https://api.realtypandit.in`) + `/inventory/...`. Verified live: `/inventory` → 200 PDF; `/api/inventory` → 401.

**Brandless redaction updated (2026-06-13):** now KEEPS `apartment_name` (building) + `locality` + `city` (per owner: "building + locality + city visible"); strips only `flat_no`, `plot_no`, `full_address`, `sub_locality`, owner contact. Inventory `display_id` is printed in the brandless footer corner. Filename is human-readable + brand-free (`brochureFilename()`, e.g. `3BHK-Flat-Whitefield-RP-GZB-RES-20471.pdf`).

**Timeline fix:** the batch share stamps `metadata.deal_id` (via `resolveActiveDealId`) on every `property_shared` interaction, so inventory-page shares now appear in the deal pipeline timeline + already-shared set (previously they didn't — no deal_id was written). See also the deal-timeline read at `deal_service.ts:getDealTimeline` + `deals.ts` `alreadySharedIds` (both filter `metadata.deal_id`).

**Tracking** (did the client open/forward the PDF) was deliberately deferred ("leave it for now"). The document-template delivery loses link-click tracking anyway (Meta fetches the file once). If revisited, use per-share tokenized links + log opens.

## ✅ PDF rendering RESOLVED (redesigned + verified live 2026-06-13)

**FIXED** in `pdf_generator.ts`: embedded `DejaVuSans.ttf`+`-Bold` (bundled in `agents/backend/assets/fonts/`, registered as `RP`/`RP-Bold`; system fallback `/usr/share/fonts/truetype/dejavu/`) so ₹ renders; **dropped emoji** (📍 gone, 📞→`Tel:`); **one photo per near-full page** (details page + a page per photo, uniform `fit:[w-80,h-180]`); exported **`buildSpecRows(inv)`** = residential / commercial / plot-aware specs. Verified live on RES-20487 (9 photos) + COM-20481 (plot). The original problem (kept below for reference):

The first real dealer brochure (`Office-Ghaziabad-RP-MEE-COM-20427.pdf`) showed the content was broken:
- **Glyph mojibake:** pdfkit's built-in **Helvetica is WinAnsi-encoded** — it CANNOT render the ₹ rupee sign (U+20B9 → prints as `¹`) or emoji (📍 → `Ø=ÜÍ`, 📞 → `Ø=ÜÞ`). Fix: **embed a Unicode TTF** (Noto Sans / DejaVu Sans, which include ₹) via `doc.registerFont(...)`, and **drop emoji** (pdfkit has no color-emoji support) — use plain text labels instead.
- **Image layout cramped:** current hero + tiny 3-thumbnail strip looks broken. Want: **images stacked vertically, equal width (full content width), one below another**, readable; paginate when many.
- **Type-aware layout:** must handle **residential AND commercial** spec sets (res: BHK/bath/area/furnishing/floor/facing/age; com: area/floors/washroom; plot: area/facing/ownership) — mirror the type-aware chip logic the website cards use.
- The font .ttf must be added to the backend (e.g., `assets/fonts/`) and deployed.

## Add-lead-on-share (live + verified 2026-06-13)

When a team member types a number on the share screen that isn't in our DB, a prompt offers **"Add as a new lead"** → Direct client | Partner agent → requirement auto-seeded from a chosen shared inventory → creates the contact + pipeline deal, then drops into the normal share.
- **Endpoint:** `POST /inventory/share/add-lead` `{ phone, name, role:'direct'|'partner', inventory_id }` (`routes/inventory.ts`). Reuses `ensureDealForLead` + `ensurePartnerAgent` + `sendPartnerWelcomeWhatsApp` — **does NOT touch `routes/leads.ts`**.
- **Mapper:** `services/inventory_to_demand.ts` `buildDemandFromInventory(inv)` — sell→buy, bhk, locality+city, ±15% budget band, inventory `taxonomy_node_id`→`demand_taxonomy_node_id`.
- **direct** → BUYER contact + deal (QUALIFIED, `executive_agent_id`=uploader, `DIRECT_INTERNAL`). **partner** → `PartnerAgent` (welcome fired) + on-behalf deal (`deal_scenario=PARTNER_INTERNAL`, `demand_handler_type=PARTNER`, `demand_handler_id`=partner) with a **`PENDING-` placeholder buyer** (client name/phone optional, added later — `lead_type=PARTNER_REFERRAL`, `referral_partner_id` set). Assigned to the uploader; `owning_manager_id` inherits the partner's `managing_agent_id`. See [[reference_partner_multi_lead]].
- **⚠ Gotcha (cost a 500 in verify):** the **Inventory** model's geo fields are **`latitude`/`longitude`**, NOT `preferred_lat`/`preferred_lng` (those are Contact fields). Selecting `preferred_lat` on Inventory throws `Unknown field`. The mapper reads `inv.latitude`/`inv.longitude`.
- **Verify note:** the share endpoints are POST under the auth-gated `/api` mount → need the `rp_csrf` cookie as `X-CSRF-Token` (see `precautions/csrf-cookie-pattern`); a raw fetch without it gets 403. Drive via the UI (axios adds it) or replicate the header.

## Dependencies

- `pdfkit@^0.15.2` (server-side, no Chrome headless needed)
- `@types/pdfkit@^0.13.4`

Both in `agents/backend/package.json` and installed on prod (`/var/www/realty-pandit/backend/node_modules/pdfkit`).
