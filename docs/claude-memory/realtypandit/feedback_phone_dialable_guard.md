---
name: feedback_phone_dialable_guard
description: Gate every tel:/wa.me call link on isDialablePhone (E.164, dash-aware) — NOT !isPlaceholderPhone, which lets junk keys like "+ChiragWadhwa"/"+1" through and dials a wrong number
metadata:
  type: feedback
---

`isPlaceholderPhone` only catches `TEMP_`/`PENDING-`. It does NOT catch malformed contact keys like `+ChiragWadhwa` / `+1` / `+` (a name/partial typed into a phone field), so `<a href="tel:+ChiragWadhwa">` rendered and the dialer mis-read it → the **"incorrect number" bug on partner-referral lead tiles** (reported + fixed 2026-06-06).

**Root cause:** `backend/src/utils/phone.ts` `normalizePhone` used to fall through to `` `+${clean}` `` for ANY input — names/partials became `+garbage` contact PKs (110 such rows in prod). Its docstring already promised `''` for invalid input; it just didn't honor it.

**Rules (all live 2026-06-06):**
- **Backend:** `normalizePhone` now returns `''` for junk (`!/^\d{8,15}$/.test(clean)`). Safe — all 68 callers already guard `if (!normalized)`; no inline-unguarded stores exist.
- **Frontend:** gate call links on `isDialablePhone(phone)` (`frontend/src/lib/phone.ts`) = strip `[\s-()]` then `^\+?\d{8,15}$`. **Dash-aware on purpose** — legacy `+91-9654118097` IS dialable (dialers strip dashes), so don't reject it. Use it for the call link AND the "show number vs 'No phone'" display. **Never** gate a `tel:` link on `!isPlaceholderPhone`.
- **Forms:** validate phone inputs with `isValidPhoneInput` before POST (add-lead client phone + new-partner phone) so junk is rejected up front.
- **"Call partner agent" is on BOTH the lead AND the deal tile** (desktop + PWA — `ExternalLeads` row+detail, `LeadCard`, and `DealWorkspace`'s 🤝 Partner block), built from the denormalized `contact.referral_partner_phone`. The client tile 📞 only ever dials the *client*; the partner link dials the referring partner agent. Gate (2026-06-17): show whenever `toDialablePhone(referral_partner_phone)` is truthy — do NOT require `lead_type === 'PARTNER_REFERRAL'` (older/other partner leads were hidden by that). **The deal object's fields are shaped in `services/deal_service.ts` (`getDealById` + `listDeals` `include`/`select`), NOT in the route — add any new deal field there** (had to add `referral_partner_id/name/phone` to both for the deal tile to receive the partner number). ⚠️ Deferred: if a record only has `referral_partner_id` (no denormalized phone), no button yet — needs an id→PartnerAgent.phone fallback; and the `demand_handler_type='PARTNER'` (partner-as-handler) call link is not done.

See [[feedback_phone_normalization]] (E.164 PK + resolveStoredContactPhone), [[reference_contact_rekey_cascade]] (the data cleanup mechanics).
