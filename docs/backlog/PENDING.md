# Pending Work

> Active items, organized by who/what is blocking. For dated phase plans see [`../plans/`](../plans/). For live status see [`../PROJECT_STATUS.md`](../PROJECT_STATUS.md).

## Blocked on Sunny (product decision)

| Item | Detail |
|---|---|
| 790 contacts have no Deal | Should we retroactively backfill Deals from existing Contacts? Or leave only forward-going Contacts to create Deals? |
| Phase 9 — property cards | Design/scope decision needed |
| Phase 10 — digest | Design/scope decision needed |
| **Dashboard 5C — confirm 2 pre-existing routing behaviours** | The Phase-5C adversarial review flagged (independent of the `assignment_method` instrumentation) two real routing changes vs an older baseline: (a) the MagicBricks push cascade (sub_user→listing agent; unmatched sub_user→manager pool), (b) the 2026-07-12 partner-creator `resolvedAgentId` (partner-role actors' new leads → the partner's managing agent). Both are dated/guarded features — confirm they are intended. |
| **Dashboard 5E — tune Pipeline Outlook stage-probabilities** | The directional GCI panel (Team Performance) uses industry-generic close-probabilities `NEW 5% / QUALIFIED 15% / VISIT_SCHEDULED 30% / VISITED 45% / NEGOTIATION 65% / ON_HOLD 10%` — NOT derivable from history (only 2 closed-won deals ever). Tune to Sunny's real felt conversion-by-stage if desired → `backend/src/utils/gci.ts` `STAGE_PROBABILITY`. |
| **Commission ledger empty → no *real* GCI forecast** | `DealCommissionEntry` = 0 rows and closed deals carry no `commission_amount` (2 closed-won ever). Dashboard 5E shipped a DIRECTIONAL weighted-pipeline as a result. To upgrade to a true GCI forecast, start capturing per-deal commission (rate + amount) at close; then `/api/analytics/gci-forecast` can regress real numbers instead of assuming 2%. |

## Owner actions (Puneet) — from the 2026-07-25 bug-batch

| Item | Detail |
|---|---|
| **Re-enter real owners for 467 staff-as-owner listings** | #9 railguard is LIVE (`583005a`) — no NEW listing can have a team member as owner (create + edit, matched on last-10 digits). The **467 existing** staff-as-owner listings were NOT auto-cleared (owner chose "review list first" — bulk-clear would make 342 active listings temporarily uncontactable). **Review list:** [`../archive/2026-07-25-staff-as-owner-review-467.csv`](../archive/2026-07-25-staff-as-owner-review-467.csv) (display_id, wrong owner staff, phone, assigned agent, address). Concentration: **Bhuvneswar Gupta 164, Ashwani 82** (= 246 of 467), Vinod Rajput 27, Ravindra 25, Hardiq 25… Team should re-enter the actual owner per listing (the assigned agent knows them). A reversible snapshot + bulk-clear script is ready (`/root/backups/owner_clear_snapshot_20260725.json`, `bulk_clear_owner.cjs`) if you later want to force it. |

## Owner actions (Puneet) — from the 2026-07-24 bug-batch

| Item | Detail |
|---|---|
| ~~99acres login emails for ~6 unmapped agents~~ | ✅ **RESOLVED 2026-07-24.** Extracted the distinct 99acres `sub_user_name` values from `interactions.metadata` and ran the poller's resolver — only **one** was actually unmapped: `binuchauhan047@gmail.com` (22 recent leads) = **Beenu Chauhan** (active employee whose `google_email` was a different `binu60210@gmail.com`). Set `agents.nine9acres_email = binuchauhan047@gmail.com` for Beenu (verified it now resolves); the existing 22 were left with their round-robin owners. **Note:** ~164 leads (95 in last 60d) carry **no** sub-user from 99acres at all — inherent to the feed, correctly round-robined by EXEC 3; not a mapping gap. |
| ~~GCP: delete the old unrestricted Gemini key~~ | ✅ **DONE 2026-07-25** (via browser, owner-authorised). **No key ending `…LTT2` existed** — the note's last-4 was off. The actual old **unrestricted** key was **"API key 1"** (AQ-format, ends `…LPAA`, created Mar 17, bound to vertex-express), the only key with no restriction. Verified it was **not referenced in any server env/config** before deleting. Deleted it in Console → *Panditji* → Credentials; confirmed gone. The working restricted **"Gemini API Key"** (`…iO-A`) was left untouched — re-tested **HTTP 200** after deletion. (GCP keeps deleted credentials restorable for **30 days** if anything unexpected breaks.) Remaining keys: Gemini API Key, Panditji Update, Generated Maps API Key, Panditjit. |
| ~~Stale/dead Gemini key in deploy-source env files~~ | ✅ **FIXED 2026-07-24.** Found `backend/.env.production` **and** the `agents/backend/.env*` mirrors still held an OLD Gemini key (`AIza…pszIE4`, now **HTTP 400 dead**) while the live `backend/.env` had the working key — a deploy copying `.env.production`→`.env` would have broken Gemini. Synced all three to the working key (`…iO-A`, re-tested 200); backups at `*.bak-gemini-sync`. Secrets, so **not** committed to git. |
| Daily digest (`rp_agent_daily_digest`) — parked by choice | Meta-approved 2026-07-24 but owner chose "skip for now". To wire later: decide recipients (managers/super_boss org-wide **vs** every agent with their own numbers) + define "hot leads" and "deals needing action". See [`whatsapp-staff-templates-to-submit.md`](whatsapp-staff-templates-to-submit.md). |
| Decide on the 99 protected address rows | EXEC 2 (`c4933f9`) recomputed `full_address` for 58/157 rows and **protected 99** (they carried Google locality detail like "Shakti Khand" that a naive rebuild would drop). **Full review list generated 2026-07-24:** [`../archive/2026-07-24-protected-address-rows-review.md`](../archive/2026-07-24-protected-address-rows-review.md) — each row with its `plot_no`, the detail that would be lost, current vs naive-rebuild. **Recommendation: leave as-is** — `plot_no` isn't lost (own column), current strings keep accurate Google localities, and each self-heals on next admin edit (the edit form now recomputes). No bulk action advised. Owner to confirm/close. |

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
