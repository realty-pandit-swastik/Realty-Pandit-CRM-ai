---
name: Mobile vs Desktop Component Parity
description: Admin panel has separate mobile components — always check and update both when changing a feature
type: feedback
---

# Always Check for Mobile-Specific Components

When modifying a feature in the admin panel, check if a dedicated mobile component exists before assuming the change is complete.

**Why:** The admin PWA has separate mobile implementations for some views. When the filter sheet was added to `InventoryList.tsx`, the mobile PWA showed the OLD inline filter because it uses `MobileInventoryList.tsx` — a completely separate file that was never updated. This caused a deploy where the feature appeared broken on mobile.

**How to apply:** Before marking any admin panel task done, search for `Mobile*` variants of the component:
```
find agents/frontend/src/components/mobile/ -name "Mobile*.tsx"
```
Currently known mobile-specific components:
- `mobile/MobileInventoryList.tsx` → mirrors `InventoryList.tsx` (inventory list + filter sheet)
- `mobile/MobileInventoryEdit.tsx` → mirrors inventory edit form
- `MobileChatView.tsx` → mirrors `ChatView.tsx`

If the feature you're building touches inventory list, filter bar, or card display — update BOTH files.

## Sibling rule: in-file dual render paths

Some single files contain BOTH a mobile-card render and a desktop-kanban render in the same component, gated by `useIsMobile()` or `viewMode === 'kanban' | 'list'`. Editing one and not the other looks correct in code review but renders inconsistently in the browser.

**Why:** 2026-05-12 — Added "❌ Close as Lost" button to `DealPipeline.tsx`. Patched the mobile card render path (~line 645) and shipped. Playwright showed zero buttons on desktop kanban. Root cause: file has a *second* identical-looking render block at ~line 813 inside the `viewMode === 'kanban'` branch. Both needed the same edit.

**How to apply:** When adding a per-status action button or any conditional UI inside `DealPipeline.tsx`, grep the file for the same `deal.status === 'X'` pattern — if it appears twice, edit both occurrences. Same caution for any large component that has list-view + kanban-view branches in one file.
