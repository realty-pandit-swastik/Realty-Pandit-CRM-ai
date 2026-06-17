---
name: precaution-inventory-media
description: Inventory media + price pitfalls — pending-URL 404s, HEVC video won't play in browsers, absurd demand prices; the guards now in place
metadata:
  type: feedback
---

Three inventory data/media traps found 2026-06-13 (admin Property Details viewer), with fixes shipped:

**1. `/uploads/pending/` 404 images.** New-listing uploads land in the transient `/uploads/pending/` dir; `utils/media_promote.ts` moves them to permanent `/uploads/properties/<id>/` at workflow commit, and `jobs/cleanup_uploads.ts` deletes pending files >24h old that aren't referenced. The 404 bug = a race (pending file swept before commit) where `promotePendingMedia` then left the dead pending URL on the inventory. **Fix:** `promotePendingMedia` now **DROPS** unrecoverable pending URLs (file gone) instead of returning them, and `workflow_engine` persists on drop (not just on move). **Never persist a `/uploads/pending/` URL.** Repair for existing: `scripts/heal_pending_media.js` (drops dead pending URLs; only 2 listings were affected).

**2. HEVC/H.265 video won't play.** Phone videos are often H.265 — desktop Chrome can't decode it in `<video>` (black frame, won't play). The file serves fine (200, range OK); it's a codec problem. ffmpeg 6.1.1 IS on the server. **Fix path (Part B, transcode to H.264):** `ffmpeg -i in.mp4 -c:v libx264 -preset medium -crf 23 -c:a aac -movflags +faststart out.mp4`, async (heavy), + backfill existing HEVC. Detail-view media URLs are RELATIVE and resolve on `admin.realtypandit.in` (which proxies `/uploads` to the backend) — both images and video go through that proxy.

**3. Absurd demand `price`.** A few listings had garbage `price` (₹782 Cr on a flat) while `display_price` was correct. **Fix:** `utils/price_sanity.ts` `absurdPriceError()` rejects demand price > ₹100 Cr for a non-plot **unit** on inventory create + edit (land/plots exempt). Repair: `scripts/repair_absurd_prices.js` set `price=display_price` where display was sane; flagged `needs_taxonomy_review` where both were absurd (didn't guess).

**Note:** the admin inventory list is **role-scoped** (employees see only their own/assigned; super_boss sees all). The admin **Property Map** (`PropertyMapView`) and the inventory page use the SAME `getInventory` endpoint — the map loads `limit:1000` + plots geocoded ones, the list paginates 20/page. So "on map but not in list" is pagination/search, not missing data. The map labels the **demand** price; the list shows **display** — they can differ.
