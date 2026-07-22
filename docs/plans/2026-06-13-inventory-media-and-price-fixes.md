# Inventory Media + Price Data Fixes Implementation Plan

> **For agentic workers:** Execute with **superpowers:executing-plans** (INLINE, phase-boundary checkpoints — per `feedback_subagent_overhead`). Steps use `- [ ]`. **Back up the prod DB before any backfill** (`reference_prod_db_backup`).

**Goal:** Fix the three inventory issues found 2026-06-13: (A) images 404 because their URLs point to the transient `/uploads/pending/` dir (files swept by cleanup); (B) videos won't play because they're H.265/HEVC, which browsers can't decode; (C) a few listings have garbage demand `price` values (e.g. ₹782.7 Cr on a flat). Each part = **data repair** + **prevention**.

**Architecture:** Reuse the existing `utils/media_promote.ts` (pending→permanent mover), `jobs/cleanup_uploads.ts`, `services/storage.ts` (sharp), the installed **ffmpeg 6.1.1**, and the BullMQ queue infra. No schema changes except (C) optionally a `needs_taxonomy_review`-style flag reuse.

**Sequencing (independent — ship in this order):** **A** (image data repair — fast, fixes live 404s) → **C** (price repair + guard — fast) → **B** (video transcode — the heaviest; ffmpeg pipeline + async queue + backfill). B can be its own effort if you want A+C shipped first.

**Findings recap (proven):**
- Cleanup job is correct (skips referenced files). The dead images are **gone from disk** (unrecoverable) → repair = drop the dead URLs. Only **2 listings** affected (RP-GZB-COM-20503, RP-GZB-RES-20459), 10 dead URLs.
- ffmpeg **is** installed (`/usr/bin/ffmpeg`, 6.1.1). The sample video is `hevc`.
- **4 listings** have absurd demand `price` (RP-GZB-RES-20409 ₹782.7 Cr/display ₹5.25 Cr; RP-MEE-COM-20393; RP-GZB-RES-20349; RP-GZB-RES-20358 — this last has BOTH price+display = ₹450 Cr, so display is also wrong).

---

# Part A — Images: kill dead `/uploads/pending/` URLs + prevent recurrence

**Files:** `scripts/heal_pending_media.js` (create, one-off), `utils/media_promote.ts` (already exists — reuse), an inventory **save-time guard** in `routes/inventory.ts` / the workflow commit.

- [ ] **A1 — Backup**, then write + run a heal script. For every inventory whose `media_urls`/`video_urls` contains `/uploads/pending/`: first try `promotePendingMedia` (in case the file still exists), then **drop any URL still pointing at `/uploads/pending/`** (file confirmed gone). Persist the cleaned arrays.

```js
// scripts/heal_pending_media.js — run on server: node scripts/heal_pending_media.js [--apply]
require('dotenv').config({ quiet: true });
const fs = require('fs'); const path = require('path');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const PENDING = '/uploads/pending/';
const UPLOADS = path.join(process.cwd(), 'uploads');
const exists = (url) => { try { return fs.existsSync(path.join(UPLOADS, url.replace('/uploads/', ''))); } catch { return false; } };
(async () => {
  const invs = await p.inventory.findMany({ select: { id: true, display_id: true, media_urls: true, video_urls: true } });
  let touched = 0;
  for (const inv of invs) {
    const fix = (arr) => (arr || []).filter((u) => !(typeof u === 'string' && u.includes(PENDING) && !exists(u)));
    const m = fix(inv.media_urls), v = fix(inv.video_urls);
    const changed = m.length !== (inv.media_urls || []).length || v.length !== (inv.video_urls || []).length;
    if (changed) {
      touched++;
      console.log(`${inv.display_id}: media ${(inv.media_urls||[]).length}->${m.length}, video ${(inv.video_urls||[]).length}->${v.length}`);
      if (APPLY) await p.inventory.update({ where: { id: inv.id }, data: { media_urls: m, video_urls: v } });
    }
  }
  console.log(`${APPLY ? 'APPLIED' : 'DRY-RUN'} — ${touched} inventories with dead pending URLs`);
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
```
  Run dry-run first (confirm 2 listings), then `--apply`.

- [ ] **A2 — Prevent recurrence: promote at save time, never persist a pending URL.** Audit every path that writes `media_urls` on inventory create/commit: the workflow commit already calls `promotePendingMedia` (`workflow_engine.ts:932`). Add a **belt-and-suspenders guard** in the inventory create/commit handler(s): before saving `media_urls`, run `promotePendingMedia(inventoryId, urls)` and then **drop any url still under `/uploads/pending/` whose file is missing** (so a stale draft URL never gets persisted as a permanent 404). Reuse the `exists()` check.

- [ ] **A3 — (defense) cleanup race:** in `jobs/cleanup_uploads.ts`, before deleting an unreferenced pending file, it already checks age>24h + not-referenced — keep. Add: log (don't delete) any pending file that IS referenced (shouldn't happen, signals an un-promoted commit). Optional: shorten nothing; just observability.

- [ ] **A4 — Verify:** re-open RP-GZB-COM-20503 in the admin detail view → no black tiles (dead ones removed; the 4 good photos remain). Re-run the heal dry-run → 0 affected.

---

# Part C — Price data: repair garbage demand prices + add a save guard

**Files:** `scripts/repair_absurd_prices.js` (create, one-off), price guard in the inventory create/edit handler (`routes/inventory.ts`).

