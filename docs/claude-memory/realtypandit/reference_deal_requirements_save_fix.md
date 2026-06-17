---
name: reference_deal_requirements_save_fix
description: Deal Detail "Edit Requirements" — the old "Done" button never saved; now Save & Close drives the form submit + onRefresh
metadata:
  type: reference
---

**2026-06-09 SHIPPED + DB-verified.** Bug: editing a deal's requirements (Deal Pipeline → open deal → Detail → **Edit**), changing e.g. the location, then clicking the prominent top-right **"Done"** button did NOT persist — "Done" only called `setIsEditing(false)`. The actual save was the **"Save Requirements"** button *inside* `<DemandRequirementsForm>`, which sits **below the fold**. Users clicked "Done", lost the edit. DB-confirmed on deal `08766be0` (Varchasv Bhardwaj): no requirements log row, `updated_at` stale → no save reached the backend. The backend `PATCH /api/deals/:id/requirements` was always correct (`demand_location` in `allowedColumns`, written to deal + mirrored to contact `preferred_location`).

**Fix (frontend only, no backend/DB change):**
- `components/leads/DemandRequirementsForm.tsx`: now a `forwardRef` exposing `useImperativeHandle(ref,()=>({submit:handleSubmit}))` + optional `hideSubmitButton` prop. **Backward-compatible** — the 3 other callers (LogCallOverlay, ExternalLeads ×2) pass neither → their internal "Save Requirements" footer renders unchanged.
- `components/deal/RequirementsTab.tsx`: top-bar "Done" replaced with **Cancel** (discard) + **Save & Close** (primary, calls `formRef.current?.submit()`); embedded form gets `ref` + `hideSubmitButton` so there's ONE save button at the top. `handleSaveDemandCanonical` now, on success, also calls **`onRefresh()` + `setIsEditing(false)`** (the prior version never refreshed → list kept the stale deal object on close+reopen). Location can now be cleared: send `demand_location: payload.preferred_location` (dropped the `|| undefined` that skipped an emptied field; backend maps `'' → null`).

**Verified live (Playwright + DB, super_boss):** Edit → change location → Save & Close → editor closes, green toast, DB `demand_location` + contact `preferred_location` updated, `requirements` log row written, `updated_at`=now; pipeline list row reflects the new value immediately (onRefresh); reopen shows it (no stale). Restored the test deal back to its original "Noida". Bundle `index-CPKWx49y.js`, stamp `v20260609b`. Reconfirmed [[feedback_pwa_sw_update_ux]] (must unregister SW + reload to see the new bundle). Related: the shared form is the same one in [[reference_demand_canonical_sot]].
