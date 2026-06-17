---
name: reference-meta-ad-performance-log
description: Running ledger of every Realty Pandit Meta ad — strategy adopted, purpose, and measured performance — to learn what works over time
metadata:
  type: reference
---

Living ledger of Realty Pandit Meta ads (account `act_850915011262416`). **Append a new row each time we launch or kill an ad, and update the performance column when we read insights.** Goal: build a fact base of what actually drives CRM leads vs. what burns money. Pair with the recipe runbook `docs/runbooks/meta-ctw-ads.md` and [[reference_ctwa_capi_lead_events]].

## How to read "result" (what a lead actually is)
- **Reach/Awareness** ads NEVER produce leads by design — they buy eyeballs only.
- **CTW (Click-to-WhatsApp)** "conversations started" = chat windows opened. A real CRM lead only exists if the person actually SENDS a message and the bot replies (then webhook → Contact + Deal).
- **Lead Form** ads = the lead is captured in the on-ad form → leadgen webhook → CRM (auto-assigned to Sunny since the 2026-05-18 fix).
- The CTWA→CAPI `Lead` pipeline is deployed but optimization stays gated to CONVERSATIONS until the owner creates the Events-Manager custom conversion.

## Performance ledger (lifetime, as of 2026-05-24)

| # | Campaign / id | Strategy & purpose | Spend | Reach | CPM | Result | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | RP — Vaishali Sec-5 3BHK — CTW (API) *(deleted)* | First CTW attempt, but used **MESSAGE_PAGE / wa.me CTA** — the trap | ₹696 | 11,465 | ₹56 | 89 link-clicks, **1** msg conversation, **0 CRM leads** | ❌ **Money-burner.** Clicks routed to Messenger, not WhatsApp. Never use MESSAGE_PAGE. |
| 2 | RP — Lead Form — Vaishali 3BHK · `120248692747290547` (PAUSED) | On-ad Lead Form, captures name/phone directly | ₹209 | 1,586 | ₹119 | **1 lead** + 1 msg conv | ⚠️ Works (1 real lead) but tiny reach, pricey CPM. Form lowers intent friction. |
| 3 | RP — Native CTW — Vaishali 3BHK (WhatsApp) · `120248711917330547` (PAUSED) | **Correct** native CTW (WHATSAPP_MESSAGE CTA), WA-Status+Stories | ₹473 | 1,362 | **₹311** | 2 conversations started | ⚠️ Mechanically correct (reaches WhatsApp) but CPM very high & low volume. CONVERSATIONS optimization is expensive on this account. |
| 4 | RP — Reach — New Reel (4-city) · `120249325961810547` (ACTIVE) | Pure awareness, 716px reel, 4-city 30+ | ₹79 | **26,650** | **₹2.89** | 0 leads (by design) | ✅ **Best CPM by far** for raw reach. Great for brand/top-of-funnel, NOT for leads. |

## Currently ACTIVE (launched 2026-05-24, performance pending)

| Campaign / id | Objective | Strategy & purpose | Budget |
|---|---|---|---|
| **WA-Status CTW (status-only)** · `120249378040430547` | OUTCOME_ENGAGEMENT | Native CTW, button → bot +91 81784 91914 → CRM. WhatsApp **Status** placement (+IG Stories companion, Meta-forced). Reel DYlz-HFuGL2, 4-city, 31+, Android+iOS. | ₹300/day |
| **RP — Lead Form v2 — 4-city** · `120249377681810547` | OUTCOME_LEADS | On-ad lead form, 4-city Delhi/FBD/Noida/GZB | ₹300/day |
| **Post boost — "Dream Home Noida Sector 1"** · `120249363824950547` | OUTCOME_ENGAGEMENT | Boosted post engagement | ₹300/day |
| **IG post boost — "Dream Home Alert Vaishali"** · `120249381531810547` *(owner-made in UI)* | OUTCOME_ENGAGEMENT | Click-to-message video, CTA `WHATSAPP_MESSAGE` ✅. **destination_type=`MESSAGING_INSTAGRAM_DIRECT_WHATSAPP`** ⚠️ — some clicks route to IG Direct (NOT in CRM), only WA-routed ones hit the bot/webhook. Delhi/GZB/Noida (no FBD), 30–65, all genders, FB+IG feeds. | ₹97/day |

> ⚠️ **5 ads now run simultaneously with overlapping geo/audience** (Delhi/NCR, 30+). Audience overlap = self-competition in the auction → higher costs. Consolidate once we see which converts.
>
> **UPDATE 2026-05-25 — CONFIRMED + acted:** overlap starved the harder-goal ads. Over 24h: Lead Form v2 = 1 lead/₹38 ✅; Reach = ₹2.89 CPM, 0 leads (by design); **WA-Status spent only ₹4 / 0 clicks; both post boosts spent ₹0 / 0 delivery** despite ACTIVE+approved — Meta favored the easy cheap-Reach goal. **Owner said "stop them" → PAUSED: WA-Status (`120249378040430547`), IG-Vaishali boost (`120249381531810547`), Noida-Sec-1 boost (`120249363824950547`).** Left ACTIVE: Lead Form v2 + Reach. Lesson #6 below.

