---
name: Property URL slug privacy — strip flat/plot + Next16 redirect gotcha (2026-06-14)
description: How public property URLs hide the flat/plot number, how to re-slug existing rows, and why the canonical redirect MUST be middleware (not an in-page redirect) under Next 16.
metadata:
  type: reference
---

## What & why
Public property URLs leaked the unit/plot number (e.g. `…/properties/builder-flat-for-sale-in-ff1-325-4-sector-3f-…`). The SEO slug is built from `full_address`, whose leading comma-segments are the structured `flat_no` + `plot_no`. Fix keeps the address (sector/locality/city/society — good SEO) but never the flat/plot.

## Backend (slug generator) — `backend/src/utils/slug.ts`
- `SlugInput` now takes `flat_no`/`plot_no`. New **`stripUnitParts(parts, flatNo, plotNo)`** drops a part when: (1) it exactly equals flat_no/plot_no (part-level, so "Sector 6" survives plot_no "6"); (2) it's an explicit unit label (`UNIT_LABEL`: "Plot No 11","H.No 42"); (3) it's a leading bare unit token (`BARE_UNIT`: "FF1","G4","325/4","626 B","D-1601") and not a geo keyword. Otherwise it **scrubs embedded units** (`EMBEDDED_UNIT` letter-prefixed like "D-1601") + the exact flat/plot value when it's a pure number ≥3 digits (short "3"/"6" left alone so "Sector 3/6" survive).
- Fed `flat_no`/`plot_no` into `generateUniqueSlug` at `workflows/workflow_engine.ts` (add-inventory) and `scripts/backfill-slugs.ts`. `routes/public.ts` post-property only passes `location` → never leaked.
- **Re-slug existing rows:** `node dist/scripts/backfill-slugs.js --force` (idempotent). Backup first (`pg_dump` + a `{id,slug}` JSON snapshot to /root/backups). Re-scan after: 0 genuine leaks across 435 (a few `sector-N` false positives + society/project names mis-stored in `plot_no` like "Marlin Society"/"Apex Drio" are NOT leaks and are kept for SEO).

## Website redirect — `agents/website/src/middleware.ts` (NOT the page)
**GOTCHA (Next 16.1.6):** an in-page `redirect()`/`permanentRedirect()` in the `/properties/[id]` server component does **NOT** emit an HTTP redirect under streaming — it renders the page shell and returns 200 (verified: the redirect condition was true, `permanentRedirect` was called, yet the Loading shell streamed with 200). Don't rely on in-component redirects for canonical URLs here.
- The working fix is **`src/middleware.ts`**: matcher `'/properties/:slug'`, fetch `/public/properties/:id`, and if `id !== property.slug` → `NextResponse.redirect(url, 308)`. Runs before render → real 308. Backend resolver matches the trailing 12-hex id so old slugs/UUID/display_id all resolve, and the target (canonical slug) never loops.
- Verified live: old `ff1-325-4`/`g4-183` slugs, bare UUID, and `RP-*` display_id all **308 → clean slug**; canonical slug stays **200**. Browser: lands on clean URL, on-page address "Sector 3F, …" with no unit; sitemap + listing cards 0 leaks. Canonical `<link>` already pointed to `property.slug` (auto-clean after re-slug).

## Deploy notes
- `next start` (no standalone). The deploy-agent's `pm2 restart realty-website` runs as **root and fails** ("Process not found") — website runs under the **realty** user. After deploy: `chown -R realty:realty .next && sudo -u realty -H pm2 restart realty-website` (see [[deploy_website_realty_user_pm2]]). The Next build is minified, so grepping built chunks for `permanentRedirect`/`notFound` returns 0 even when present — verify behavior, not built-chunk greps.
- Transfer files to the VPS via `base64 -w0 file | ssh host "base64 -d > dest"` when `scp` flakes/resets.

See [[reference_inventory_search]], [[reference_website_lead_routing]].
