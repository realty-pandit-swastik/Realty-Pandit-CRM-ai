# Design — Inventory Taxonomy Phase 1d v2 (Website + WhatsApp)

> Brainstorming output, approved 2026-05-24. Extends the new `taxonomy` + `schema_fields` workflow steps (shipped for admin in 1d) to the **public website chat** and **WhatsApp**. Builds on 1a/1b/1c/1d. No code yet — this is the spec.

## Context / why
The inventory-upload flow is a single server-driven workflow engine (`workflow_engine.ts` + `workflow_definition.ts`) shared by every surface, but each surface RENDERS the steps differently and reports a `_source`. Phase 1d added two steps — `taxonomy` (cascading tree picker → `taxonomy_node_id`) and `schema_fields` (per-type dynamic attributes → `schema_values`) — gated to `_source==='admin'`, so today only the admin modal uses the new canonical taxonomy. WhatsApp + website still capture the legacy `main_category`/`flat_property_type_id`/`configuration_id`. Goal of v2: every new listing from every surface ends with a populated `taxonomy_node_id`, so Phases 2–5 (search/matching/sharing/AI) can move onto the tree.

## Investigation findings (the capture flows, as they exist today)
Three distinct entry points, all sharing `workflow_engine.ts`:

| Surface | Path | `_source` | Renderer | Identity capture |
|---|---|---|---|---|
| Admin "+ Add Property" | `/api/workflow/*` (`routes/workflow.ts`) | `admin` | `frontend/.../InventoryModal.tsx` (form) — ✅ 1d | Contact-lookup modal → phone+name pre-resolved |
| Public website `/post-property` | **`/api/chat/*`** (`routes/chat_workflow.ts` → `chat_workflow_adapter.ts`) | `web` (default at `chat_workflow.ts:83`) | **`website/.../chat-workflow/ChatWorkflow.tsx`** — conversational chat **widgets** | `uploader_block` widget asks name+phone in-chat |
| WhatsApp | `whatsapp_workflow_adapter.ts` → `conversational_workflow_core.ts` | `whatsapp` | text / interactive buttons (≤3) / lists (≤10 rows) | **sender phone auto-captured; name auto-resolved from agent→Contact DB; `uploader_name` step skipped** (`whatsapp_workflow_adapter.ts:255-273`) |
| Voice (`voice.ts`) | — | — | — | Not an inventory-onboarding surface |

Facts that shaped the design:
- The website is a **chat**, not a dropdown form. It already embeds rich widgets keyed by `input_type` (`ChatLocationPicker`, `MultiSelectGrid`, `InlineContactForm`) and forwards engine step `metadata` into the message (currently only `address_config`, `chat_workflow_adapter.ts:622`). Unknown `input_type` → `renderInlineWidget` returns `null` (no widget).
- WhatsApp's unknown `input_type` falls back to a **plain text prompt** (`whatsapp_workflow_adapter.ts:514-518`) — so the tree/schema steps must stay OFF WhatsApp.
- Both conversational surfaces inject `_source` into `answers` at session start (`conversational_workflow_core.ts:158`), so `show_when`/`skip_when` `_source` rules already work for `web`.
- WhatsApp inventory commits to `status='pending_approval'` (`workflow_engine.ts:872`); a coordinator approves before it goes live.
- Website's `useWorkflow.ts` / `StepRenderer.tsx` / `app/agent/inventory/page.tsx` are **not used by any current page** (the agent form posts directly to `/agent/inventory`, bypassing the engine) — dead code for our purposes; do NOT touch.

