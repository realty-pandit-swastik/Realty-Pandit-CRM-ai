---
name: reference-meta-webhooks-live
description: Realty Pandit FB + IG webhook subscriptions — what's live as of 2026-05-14, how to verify, how to refresh
metadata:
  type: reference
---

# Meta FB/IG webhooks (live since 2026-05-14)

Code at `agents/backend/src/integrations/facebook.ts` → `agents/backend/src/services/social_replier.ts` has been wired for months. Final piece (Meta-dashboard subscription) shipped 2026-05-14.

## What's subscribed

App ID **1868797817103904** (Panditji), Page ID **905415725999343** (Realty Pandit), IG Business Account **17841447875862678** (@airealtypandit), Business Manager **782804307620931**, **Ad Account `act_850915011262416`** (INR, Asia/Kolkata, created 2026-02-16).

| Object | Fields | Where |
|---|---|---|
| `page` | feed, messages, messaging_postbacks, mention, leadgen | App-level + page-level (`subscribed_apps`) |
| `instagram` | comments, messages, mentions, messaging_postbacks | App-level (IG events route via the connected page automatically — no separate IG subscribed_apps needed) |
| `whatsapp_business_account` | 29 fields | unchanged |

Callback URL: `https://api.realtypandit.in/webhooks/facebook/webhook`
Verify token: `realty_pandit_fb_verify` (matches `FB_WEBHOOK_VERIFY_TOKEN` in prod `.env`)

## How to verify it's still working

**App-level subscriptions:**
```bash
APP_ID=$(grep ^FB_APP_ID= /var/www/realty-pandit/backend/.env | cut -d= -f2)
APP_SECRET=$(grep ^FB_APP_SECRET= /var/www/realty-pandit/backend/.env | cut -d= -f2)
curl -s "https://graph.facebook.com/v25.0/${APP_ID}/subscriptions?access_token=${APP_ID}|${APP_SECRET}"
```

Should list `page` and `instagram` objects with their fields.

**Page-level (does our page forward to our app?):**
```bash
PAGE_ID=$(grep ^FB_PAGE_ID= /var/www/realty-pandit/backend/.env | cut -d= -f2)
TOKEN=$(grep ^FB_PAGE_ACCESS_TOKEN= /var/www/realty-pandit/backend/.env | cut -d= -f2)
curl -s "https://graph.facebook.com/v25.0/${PAGE_ID}/subscribed_apps?access_token=${TOKEN}"
```

Should return `{"data":[{"name":"Panditji","id":"1868797817103904","subscribed_fields":[...]}]}`.

**Live delivery test (simulated):**
```bash
APP_SECRET=$(grep ^FB_APP_SECRET= /var/www/realty-pandit/backend/.env | cut -d= -f2)
PAYLOAD='{"object":"page","entry":[{"id":"905415725999343","time":1700000000,"changes":[{"field":"feed","value":{"item":"comment","verb":"add","comment_id":"probe_001","message":"probe","from":{"id":"99","name":"Probe"},"post_id":"x"}}]}]}'
SIG=$(printf "%s" "$PAYLOAD" | openssl dgst -sha256 -hmac "$APP_SECRET" -hex | awk '{print $2}')
curl -sX POST "https://api.realtypandit.in/webhooks/facebook/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  -d "$PAYLOAD"
# Expected: {"status":"ok"}
```

Then `tail /var/www/realty-pandit/backend/logs/combined-YYYY-MM-DD.log` and grep for `SocialReplier` — should see the comment classified + AI reply attempted.

## Gotchas

1. **Do NOT `source .env`** to pull these vars — `.env` contains an unquoted multi-line PEM private key (Flow private key around line 52) that breaks bash sourcing and silently UN-sets later vars including `FB_PAGE_ID`. Use `grep ^VAR= .env | cut -d= -f2` instead. See [[reference-prod-infrastructure]].
2. **IG subscribed_apps endpoint requires a USER access token, not IG_ACCESS_TOKEN.** The IG token will return "Application does not have the capability." Instagram events route via the connected page anyway, so the page-level subscribed_apps is what matters.
3. **Page-level subscribed_apps requires the PAGE access token, not the user token.** Use `FB_PAGE_ACCESS_TOKEN`.
4. The Meta dashboard UI sometimes shows "Loading..." in the toggle cell after a subscribe click — the save HAS gone through; just reload the page and confirm the new state.

