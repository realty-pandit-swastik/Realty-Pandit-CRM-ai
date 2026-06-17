---
name: reference_qa_scan_false_positives
description: Known recurring FALSE POSITIVES in the realty-pandit-qa `qa_scan` of the public website — don't re-investigate these every session.
metadata:
  type: reference
---

The `mcp__realty-pandit-qa__qa_scan` browser crawl of https://www.realtypandit.in reliably re-reports two
warning classes that are **NOT bugs**. Confirmed 2026-06-04. Don't chase them again.

## 1. "broken-image" on the Homepage (during/just after a deploy)
- Symptom: `broken-image: https://www.realtypandit.in/_next/image?url=…api.realtypandit.in/uploads/properties/…`
- **Cause:** the **Next.js image optimizer** (`/_next/image` proxy) momentarily fails to fetch/optimize the
  source while `realty-website` is **restarting mid-deploy**. The underlying files are fine.
- **How to confirm (not re-fix):** the source serves 200 with a valid content-type
  (`curl -sI 'https://api.realtypandit.in/uploads/properties/<id>/<file>'`), the file exists on disk, and a
  Playwright load of `/` shows **0 broken images** (`img.complete && img.naturalWidth===0` → none).
- **Action:** re-run `qa_scan` a few minutes after the deploy settles; it clears. Only a *persistent*
  broken-image across multiple post-settle scans is real (then it's a genuinely missing/0-byte file).

## 2. "N elements overflow viewport" on the Homepage
- Symptom: `layout: 9 elements overflow viewport` (count varies).
- **Cause:** intentional, `overflow-hidden`-clipped decoration — the `blur-[128px]` background glow orbs
  (`absolute … w-96 h-96 rounded-full`) and the `animate-scroll-x` partner-logo marquee (99acres /
  MagicBricks / Housing.com / Google / RERA chips). Their bounding boxes exceed the viewport by design.
- **How to confirm:** there is **no real horizontal scroll** — `document.documentElement.scrollWidth ==
  clientWidth` (e.g. 390 == 390 at mobile width). qa_scan flags any element whose rect exceeds the viewport,
  even when a parent clips it.
- **Action:** ignore unless `scrollWidth > clientWidth` (a real horizontal scrollbar appears).

Both verified via direct curl/disk checks + Playwright on 2026-06-04 (during the post-taxonomy cleanup).
