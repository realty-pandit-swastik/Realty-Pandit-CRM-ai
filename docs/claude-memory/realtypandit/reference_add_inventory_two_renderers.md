---
name: Add-inventory has TWO frontend renderers — admin uses InventoryModal.tsx, NOT AddInventory.tsx
description: The shared workflow-engine wizard is rendered by two separate React components; editing only one silently breaks the other surface.
metadata:
  type: reference
---

The server-driven inventory workflow (workflow_definition.ts + workflow_engine.ts) is rendered by **two different frontend components**, each with its OWN `StepPanel` + `input_type` switch (duplicated code, not shared):

- **`agents/frontend/src/components/InventoryModal.tsx`** — the **ADMIN** add-inventory modal (the "+ Add Property" button on the Inventory page). Starts with a Contact Lookup phase ("Who is this inventory from?" / "Use This Contact"). Its StepPanel input container uses `minHeight: '60px'` and a local `styles` object (`styles.input`, `styles.primaryBtn`).
- **`agents/frontend/src/components/AddInventory.tsx`** — the standalone/website-style flow. Its StepPanel uses `minHeight: '80px'` and a shared `s` style object.
- (`components/ChatWorkflow/ChatWorkflow.tsx` is a third, WhatsApp/chat renderer.)

**Trap (hit 2026-05-24, Phase 1d):** I added the new `taxonomy` + `schema_fields` `input_type` render cases to AddInventory.tsx only. The backend served the new steps correctly, but the ADMIN modal rendered a blank input area (no case matched) — because admin uses InventoryModal.tsx. Playwright caught it: the empty container's `min-height:60px` (vs AddInventory's 80px) was the tell. Fix = add the same render cases + components to InventoryModal.tsx.

**Rule:** any new `WorkflowStep.input_type` must get a render case in BOTH InventoryModal.tsx AND AddInventory.tsx (and the website chat — see below — if the step targets web/whatsapp). Verify the ADMIN surface specifically via Playwright, since that's where "+ Add Property" lives. Relates to [[feedback_frontend_build_verify]] and [[feedback_playwright_mcp_blocked]].

**FOURTH renderer (Phase 1d v2, 2026-05-24):** the PUBLIC website `/post-property` is a CONVERSATIONAL CHAT, not a form — `agents/website/src/components/chat-workflow/ChatWorkflow.tsx` (`renderInlineWidget` switch + `isWidgetOnlyStep`), backed by `backend/src/workflows/chat_workflow_adapter.ts` (source='web'). Widgets get data from `msg.metadata` (the adapter `makeStepMessage` must forward each metadata key — e.g. it forwards `address_config`, and v2 added `schema_fields`). Block-type answers (address_block/owner_block/uploader_block/schema_fields) are JSON-parsed in `chat_workflow_adapter.ts` (~line 234 list); plain-string answers (taxonomy_node_id) need no parse. WhatsApp (`whatsapp_workflow_adapter.ts`) is a 5th rendering but v2 keeps it on the LEGACY band + auto-tags the node at commit from `flat_property_type_id`. So a new input_type may need cases in up to FOUR places: InventoryModal, AddInventory, website ChatWorkflow, and (if conversational) the WhatsApp adapter.