- [ ] **C1 — Backup**, then write + run the repair script. For each inventory where the demand `price` is absurd:
  - if `display_price` is sane → **set `price = display_price`** (display is the trusted value).
  - if BOTH `price` and `display_price` are absurd (e.g. RP-GZB-RES-20358) → **set `needs_taxonomy_review = true`** (or a review flag) and leave for owner correction; **don't guess**.

```js
// "absurd" = demand price > 50× display (and display set), OR > ₹100 Cr (1e9) for a non-land residential/commercial unit.
const ABS_CEIL = 1_000_000_000; // ₹100 Cr
function isAbsurd(price, display) {
  if (!price) return false;
  if (display && price > display * 50) return true;
  if (price > ABS_CEIL) return true; // tune per category; land can be high — exclude category 'agricultural'/plots if needed
  return false;
}
// repair: if isAbsurd(price,display): if (display && !isAbsurd(display,display)) set price=display; else flag needs review.
```
  Dry-run (lists the 4 + the action per row), confirm, then `--apply`.

- [ ] **C2 — Save guard.** In the inventory create + edit handlers, after resolving `price`/`display_price`, validate: reject (400 with a clear message) or clamp+flag when `price` is absurd vs `display_price` (the same `isAbsurd`), so a fat-fingered ₹782 Cr can't be saved. Keep land/plots exempt from the absolute ceiling (genuine high value). Mirror the existing `budget_sanity` util pattern if present.

- [ ] **C3 — Verify:** the 4 listings show sane demand prices (or a review flag); try saving an absurd price via the edit form → blocked with a message.

---

# Part B — Video: transcode HEVC → H.264 (the heavy one)

**Files:** `services/video_transcode.ts` (create), a BullMQ **transcode worker** (`queues/workers/`), wire the video-upload route (`routes/inventory.ts :id/upload`), `scripts/backfill_transcode_videos.js` (create).

- [ ] **B1 — Transcode service** (ffmpeg 6.1.1 is installed). `transcodeToH264(absPath) → newPath`: probe with `ffprobe`; if the video codec is already `h264`, no-op; else run:
  `ffmpeg -i in.mp4 -c:v libx264 -preset medium -crf 23 -c:a aac -movflags +faststart out_h264.mp4`
  then atomically replace (write to a temp name, then rename over / update the URL to the new file). `+faststart` enables progressive streaming; H.264+AAC plays in every browser.

- [ ] **B2 — Async on upload (don't block the request).** The video-upload route saves the file then **enqueues a transcode job** (BullMQ — reuse the existing queue infra) with the inventory id + file path. The worker transcodes, swaps the file (or adds a `_h264.mp4` and repoints `video_urls`), and is idempotent (skip if already h264). Large files (45 MB+) → async is essential. Surface status if useful (optional `media_score`/a transcoding flag).

- [ ] **B3 — Backfill existing HEVC.** `scripts/backfill_transcode_videos.js`: iterate all `video_urls`, `ffprobe` each, enqueue/transcode the non-h264 ones (rate-limited; these are big). Dry-run lists how many are HEVC first.

- [ ] **B4 — Verify:** upload an HEVC clip on a test listing → after the worker runs, the detail view plays it in Chrome; `ffprobe` shows `h264`. A backfilled old video plays too.

> **Note (B is heaviest):** ffmpeg transcoding is CPU-heavy and slow on big files; do it on the queue, watch server load, and consider a concurrency cap of 1–2. If you want A+C live now, ship B separately.

---

## Skills used while executing
- **superpowers:executing-plans** — inline, phase checkpoints.
- **systematic-debugging** — only if a repair/transcode misbehaves (reproduce → trace).
- **verify** + **playwright** — open the admin detail view: no black image tiles (A), sane prices (C), video plays in-browser (B). Screenshots as evidence.
- **verification-before-completion** — DB + visual evidence before done.
- **Project runbooks** — prod-DB-backup before A1/C1 backfills; `deploy.md` (deploy-agent + worktree); GlitchTip on new routes/workers.

## Verification (program-level)
- **A:** RP-GZB-COM-20503 + RP-GZB-RES-20459 show only real photos; heal dry-run → 0; a fresh inventory-create never persists a `/uploads/pending/` URL.
- **C:** the 4 listings have sane/ flagged prices; absurd price rejected at save.
- **B:** HEVC upload + a backfilled video both play in Chrome (`ffprobe` = h264).

## Self-review
- **Coverage:** images 404 (A1 repair + A2 prevent) ✅; video unplayable (B transcode + backfill) ✅; garbage price (C repair + guard) ✅.
- **Reuse:** `media_promote`, `cleanup_uploads`, `storage`/sharp, ffmpeg, BullMQ — all existing. New: heal/repair/backfill scripts, transcode service+worker, price guard.
- **Risk / low-blast:** A1 only drops confirmed-missing pending URLs (keeps everything else); C1 only touches absurd prices (4 rows) and flags rather than guesses when unsure; B runs async with a concurrency cap and is idempotent. All backfills dry-run first + DB backup.
- **Independence:** A, C, B are independent — each ships + verifies on its own.

## On completion
Update memory: extend `reference_inventory_share_pdf` or a new `precaution_inventory_media` note — pending→permanent promotion must run at save (never persist a pending URL); browsers can't play HEVC (transcode to H.264 on upload); add the price save-guard. Append outcomes to `PROJECT_STATUS.md`.
