---
name: reference_placeholder_phone_and_admin_fixes_2026-06
description: 2026-06-03 batch of 6 admin fixes (partner placeholder-phone, Ext.Leads counter, partner location autocomplete+geo, buyer-chat nav removal) + the isPlaceholderPhone rule. All deployed AND Playwright-verified live 2026-06-03 (bundle index-BNVnh5Sz.js).
metadata:
  type: reference
---

**Placeholder-phone rule (reusable).** Leads with no real number (partner referrals) use a non-dialable
Contact id: `TEMP_…` (legacy) or `PENDING-<partnerKey>-<ts><rand>` (current). These must NEVER be
normalized or dialed. Helpers added 2026-06-03:
- Backend `utils/phone.ts#isPlaceholderPhone(p)` — used in `resolvePhone` (routes/leads.ts) +
  `resolveStoredContactPhone`. **Bug it fixed:** `resolvePhone` only guarded `TEMP_`, so opening a
  `PENDING-` lead ran normalizePhone → junk (`+PENDING8766…`) → 404 "Could Not Load Lead". Now both
  prefixes short-circuit to exact-match. [[feedback_phone_normalization]]
- Frontend `lib/phone.ts#isPlaceholderPhone()` — used in LeadCard / ExternalLeads / DealWorkspace to
  HIDE the call button + show "No phone" for placeholders. **Bug it fixed:** `tel:${PENDING-8171822219-…}`
  → dialer stripped letters, read digits, prefixed +81 (Japan) → `+81718222192868` invalid number.

**The 6 fixes (all DEPLOYED 2026-06-03):**
1. Ext.Leads counter — `recent-external` returns `{leads,total}` but the frontend discarded `total` and
   summed by-source (ignored filters) + capped at 500. Now `ExternalLeads.tsx` captures `recentTotal`,
   header/badges are filter-aware, "Showing N of M" + **Load-more** (`pageLimit` += 500). Removed dead
   `leadsBySource`/by-source fetch.
2. Click-to-call invalid number — placeholder guard (above).
3. Partner "Location" → Google Places autocomplete on BOTH add (`PartnerManagement.tsx`, the
   `business_address` field) and edit (`PartnerProfile.tsx`, the `city` field), reusing the
   `loadGoogleMaps` + Places pattern from `DemandRequirementsForm`. **Geo persisted:** added
   `PartnerAgent.business_lat`/`business_lng` (Float?) via additive `ALTER TABLE partner_agents` +
   `prisma generate` (NOT migrate-deploy, to avoid touching migration history on the live DB; snapshot
   `partner_agents_bak_20260603`). Routes `POST/PATCH /api/partners` (routes/api.ts) + `createPartner`/
   `updatePartner` (client.ts) pass the coords.
4. "Can't add multiple leads per partner" — **NOT a current bug.** Backend allows it (unique `PENDING-`
   keys, idempotent `ensurePartnerAgent`, `referral_partner_id` not unique). The real past blocker was a
   STALE `Unknown argument demand_bhk` in `contact.create` (log timestamps May 30–31), already fixed by
   earlier deploys; today's logs are clean. `foldLegacyDemand` returns only node+schema_values (no leak).
5. Partner `PENDING-` lead won't open — placeholder guard (above).
6. "Buyer Lead (Chat)" admin tab REMOVED from nav (`DashboardLayout.tsx`) — 0 `admin_buyer_chat`
   appointments ever, redundant with "+ Add Lead". The `BuyerWorkflowEngine` + route kept (WhatsApp bot
   uses it).

**Verification — ALL 6 VERIFIED LIVE via Playwright (2026-06-03), bundle `index-BNVnh5Sz.js`:**
- #5: KBNOW `PENDING-` lead opens (no "Could Not Load Lead").
- #2: list shows "No phone" (not the raw PENDING- string), call button hidden.
- #1: header = true total (1,758), "Showing 500 of 1,758" + Load-more fetches limit=1000 → "Showing 1,000 of 1,758".
- #3: partner Location field shows live Google Places suggestions ("powered by Google").
- #4: POSTed 2 partner-referral leads for one partner → both 201 (then test data deleted).
- #6: "Buyer Lead" gone from nav; Ext.Leads/Deal Pipeline intact.
Deploy: ts-node backend (scp+restart) / build-on-server frontend. PWA needs hard-refresh ×2.
**Gotcha:** Playwright `.click()` on the Load-more button was flaky during the 30s auto-refresh — a real
DOM `b.click()` worked. Use a DOM click when the SPA repaints under you.
