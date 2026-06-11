# Pending Work

> Active items, organized by who/what is blocking. For dated phase plans see [`../plans/`](../plans/). For live status see [`../PROJECT_STATUS.md`](../PROJECT_STATUS.md).

## Blocked on Sunny (product decision)

| Item | Detail |
|---|---|
| 790 contacts have no Deal | Should we retroactively backfill Deals from existing Contacts? Or leave only forward-going Contacts to create Deals? |
| Phase 9 — property cards | Design/scope decision needed |
| Phase 10 — digest | Design/scope decision needed |

## Blocked on Meta

| Item | Detail |
|---|---|
| 3 WhatsApp templates pending approval | Out of 78 total. Recheck periodically. See [`../runbooks/meta-template-approval.md`](../runbooks/meta-template-approval.md) |
| Category lock expires ~2026-05-17 | 3 templates can then be reclassified MARKETING → UTILITY (saves ~₹0.44/message). Action: reclassify in Meta Business Manager after that date. |

## Known technical debt

| Item | Where | Priority |
|---|---|---|
| ~~BullMQ `scheduled_jobs` queue had ~1000 failed jobs (2026-05-02)~~ | Cleared 2026-05-14 — all stale from already-fixed bugs (99acres-poll auth pre-Apr-7, housing-poll path pre-Apr-9, daily-report template-key fixed today). 1003 → 0. See [`reference_bullmq_cleanup.md`] | ✅ Done |
| Pipecat deprecation warnings — `voice_id`, `model`, `params` should move to `settings=GeminiLiveLLMService.Settings(...)` (`pipecat/pipeline.py:258-263`) | Pipecat config | Low — **still OPEN.** Cosmetic warnings only (bot works); deferred 2026-06-04 (live voice bot, needs a dedicated test pass before changing the Gemini Live service config). |
| ~~SIP port 5061 still open in firewall~~ | Server | ✅ Done — verified 2026-06-04: no 5061 rule in `ufw status` (closed in the 2026-05-14 hygiene cleanup). |
| ~~`sip_server.py` code can be deleted from repo~~ | Codebase | ✅ Done — verified 2026-06-04: absent from both repo and server. |
| ~~Partner portal login route not built yet~~ | `agents/backend` | ✅ Done — verified 2026-06-04: it IS built at `routes/agent.ts` `POST /agent/login-otp` (send) + `POST /agent/verify-otp` (verify → partner JWT with `partner_category`/`parent_partner_id`, sets auth cookies). Redis-based OTP; the class method `agent_auth.ts#sendPartnerOTP` is an alternate unused impl. |
| Stale `/uploads/pending/` media URLs after partial promote-on-commit | `inventory.media_urls` | ✅ One-off fixed 2026-06-04 (2 listings, 5 dead URLs stripped, snapshot `inventory_bak_pendingurls_*`). Optional follow-up: a daily cron flagging `media_urls LIKE '%/uploads/pending/%'` (recurrence is rare). |
| **BHK missing from listing specs (~95%; verified 43/45 active rentals 2026-06-05)** | `inventory.specs` | **Medium — MITIGATED in code, data still open.** Was the real reason the customer voice bot sent nothing: the bot extracts `bhk` correctly, but a HARD BHK post-filter (`specs.bhk ?? rooms ?? bedrooms === n`) dropped every BHK-unknown listing → 0 results → silence. **Fixed 2026-06-05**: BHK is now a **SOFT** filter in `routes/internal_tools.ts` `/search-and-show-properties` (keeps exact matches + BHK-unknown, excludes only a known-different BHK) + type filter made an OR-union; deployed, 8/8 tests. But "2BHK" won't *truly* match until BHK is backfilled into `specs.bhk`. Backfill source: capture during add-inventory, or parse from listing titles / feed payloads. See `reference_property_card_share_flow.md` ("95% missing BHK"), `reference_inventory_specs_sot.md` (BHK read chain). |

## Deferred — extend new-lead reminder to voice/chat/OTP (verified 2026-05-27, LOW priority)

The [new-lead → Google Calendar/Task reminder](../runbooks/new-lead-google-reminder.md) (shipped 2026-05-27)
fires only for the 8 sources that call `ensureDealForLead`. Voice / AI-chat / OTP-signup
don't, because they create a **contact but never a deal**. Before building, we sized it on the
live DB — **conclusion: low payoff right now, leave pending.**

Verified findings (so we don't re-investigate):
- **AI-chat + OTP/website-verify paths are dormant** — `source='website_chat'` has **0** contacts
  in the DB. The earlier hypothesis that the OTP/website-verify flow ([`routes/auth_otp.ts`](../../agents/backend/src/routes/auth_otp.ts) →
  contact pre-created, then the WhatsApp "yes" reply skips deal-creation because
  [`webhook_processor.ts:97`](../../agents/backend/src/services/webhook_processor.ts) gates `ensureDealForLead` inside `if (!contact)`)
  is leaking leads was **DISPROVEN** — that flow isn't being exercised. If it ever goes live,
  the clean fix is to call `ensureDealForLead` inside `authenticateUser()` (on the "yes" reply).
- **Voice is the only active deferred source, and it's tiny** — ~3–9 contacts/month (14 deal-eligible
  no-deal total). Missed-vs-answered IS distinguishable in [`services/voice.ts`](../../agents/backend/src/services/voice.ts):
  Vapi `call.status==='completed'` = answered, else missed (already routed to `handleMissedCall()` ~line 201).
  Natural trigger = **missed inbound calls** → "call back within 30 min". Fix = `ensureDealForLead({source:'voice'})`
  after the contact.create on the call report.
- **The big "1058 99acres contacts with no deal" is NOT this — it's the pre-B1 historical backlog**
  (span ends 2026-04-30, the day before B1 auto-deal-creation went live 2026-05-01). Same thing as the
  "contacts have no Deal" item under *Blocked on Sunny* above (retroactive-backfill decision).

When picked up: this is a behavior change across entry points → own Discuss→Plan→Edit pass.

## Deferred from completed phases

| From | Item |
|---|---|
| Stage 1 NEW UX redesign (2026-04-30) | Phase 6 — mobile full-screen page deferred |
