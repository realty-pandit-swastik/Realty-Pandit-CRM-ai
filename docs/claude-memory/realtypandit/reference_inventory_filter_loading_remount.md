---
name: reference_inventory_filter_loading_remount
description: Inventory Property Type filter "Commercial/Residential doesn't expand" — a full-page `if (loading) return spinner` was unmounting the filter sheet on every refetch, resetting accordion + drill state
metadata:
  type: reference
---

**2026-06-10 SHIPPED + live-verified.** Clicking **"Commercial ›"/"Residential ›"** in the Inventory **Property Type** filter applied the filter (count → 69) but the section **collapsed** and the drill reset — you could never reach the subcategories.

**Root cause — a remount, not a data/taxonomy bug.** The tree was fine (`/public/taxonomy/tree` → Commercial has 8 nested children). The real cause: [`InventoryList.tsx`](clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/InventoryList.tsx) did `if (loading) return <full-page spinner>`, and `loadInventory` flips `loading=true` on **every filter change**. So each chip click → `setFilterTaxonomy` → fetch → `setLoading(true)` → **InventoryList returns only the spinner → the entire filter sheet unmounts** → fetch done → `setLoading(false)` → **sheet remounts fresh**. On remount every [`FilterSection`](clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/filters/FilterSheetShared.tsx)'s `open` (useState `defaultOpen`) reset to collapsed and [`FilterTaxonomySection`](clients/sunny-sharma/projects/reality-pandit/agents/frontend/src/components/filters/FilterSheetShared.tsx)'s `path`/`leafIds` reset to `[]`. (Same bug = the jarring full-page "Loading inventory…" flash on every filter/search/page.)

**Mobile was already correct** — `MobileInventoryList.tsx` only swaps the *card-list region* for "Loading…", keeping the sheet mounted. Desktop was the outlier.

**Fix 1 (the real one):** added an `initialLoad` flag (set false in `loadInventory`'s `finally`); the full-page spinner now only blocks the **first** load (`if (loading && initialLoad)`). Subsequent refetches keep the whole page + sheet mounted; a small "Updating…" hint shows next to the "Property Inventory (N)" title instead.

**Fix 2 (robustness):** `FilterTaxonomySection` now **self-heals** — a guarded `useEffect` rebuilds `path`/`leafIds` from `value.nodeIds` (via a module-level `findChain` tree walk) when it mounts with an applied selection but empty local drill (e.g. close→reopen the sheet). Guard = only run when local `path`/`leafIds` are empty, so it never fights an in-progress user drill.

**Verified live (Playwright, super_boss):** Commercial → section stays open + 8 subcategories (Refine row); Commercial→Office drilled to leaf types (15 results); close+reopen → drill reconstructed (Commercial+Office active, 2 Refine levels); Clear All → roots + count back to 407; **0 console errors**. Frontend-only (2 files), bundle `index-BxJR6ce_.js`, stamp `v20260610e-inventory-filter-drill`.

**Lesson (reusable): never gate a whole page on `if (loading) return <spinner>` when that page hosts a stateful panel (filter sheet, accordion, multi-step form) that refetches on interaction — the early return unmounts the panel and silently resets its `useState`. Gate the spinner on first-load only and keep the panel mounted (mirror `MobileInventoryList`).**

Related: the taxonomy filter wiring is [[reference_taxonomy_filters]]; the PWA SW cache-bust step is [[feedback_pwa_sw_update_ux]].
