---
name: 99acres Pull API Integration
description: 99acres lead polling — operational. Re-confirmed working 2026-04-29 by Puneet (after a brief earlier-month outage was resolved).
type: project
---

99acres Pull API integration is fully built, deployed, and **currently WORKING** (re-confirmed by Puneet on 2026-04-29).

**Credentials (configured in /var/www/realty-pandit/backend/.env):**
- Username: REALTY.PUNDIT2
- Password: Swastik007# (stored as NINETY_NINE_ACRES_PASSWORD)
- Endpoint: https://www.99acres.com/99api/v1/getmy99Response/OeAuXClO43hwseaXEQ/uid/

**Live status (verified 2026-04-17 via integration_syncs table):**
- status = success
- last_success = 2026-04-17 16:13:40
- consecutive_failures = 0
- total_syncs = 4,987
- Runs every 10 min via BullMQ job `99acres-poll`

**Recent lead intake (contacts.source = '99acres'):**
- 2026-04-04: 606 leads (before outage)
- 2026-04-05 to 2026-04-12: 0 (outage period)
- 2026-04-13: 146 leads (day 99acres fixed their server)
- 2026-04-14: 25, 15: 26, 16: 30, 17: 23 — steady ~25-30/day
- Total 99acres leads in DB: 859

**Outage timeline (historical):**
- 2026-04-05 10:23 IST: last good sync before outage
- 2026-04-05 23:43 IST: first HTTP 500 from 99acres
- 2026-04-10: Puneet emailed sandeep.upadhyay@99acres.com + Vishal.Singh@99acres.com (bzonkcrazy@gmail.com sent request on 2026-03-23 originally; info@realtypandit.in sent follow-up 2026-04-11)
- 2026-04-13 05:17 IST: Sandeep replied "Please try now" — server fixed on 99acres side
- 2026-04-13: syncing resumed automatically (no code change needed)

**Root cause of outage:** 99acres server-side issue — returned HTTP 500 + "XML Parsing Error" ERROR-0000 code. Our side was healthy throughout. Sandeep never explained exactly what was fixed but it started working again immediately after his reply.

**Support contacts:** sandeep.upadhyay@99acres.com, Vishal.Singh@99acres.com

**Files:**
- `agents/backend/src/services/ninety_nine_acres_poller.ts` — core polling service
- `agents/backend/src/routes/integrations.ts` — admin API (sync status, manual trigger, history)
- `agents/backend/src/queues/workers/scheduled_worker.ts` — job #11 99acres-poll (runs every 10min)

**How to apply:** No action needed — running autonomously. If it fails again, check integration_syncs.last_error and reach out to Sandeep.

---

---
name: MagicBricks PUSH Integration — LIVE 2026-04-18
description: MagicBricks pushes leads to our endpoint via GET/POST. Push endpoint is live and tested. API key set in server .env.
type: project
---

## Status (verified 2026-04-18)

**LIVE and working.** MagicBricks is a PUSH integration — they call our endpoint.

| Component | Status |
|---|---|
| Push endpoint `GET|POST /external/magicbricks/push` | ✅ LIVE |
| `MAGICBRICKS_API_KEY` in server `.env` | ✅ Set |
| Leads created in DB with source='magicbricks' | ✅ Verified |
| Duplicate detection | ✅ Returns "Failure: Lead already exist" |
| Wrong key | ✅ Returns "Unauthorized" |
| Agent assignment + workflow task | ✅ Round-robin on new leads |
| Buyer WhatsApp confirmation | ✅ Fire-and-forget |

## Endpoint to give MagicBricks

```
https://api.realtypandit.in/external/magicbricks/push
```

Method: GET or POST
Auth: `api_key` as query param

API Key is stored in `/var/www/realty-pandit/backend/.env` as `MAGICBRICKS_API_KEY`.

## MagicBricks field mapping

| MagicBricks field | Our field |
|---|---|
| `mobile` | phone_number (normalized) |
| `name` | name |
| `email` | email |
| `msg` | interaction content / notes |
| `project` | used for property uploader assignment |
| `City` | preferred_location |
| `isd` | logged in metadata |
| `dt` | logged in metadata |
| `source` | always forced to 'magicbricks' |

## Response format (plain text, matches MagicBricks CRM integration spec)

- Success: `Success: Lead punched in the CRM`
- Duplicate: `Failure: Lead already exist`
- Bad key: `Unauthorized` (HTTP 401)

## Bug fixed in this session

`routes/external_leads.ts` had `router.use(apiKeyAuth)` at the top (global scope).
Express was calling it for ALL `/external/*` paths, blocking `/external/magicbricks/push`
before it reached the magicbricks router. Fixed by moving `apiKeyAuth` to per-route middleware
on each route in `external_leads.ts`.

## Files

- `src/integrations/magicbricks.ts` — GET+POST `/push` handler + legacy `/webhook` (X-API-Key)
- `src/routes/external_leads.ts` — per-route apiKeyAuth (fixed 2026-04-18)
- `src/app.ts` line 258 — mount: `app.use('/external/magicbricks', externalLimiter, magicBricksRoutes)`

## Existing push webhook (legacy)

- `POST /external/magicbricks/webhook` — uses X-API-Key header, expects JSON body. Still works.
- Different field names: `buyer_name`, `buyer_phone`, etc. Not MagicBricks native format.
