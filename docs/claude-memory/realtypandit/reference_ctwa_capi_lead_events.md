---
name: reference-ctwa-capi-lead-events
description: How CTWA WhatsApp ad leads are sent to Meta Conversions API for lead-optimization (dataset, flow, the owner dependency)
metadata:
  type: reference
---

Click-to-WhatsApp (CTWA) ads can only optimize for "conversations started" (a vanity count) on this account UNLESS real **Lead** events are fed back via the Conversions API. The lead-event pipeline was built 2026-05-18 (code-only, no schema migration).

**Key facts (durable):**
- WhatsApp messaging dataset = **`760915983366996`** ("WhatsApp Marketing Message Event Sharing", owned by business `782804307620931`). CTWA conversion events go HERE, with `action_source: 'business_messaging'`, `messaging_channel: 'whatsapp'`, and the `ctwa_clid` in `user_data` — NOT the website pixel.
- `FB_PIXEL_ID` in `.env.production` is **empty** → the pre-existing `sendConversionEvent`/`trackLeadQualified` (website `action_source`) has always early-returned and **never sent anything**. The leadgen `trackLeadQualified` call in `integrations/facebook.ts` is therefore a silent no-op until a pixel id is set. Override messaging dataset via `FB_MESSAGING_DATASET_ID` env (defaults to the id above in code).

**Flow (deployed):**
1. `routes/webhooks.ts` — on inbound WA message, if `msg.referral.ctwa_clid` present → `cacheSet('ctwa:'+phone, clid, 7d)` (Redis; 7d = Meta CTWA attribution window). Additive, non-blocking.
2. `services/webhook_processor.ts` — when a NEW contact is created from WhatsApp inbound, `cacheGet('ctwa:'+phone)`; if present → `trackWhatsAppLead({ctwaClid, phone, eventName:'Lead'})`. Best-effort, never blocks inbound.
3. `services/meta_conversions.ts` — `trackWhatsAppLead()` posts the Lead event to dataset `760915983366996`. (Existing `sendConversionEvent` left untouched — do NOT mutate it; it's the website path.)

Design chose **Redis (no Prisma migration)** deliberately: prod DB is `localhost`-only (unreachable from dev), and a migration mismatch would break the bot's contact writes. Don't "improve" this into a schema column without prod DB access + backup.

**HARD owner dependency (Phase 5, not automatable):** in Meta **Events Manager → dataset 760915983366996 → Custom Conversions → Create** on the `Lead` event. Until that custom conversion exists, Lead events flow (good for tracking/attribution) but the ad set still **cannot be optimized** toward them — the optimization goal stays gated to `CONVERSATIONS`. After it exists, re-probe ad-set `optimization_goal` (QUALITY_LEAD / custom conversion) — it should become available; then build the lead-optimized vs conversations A/B.

Related: [[feedback_meta_ctw_ads]], [[feedback_webhook_lead_visibility]], [[feedback_glitchtip_instrumentation]]. Full procedure: `docs/runbooks/meta-ctw-ads.md`.
