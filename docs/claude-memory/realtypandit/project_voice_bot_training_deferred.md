---
name: project_voice_bot_training_deferred
description: Voice WhatsApp bot (Panditji) further work / "training" is DEFERRED to later per user (2026-06-06) — don't proactively tune it; Option A (bot sends properties to customers) already shipped + live
metadata:
  type: project
---

As of **2026-06-06** the user has parked all further **voice WhatsApp bot (Panditji)** work — tuning, "training", prompt/behaviour improvement — for **later**. Do NOT proactively work on the voice bot until they explicitly revisit it.

**Already shipped (2026-06-05, live & verified in running code):** Option A — Panditji can now send matching properties + a booking flow to *customer* (non-agent) callers. Backend opened the 2 customer-safe tools (`search_and_show_properties`, `send_booking_flow`) via `PUBLIC_TOOLS` in `services/tool_permission.ts` + a path-scoped guest allowance in `routes/internal_tools.ts`; pipecat registers them for customer calls (`CUSTOMER_TOOLS` in `pipeline.py`/`tools.py`); search made taxonomy-aligned (OR-union type filter) + **BHK softened** (keeps BHK-unknown listings, since ~95% lack `specs.bhk`); an engaged caller is captured as contact+deal (fire-and-forget `ensureDealForLead`). 8/8 vitest; deployed via MCP `deploy backend`.

**Open threads parked under "train later" (pick up when the user revisits):**
- **Live E2E confirmation** — user places a real call ("2BHK flat rent Ghaziabad 50k") and confirms cards arrive on WhatsApp. NOT yet done.
- **Audio/WebRTC robustness** — the 2026-06-05 test call had a degraded connection: "data channel not established within 10s", 257× "unexpected media stream error while reading the audio", and tool calls that were interrupted/cancelled. The search fix does NOT address this; it's the most likely next hardening target. See [[feedback_pipecat_vad_guard]].
- **BHK data backfill** — true 2BHK matching needs `specs.bhk` populated (~95% missing); soft filter is only a mitigation. Backlog `docs/backlog/PENDING.md` + [[reference_property_card_share_flow]] + [[reference_inventory_specs_sot]].
- **Pipecat deprecation warnings** cleanup (cosmetic) — backlog PENDING.md.

Deploy/access notes for when work resumes: prod backend runs from `/var/www/realty-pandit/backend/` ([[feedback_prod_backend_paths]]); batch SSH into single connections ([[feedback_hostinger_ssh_rate_block]]).