## Token rotation reminder

`FB_PAGE_ACCESS_TOKEN` expires after ~60 days. When it does, Sentry/GlitchTip starts logging `OAuthException` on every webhook event. Refresh via:
1. Graph API Explorer → generate User Access Token with `pages_show_list`, `pages_manage_metadata`, `pages_messaging`
2. Exchange for long-lived: `GET /oauth/access_token?grant_type=fb_exchange_token&client_id=$FB_APP_ID&client_secret=$FB_APP_SECRET&fb_exchange_token=<short>`
3. Get page token: `GET /me/accounts?access_token=<long-lived>`
4. Update `FB_PAGE_ACCESS_TOKEN` in `/var/www/realty-pandit/backend/.env`, `pm2 reload realty-backend`

Same flow for `IG_ACCESS_TOKEN` (uses `/me/accounts` but pick the IG-business-account entry).

## Ad Account (Marketing API) — connected 2026-05-14

- **ID:** `act_850915011262416` (numeric `850915011262416`, stored in `FB_AD_ACCOUNT_ID` env)
- **Currency:** INR. Timezone: Asia/Kolkata.
- **Status:** `3` — labelled "UNSETTLED" in Meta's enum, but **don't be misled by the name**. With `disable_reason: 0` and a valid funding source attached, status 3 just means "fresh account, never spent". It auto-flips to `1 = ACTIVE` on first campaign launch. No billing action needed.
- **Funding source:** `VISA *2801` (id `25811240978559379`) attached and ready. Verified via `GET /act_.../fields=funding_source_details` on 2026-05-14.
- **Token access verified** with `FB_ACCESS_TOKEN` (User token, 215 chars): can read campaigns, adsets, ads, insights, lead-forms. All endpoints return `{"data":[]}` because account is fresh (age=0, spend=0, 0 forms).
- **Account status enum to remember:** `1=ACTIVE, 2=DISABLED, 3=UNSETTLED-but-actually-just-fresh, 7=PENDING_RISK_REVIEW, 9=IN_GRACE_PERIOD, 100=PENDING_CLOSURE, 101=CLOSED`. **Status 3 is benign IF `disable_reason=0`** — only flag as a real problem when `disable_reason > 0`.

### Backend wiring

`FB_AD_ACCOUNT_ID=850915011262416` in `/var/www/realty-pandit/backend/.env` (no `act_` prefix; code prepends when calling Graph API). Backend reads via `process.env.FB_AD_ACCOUNT_ID`. No Marketing API code paths exist yet — env is staged for future use (lead-ad sync, campaign auto-creation, insights dashboard).

### Probe commands

```bash
ACT=act_850915011262416
T=$(grep ^FB_ACCESS_TOKEN= /var/www/realty-pandit/backend/.env | cut -d= -f2)
# Account details
curl -s "https://graph.facebook.com/v25.0/${ACT}?fields=name,account_status,balance,amount_spent,currency&access_token=${T}"
# Campaigns
curl -s "https://graph.facebook.com/v25.0/${ACT}/campaigns?fields=id,name,status,objective&access_token=${T}"
# Last-30d insights
curl -s "https://graph.facebook.com/v25.0/${ACT}/insights?date_preset=last_30d&fields=spend,impressions,clicks,actions&access_token=${T}"
# Lead-ad forms on the page
PT=$(grep ^FB_PAGE_ACCESS_TOKEN= /var/www/realty-pandit/backend/.env | cut -d= -f2)
PID=$(grep ^FB_PAGE_ID= /var/www/realty-pandit/backend/.env | cut -d= -f2)
curl -s "https://graph.facebook.com/v25.0/${PID}/leadgen_forms?access_token=${PT}"
```

## Reference

Detailed step-by-step in [`docs/runbooks/meta-fb-ig-webhook-subscribe.md`](../../../clients/sunny-sharma/projects/reality-pandit/docs/runbooks/meta-fb-ig-webhook-subscribe.md).