## Decisions (Puneet, 2026-05-24)
1. **Hybrid rollout.** Website = full picker + schema (in-chat). WhatsApp = silent auto-tag, no UX change. Voice = out of scope.
2. **Website renders the tree as an in-chat cascading dropdown widget** (mirrors the admin picker, reuses the chat's existing widget pattern), not sequential quick-reply rounds.
3. **Identity flows are untouched** on every surface — v2 changes only the property-type band of the workflow.

## Architecture — one engine, per-surface rendering of the same steps
Workflow order is unchanged; only the **property-type band** resolves differently by `_source`:

```
identity → contact → intent → [PROPERTY TYPE BAND] → address → keyholder → pricing → area → construction → media → confirm
```

| `_source` | Property-type band |
|---|---|
| `admin` (✅ 1d) | `taxonomy` → `schema_fields` |
| `web` (v2) | `taxonomy` → `schema_fields` (rendered as chat widgets) |
| `whatsapp` (unchanged) | legacy `main_category` → `flat_property_type_id` → `configuration_id` |

Gating after v2:
- `taxonomy` + `schema_fields`: `show_when` `{ field:'_source', operator:'in', value:['admin','web'] }`
- `main_category` / `flat_property_type_id` / `configuration_id`: add `{ field:'_source', operator:'in', value:['admin','web'] }` to `skip_when`

(The 1d definition used `operator:'equals', value:'admin'`; v2 switches those to `operator:'in', value:['admin','web']`.)

## The four engine-level changes
1. **Definition gating** (`workflow_definition.ts`): swap the `_source` rules on the five steps as above. WhatsApp + voice keep the legacy band.
2. **`commit()` auto-tag fallback** (`workflow_engine.ts`): after the existing taxonomy block, add — when `taxonomy_node_id` is absent but `flat_property_type_id` is present, reverse-lookup `prisma.taxonomyNode.findFirst({ where: { legacy_flat_property_type_id: <id> } })`; if found, set `taxonomy_node_id` and `needs_taxonomy_review = true`. Universal safety net; fires for WhatsApp and any legacy commit. (Web/admin set the node directly, so this no-ops for them.)
3. **Chat adapter metadata** (`chat_workflow_adapter.ts`): forward `metadata.schema_fields` into the chat message (mirror the `address_config` line ~622); add `taxonomy` + `schema_fields` to the widget-only set so the free-text input bar is suppressed for those steps.
4. **Answer parsing** (`conversational_workflow_core.ts` / chat adapter): store the picker answer as `answers.taxonomy_node_id` (plain string) and the schema answer as `answers.schema_values` (JSON string → object), parsed the same way `address_block` JSON is handled, so `commit()` reads them identically to the admin path.

## Website chat — new widgets
In `website/.../chat-workflow/ChatWorkflow.tsx` `renderInlineWidget`, add two cases:
- **`ChatTaxonomyPicker`** (`input_type==='taxonomy'`): cascading Category → Sub → [Group] → Type dropdowns; fetches the tree via a new `getTaxonomyTree()` helper in `website/src/lib/api.ts` (calls public `GET /public/taxonomy/tree`); on leaf selection submits the node id via `chat.sendQuickReply(nodeId)`.
- **`ChatSchemaFields`** (`input_type==='schema_fields'`): renders `msg.metadata.schema_fields` as inputs (select when options present, number/text otherwise); all fields skippable unless `required`; submits `chat.sendQuickReply(JSON.stringify(values))`.
- Add both to `isWidgetOnlyStep()` so the text bar hides.
Mirror the existing admin `TaxonomyPicker`/`SchemaFields` component logic; the tree shape is `{ id, name, node_kind, children[] }` and leaf TYPE nodes have empty `children`.

## What gets written at commit (identical end-state across surfaces)
Every listing — admin, web, WhatsApp — ends with a valid `taxonomy_node_id` PLUS legacy `category`/`sub_category_id`/`type_id`/`flat_property_type_id` derived from the node's `legacy_*` (the byte-identical 1d commit path: inject `legacy_flat_property_type_id` → existing classification machinery). So search/matching/sharing (still legacy until P2–P5) keep working, and the taxonomy column is populated everywhere.
- admin/web: `taxonomy_node_id` from the picker; `needs_taxonomy_review=false` unless the node lacks a legacy map.
- whatsapp: `taxonomy_node_id` from auto-tag reverse-lookup; `needs_taxonomy_review=true`; `status='pending_approval'` (coordinator confirms/corrects type before live).

## Identity protection (explicit guarantee)
The new steps live only in the property-type band (between `intent` and `address`). The identity/contact groups — WhatsApp sender-phone + DB name-match (skips `uploader_name`), website `uploader_block`, admin contact lookup — come earlier and are NOT modified. v2 cannot change who the uploader is or how their name resolves.

## Risk & verification
- **Build safety (post-outage rule):** the website is a separate Next.js app (`agents/website`, pm2 `realty-website`, build `npm run build`). Verify its build emits, and verify the admin (`realty-admin`) is untouched. Per `feedback_frontend_build_verify`, never trust the deploy "SUCCESS"; curl the live site post-deploy.
- **HARD regression gate (engine-level):** a `source:'whatsapp'` run must STILL get the legacy band (`main_category`→`flat_property_type_id`), and `source:'web'` must now get `taxonomy`→`schema_fields`; `source:'admin'` unchanged. Prove via the same `getNextStep` script used in 1d.
- **Website E2E:** public `/post-property` chat → reach the taxonomy widget → pick Residential type → BHK schema renders; pick Hotel → Rooms; commit → assert `taxonomy_node_id` set + legacy classification populated + `status='active'`.
- **WhatsApp E2E (or simulated):** run a WhatsApp upload through to commit on a flat type → assert `taxonomy_node_id` auto-derived + `needs_taxonomy_review=true` + `status='pending_approval'`, and that the conversational steps were the OLD ones (no taxonomy/schema prompt leaked into chat).
- **Identity regression:** confirm WhatsApp still auto-resolves uploader name from DB (skips the name step) and the website `uploader_block` still captures name+phone — both unchanged.
- GlitchTip clean on `/api/chat/*` and commit.

## Files (anticipated)
- `backend/src/workflows/workflow_definition.ts` — `_source` gating swap (5 steps).
- `backend/src/workflows/workflow_engine.ts` — `commit()` auto-tag fallback block.
- `backend/src/workflows/chat_workflow_adapter.ts` — forward `schema_fields` metadata + widget-only flags.
- `backend/src/workflows/conversational_workflow_core.ts` — parse `taxonomy_node_id` / `schema_values` answers (if address_block-style parsing isn't already generic).
- `website/src/components/chat-workflow/ChatWorkflow.tsx` — `ChatTaxonomyPicker` + `ChatSchemaFields` widgets + `isWidgetOnlyStep`.
- `website/src/lib/api.ts` — `getTaxonomyTree()` helper.
- Deploy: backend + website (`realty-website`); admin frontend NOT redeployed (no change). Public `/public/taxonomy/tree` already live (1a).

## Out of scope (v2)
- Voice (not an inventory surface).
- Website dead code (`useWorkflow.ts`, `StepRenderer.tsx`, `app/agent/inventory` form).
- WhatsApp conversational tree picker / WhatsApp schema collection (auto-tag covers the goal without lead-drop risk).
- Phases 2–5 (consumers reading the tree).

## Sequencing note
Lower blast radius than 1d (no schema migration; the engine commit path is additive and no-ops for admin/web). The top risk is the shared chat adapter (`/api/chat/*` also serves other conversational flows) and the website build. Regression gate on WhatsApp + a website build/curl check are the hard gates.
