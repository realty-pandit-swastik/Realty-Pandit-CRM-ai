# Plan — Deal age on the Deal Pipeline tiles

**Date:** 2026-06-26
**Status:** ✅ DONE 2026-06-26 — deployed (frontend-only; `dealAge`/`renderAgeChip` in `DealPipeline.tsx`, both desktop + mobile headers). `tsc -b` clean; built on server (bundle `index-BGEKfX3P.js`); age chip verified in dist. Users must hard-refresh (PWA) to see it. Backup step hit a transient SSH timeout — change is additive/reversible; revert = reverse the 3 edits.
**Trigger:** Owner wants to see how old each deal is (e.g. "2d", "5d") on the pipeline card.

## Scope
Show the deal's age (time since `transactions.created_at`) on every Deal Pipeline tile. First of three requested tile additions (last-human-action + next-action are separate, see `2026-06-25` investigation notes).

## Data
- `created_at` is already returned per deal by `listDeals()` (`deal_service.ts` uses `include`, so all transaction scalars flow through; the final `.map` spreads `{ ...deal, ai_status }`). **No backend change needed.**

## Change (frontend only — `components/DealPipeline.tsx`)
1. Add a `dealAge(created)` helper → `{ label, color, title }`: `today` / `{n}d`; subtle aging cue — muted `<7d`, amber `7–13d`, red `≥14d`; tooltip shows the exact created date.
2. Add a `renderAgeChip(deal)` render helper → a small `🕐 {label}` chip.
3. Render it in the card header **right-side** group (next to the AI status badge) in **both** render blocks — desktop kanban (~L911) and mobile single-column (~L658) — for mobile parity.

## Verify
- `tsc -b` clean (frontend build is strict).
- Build on server; visual proof (screenshot) of tiles showing the age.

## Out of scope
- Last-human-action + next-action tile lines (separate plan/decision).
