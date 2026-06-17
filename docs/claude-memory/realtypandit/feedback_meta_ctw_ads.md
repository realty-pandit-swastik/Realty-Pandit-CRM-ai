---
name: feedback-meta-ctw-ads
description: Correct Graph API recipe for Realty Pandit Click-to-WhatsApp ads, and the MESSAGE_PAGE trap that burned money
metadata:
  type: feedback
---

Realty Pandit WhatsApp/Status ads MUST be built as **native Click-to-WhatsApp via Graph API**. A `MESSAGE_PAGE` CTA or a `wa.me` link in the creative routes clicks to **Facebook Messenger, not WhatsApp** — it silently wastes spend and captures **zero** WhatsApp leads. On 2026-05-17 this mistake burned ~₹694 across ~12,300 impressions / 98 clicks with 1 stray Messenger chat and 0 CRM leads.

**Why:** Meta ignores the `wa.me` link on `MESSAGE_PAGE`/non-WhatsApp CTAs and sends users to the Page's Messenger. Clicks still bill. Leads never reach the Cloud-API webhook, so `webhook_processor` never creates the Contact/Deal.

**How to apply — correct native CTW recipe (token = `FB_ACCESS_TOKEN`, acct `act_850915011262416`):**
- Campaign: `objective=OUTCOME_ENGAGEMENT`, `is_adset_budget_sharing_enabled=false`
- Ad set: `destination_type=WHATSAPP`, `optimization_goal=CONVERSATIONS`, `billing_event=IMPRESSIONS`, `bid_strategy=LOWEST_COST_WITHOUT_CAP`, `promoted_object={"page_id":"905415725999343"}`; WhatsApp Status placement = `publisher_platforms` incl `whatsapp` + `whatsapp_positions:["status"]`
- Creative: `object_story_spec.video_data.call_to_action = {"type":"WHATSAPP_MESSAGE","value":{}}` — **no `link` key** (Meta rejects link on WHATSAPP_MESSAGE)
- Reel → upload via `/advideos?file_url=<IG media_url>` to get a `video_id`; thumbnail via IG media `thumbnail_url`

**Non-obvious gotchas:**
- The Page `905415725999343` **is** linked to the bot's Cloud-API number **+91 81784 91914** (WABA `2124684824933246`). The repeated `(#2446886)` "Page not linked to WhatsApp account" was a **false trail** — it appears when other params (e.g. missing `bid_strategy`) fail first OR transiently; it does NOT mean a real link is missing. **No number migration is ever needed; never click "Install / your number will move" (`#2923012`) — that would break the production Cloud-API bot.**
- Validation order: Meta checks bid strategy BEFORE the page-WhatsApp link, so a probe without `bid_strategy` gives a misleading error. Always probe with full valid params.
- New ads sit `IN_PROCESS` / `PENDING_REVIEW` then auto-deliver in a few hours — not an error.
- Page→WhatsApp connection UI lives at the **Page's** Linked Accounts (same Business Manager `782804307620931` ⇒ no code, no migration); `facebook.com/settings` is the *personal* profile and will reject it.

Working native CTW campaign shipped: `120248711917330547`. Lead-Form ad (`120248692747290547`, form `2516636758794105`) is the other correctly-wired path → both deliver into CRM/admin via existing webhooks. See [[project_whatsapp_meta_status]], [[reference_meta_webhooks_live]], [[leads_system]].
