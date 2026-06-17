---
name: MagicBricks Integration (pointer)
description: Pointer to docs/architecture/integrations.md
type: reference
---

See `clients/sunny-sharma/projects/reality-pandit/docs/architecture/integrations.md`. Covers MagicBricks push + 99acres pull.

**Why:** Project knowledge lives in /docs/. Memory only points.
**How to apply:** When debugging MagicBricks lead webhook, read the /docs/ file.

**Contact + known data gaps (2026-06-11, evidence-based — pulled 400 live leads):** MagicBricks rep = **Vishal Kumar — vishal.kumar1@magicbricks.com** (we email from `info@realtypandit.in`, Sunny Sharma; cc realtypandit99@gmail.com + bzonkcrazy@gmail.com; original thread "MagicBricks Lead Push Integration — Realty Pandit"). Integration = **push webhook** `/external/magicbricks/push` (api_key query auth) across **24 sub-user accounts**. The push payload **only ever** has these 12 fields: `dt, bhk, msg, City, name(buyer), email, budget, mobile, api_key, project, looking_for, property_type`. It does **NOT** send any agent/advertiser name or any property link/listing-ID (so we can't auto-route to the listing's agent, nor show which listing generated the lead). Two more data issues: `project` (society) is **blank in 54%** of leads; `looking_for` is **always "Buy"** (100%) even though the `msg` says "for Rent" in **61%** → rent leads mis-classified as buy ([magicbricks.ts](clients/sunny-sharma/projects/reality-pandit/agents/backend/src/integrations/magicbricks.ts) reads `looking_for` for intent; the reliable intent is in `msg`). **On 2026-06-11 we emailed Vishal requesting agent_name + property_url/listing_id + correct intent** (sent via server Postfix `localhost:25` as info@realtypandit.in; delivered to MB's Google Workspace MX). Our code already stores the full raw payload in `interaction.metadata.original_data` — nothing more to parse; the missing fields aren't in their API. Related: [[reference_portal_lead_location]].