## Lessons learned so far (the pattern)
1. **MESSAGE_PAGE/wa.me = 0 leads, guaranteed waste.** Only native `destination_type=WHATSAPP` + `WHATSAPP_MESSAGE` CTA reaches WhatsApp. (Cost ₹696 to learn — row 1.)
2. **Reach is cheap (₹2.89 CPM), conversations are expensive (₹56–311 CPM).** You pay a large premium to optimize for chat-opens.
3. **Lead Form converted at a real, attributable rate** (1 lead / ₹209) — lowest-friction path to a CRM record because no WhatsApp send is required.
4. **WhatsApp Status cannot run alone** — Meta requires an Instagram Stories companion placement.
5. A "conversation started" is a vanity metric unless the person messages the bot. Watch CRM contacts, not Meta's conversation count.
6. **Don't run many overlapping-audience ads at once.** With ≥3 ads on the same geo/age, Meta delivers whichever has the easiest/cheapest goal (Reach) and **starves the conversation/lead ads to ₹0** even though they're ACTIVE+approved. Confirmed 2026-05-25. Keep 1–2 ads per audience; pause stalled ones quickly.
7. **Consolidation paid off (measured 2026-05-26).** After pausing the 3 overlapping ads, Lead Form v2 delivery cleared up: **1 lead → 3 leads** (2 in one day). Proof that fewer, focused ads beat many overlapping ones.

## Snapshot 2026-05-26 (2 active ads, lifetime 05-23→05-26)
- **Lead Form v2** (`120249377681810547`, ₹300/day): spend ₹277, **3 leads**, **cost/lead ₹92.40**, reach 1,159, CTR 1.94%, CPC ₹11.09, CPM ₹215. → the lead engine.
- **Reach — New Reel** (`120249325961810547`): spend ₹322, **reach 89,567**, impressions 99,680, **CPM ₹3.23**, 2,070 video views, 0 leads (awareness by design).

## 2026-05-29 — ALL ADS PAUSED by owner
Account is now 0 ACTIVE / 8 PAUSED. Final spend snapshot 05-23 → 05-29:
- Lead Form v2 `120249377681810547`: ₹769, 2,520 reach, **4 leads**, **cost/lead ₹192** (cost doubled from ₹95 as frequency climbed to 1.24 and click→lead conversion dropped from ~17% → ~7%). Likely fatigue.
- Reach — New Reel `120249325961810547`: ₹322, 89,567 reach, 0 leads (ended 05-26).
- Ghaziabad-reel Lead Form `120249699359820547` (1 day live): ₹80, **CTR 0.33%** (vs v2's 2.11% — **6× weaker**), 0 leads. Creative didn't connect with this audience — owner-chosen B2 overlap + weak creative = pause within 24h.

**Net lessons added:**
- 8. **Same audience + different reel ≠ same performance.** v2 (older reel) sustains 2.11% CTR; new Ghaziabad reel got 0.33% on the SAME audience/form. Each reel needs its own test before scaling spend.
- 9. **Cost-per-lead drift watcher:** when frequency >1.2 AND click→lead conversion drops below half its baseline, the audience is saturating — refresh creative or rest the audience, don't just keep spending.

## 2026-05-28 — new lead-form ad launched (owner chose B2 = overlapping)
- **Lead Form — Ghaziabad-reel 3-city** (`120249699359820547`, ₹500/day). Ad set `120249699437360547`, ad `120249699535770547`, creative `1468097981183171`, form `1889798695045088`. Reel `17927125359323358` (Vaishali Sec-5 3BHK, ₹1.30 Cr). Geo Delhi+Noida+Ghaziabad (25 km), 31–65, A+iOS, FB+IG (feed/story/reels/explore/instream). Reach campaign already ended 05-26 19:55.
- **Owner chose overlap with Lead Form v2** despite warning — watch v2 spend; if it drops <₹150/day = auction starving it, escalate to pause v2.
- **API constraints discovered (durable lessons):**
  1. **Meta lead forms: no "optional" flag on any question via API** — neither standard EMAIL nor CUSTOM accepts `optional:true` (error #100). Optional is a UI-only toggle. Choices via API are name+phone (F1) or name+phone+email-all-required (F2). Owner picked F1.
  2. **`facebook_positions:"video_feeds"` is deprecated** — error subcode `2490562`. Use `instream_video` instead.
  3. **Advantage+ audience caps min age at 25 by default** — error subcode `1870188` if `age_min>25`. Disable via `targeting.targeting_automation.advantage_audience=0` to use literal age targeting.
  4. **`leadgen_forms` requires `context_card.title`** — content alone gets error "Context card title is not provided".

**Next read:** re-pull insights on the 3 active campaigns after ~3 days of delivery and fill in a results column to compare CTW-Status vs Lead-Form v2 cost-per-real-lead.
