# Runbook — Meta Click-to-WhatsApp (CTW) ads via Graph API

**Goal:** run WhatsApp / WhatsApp-Status ads that send the viewer **directly into the WhatsApp AI bot** so the inbound lands in CRM/admin via the existing Cloud-API webhook.

## ⚠️ The trap that burns money (do not repeat)

A `MESSAGE_PAGE` CTA, or a `wa.me`/`api.whatsapp.com` link inside the creative, **routes clicks to Facebook Messenger, not WhatsApp**. Meta still bills the clicks; leads never reach the Cloud-API webhook → **0 CRM leads**. This cost **~₹694 / 0 leads** on 2026-05-17 before diagnosis. Symptom: ad shows `link_click` / `messaging_conversation_started` but nothing in WhatsApp/CRM; the 1 "conversation" sits in Page Messenger inbox.

**Only native CTW (`destination_type=WHATSAPP` + `WHATSAPP_MESSAGE` CTA with NO link) reaches WhatsApp.**

## Fixed identifiers

| Thing | Value |
|---|---|
| Ad account | `act_850915011262416` (INR, Asia/Kolkata) |
| Page | `905415725999343` (Realty Pandit) |
| WABA (bot, Cloud API) | `2124684824933246` — number **+91 81784 91914** (`8178491914`) |
| IG business acct | `17841447875862678` (airealtypandit) |
| Business Manager | `782804307620931` |
| Token | `FB_ACCESS_TOKEN` in `agents/backend/.env.production`; Graph `v25.0` |

The Page **is** linked to the bot WABA (Page → Settings → Linked Accounts → WhatsApp shows +91 81784 91914 as Primary; same Business Manager ⇒ no code, no migration). **Never click "Install / your number will move" (`#2923012`)** — that migrates the Cloud-API number off the API and **kills the production bot**.

## Recipe (all Graph API — no browser, no UI)

1. **Campaign:** `objective=OUTCOME_ENGAGEMENT`, `status=PAUSED`, `special_ad_categories=[]`, `is_adset_budget_sharing_enabled=false`.
2. **Ad set:** `campaign_id=<above>`, `daily_budget=<paise; ₹300=30000>`, `billing_event=IMPRESSIONS`, `optimization_goal=CONVERSATIONS`, `destination_type=WHATSAPP`, `bid_strategy=LOWEST_COST_WITHOUT_CAP`, `promoted_object={"page_id":"905415725999343"}`, `status=PAUSED`, `targeting` = geo + `age_min` + `user_os` + `publisher_platforms` incl `whatsapp` + `whatsapp_positions:["status"]` (+ `instagram_positions:["story"]`, `facebook_positions:["story"]`).
3. **Video:** upload the reel to the ad account → `POST /act_.../advideos` with `file_url=<IG media `media_url`>` → returns `video_id`. Thumbnail = IG media `thumbnail_url`.
4. **Creative:** `POST /act_.../adcreatives` with
   `object_story_spec = {"page_id":"905415725999343","instagram_user_id":"17841447875862678","video_data":{"video_id":<id>,"title":...,"message":...,"image_url":<thumb>,"call_to_action":{"type":"WHATSAPP_MESSAGE","value":{}}}}`
   — **no `link` key** (Meta rejects link on `WHATSAPP_MESSAGE`).
5. **Ad:** `POST /act_.../ads` with `adset_id`, `creative={"creative_id":<id>}`, `status=PAUSED`.
6. **Activate:** `POST` `status=ACTIVE` on campaign, ad set, ad. New ad sits `IN_PROCESS`/`PENDING_REVIEW` → auto-delivers in a few hours (normal, not an error).

Geo keys (India): Delhi `1023040`, Ghaziabad city `1025436`, Noida `2678292`, Vasundhara `2802866`, Indirapuram `2802893`. City radius targeting: `cities:[{key,radius,distance_unit:"kilometer"}]`.

## Gotchas

- **Validation order:** Meta checks `bid_strategy` *before* the page-WhatsApp link. A probe missing `bid_strategy` fails with a misleading `(#2446886) Page not linked to WhatsApp account` even though the link is fine. Always probe with full valid params.
- `(#2446886)` / `(#2923012)` are **false trails** here — the Page IS linked. Do not "fix" by migrating the number.
- Account had a **failed-card-charge restriction** (not an unpaid balance). Resolved via billing fix; if it recurs, see Account Quality → it needs payment-method update, not an appeal.
- Lead-Form ads need the Page to have accepted **Lead Generation ToS** once (done). Form `2516636758794105`; leadgen webhook → `integrations/facebook.ts handleLeadgenEvent` → Contact+Deal w/ attribution.

## Verify it works

- Ad set: `GET /<adset>?fields=destination_type,optimization_goal,promoted_object,targeting` → `destination_type:WHATSAPP`, `whatsapp_positions:["status"]`.
- Ad: `GET /<ad>?fields=creative{call_to_action_type}` → must be `WHATSAPP_MESSAGE` (never `MESSAGE_PAGE`).
- Live leads: inbound WhatsApp → `webhook_processor.ts` creates Contact (`source` whatsapp) + Deal; visible in admin lead section.

## Conversions API lead events (lead-optimization unlock) — built 2026-05-18

Plain CTWA can only optimize for "conversations started" (vanity count) on this account. Real **Lead** events fed via the Conversions API are required to optimize for actual leads (~24% lower cost/real-lead per Meta).

- **Messaging dataset:** `760915983366996` ("WhatsApp Marketing Message Event Sharing", business `782804307620931`). Events use `action_source:'business_messaging'`, `messaging_channel:'whatsapp'`, `ctwa_clid` in `user_data`. NOT the website pixel. (`FB_PIXEL_ID` is empty → the old website `trackLeadQualified` was always a silent no-op.)
- **Deployed flow (code-only, no migration — Redis by design):**
  1. `routes/webhooks.ts`: inbound `msg.referral.ctwa_clid` → `cacheSet('ctwa:'+phone, clid, 7d)`.
  2. `webhook_processor.ts`: new WA contact → `cacheGet` → `trackWhatsAppLead()` (best-effort).
  3. `meta_conversions.ts`: `trackWhatsAppLead()` → POST dataset `760915983366996`. (Existing `sendConversionEvent` untouched.)
- **HARD owner step (not automatable):** Events Manager → dataset `760915983366996` → **Custom Conversions → Create on `Lead`**. Until done, events flow (tracking only) but ad-set optimization stays gated to `CONVERSATIONS`. After: re-probe `optimization_goal` (QUALITY_LEAD/custom conv) → build lead-optimized vs conversations A/B.
- Memory: [[reference_ctwa_capi_lead_events]].

## Current live state (2026-05-18)

- Native CTW: campaign `120248711917330547` (₹500/day, 5-city, 31+, Android+iOS, WA-Status+Stories) — ACTIVE.
- Lead-Form: campaign `120248692747290547` — PAUSED (intact, switch on anytime).
- CAPI lead-event pipeline deployed (above); pending owner Events-Manager custom conversion.
- All broken `MESSAGE_PAGE` + redundant test campaigns deleted. Account `account_status:1`.
