# Meta FB/IG Webhook Subscription Runbook

**Goal:** Subscribe the Realty Pandit Meta app to Facebook page + Instagram business account events so the AI bot replies to comments, DMs, and lead-ad events on production.

**Status:** Backend handler + reply logic exist (`agents/backend/src/integrations/facebook.ts` → `agents/backend/src/services/social_replier.ts`). FB + IG tokens are loaded into `.env`. Verify endpoint `https://api.realtypandit.in/webhooks/facebook/webhook` responds correctly to handshake. **Only the Meta-dashboard side is missing.**

---

## One-time setup (≈ 15 minutes)

You'll need:
- Admin access to Meta Business Suite for the Realty Pandit page
- Admin access to the Meta developer app `1868797817103904`
- Phone with the page admin's WhatsApp logged in (for 2FA)

### Step 1 — Confirm prod env is ready

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'grep -E "^(FB_|IG_|META_BUSINESS)" /var/www/realty-pandit/backend/.env | sed "s/=.*/=SET/"'
```

Expected output: 10 vars set (FB_PAGE_ID, FB_APP_ID, FB_APP_SECRET, FB_ACCESS_TOKEN, FB_PAGE_ACCESS_TOKEN, FB_WEBHOOK_VERIFY_TOKEN, FB_PIXEL_ID empty, IG_BUSINESS_ACCOUNT_ID, IG_APP_ID, IG_ACCESS_TOKEN, META_BUSINESS_ID).

Verify webhook responds:
```bash
curl -s 'https://api.realtypandit.in/webhooks/facebook/webhook?hub.mode=subscribe&hub.challenge=ping&hub.verify_token=realty_pandit_fb_verify'
# Expected: ping
```

### Step 2 — Configure the webhook in Meta App Dashboard

1. Open [developers.facebook.com/apps/1868797817103904](https://developers.facebook.com/apps/1868797817103904/dashboard/)
2. Left sidebar → **Webhooks**
3. Click **Add subscription** → **Page**
   - Callback URL: `https://api.realtypandit.in/webhooks/facebook/webhook`
   - Verify Token: `realty_pandit_fb_verify`
   - Click **Verify and Save**
4. Subscribe to fields (check the boxes):
   - `feed` — Facebook page post + reel comments
   - `messages` — Facebook Messenger DMs
   - `messaging_postbacks` — button clicks inside Messenger
   - `mention` — when the page is @-tagged
   - `leadgen` — Facebook lead ads (already used elsewhere — leave as-is if already on)
5. Click **Add subscription** → **Instagram**
   - Callback URL: same `https://api.realtypandit.in/webhooks/facebook/webhook`
   - Verify Token: `realty_pandit_fb_verify`
6. Subscribe to fields:
   - `comments` — IG post + reel comments
   - `messages` — IG DMs
   - `mentions` — story mentions / @-tags
   - `message_reactions` — reactions to bot replies

### Step 3 — Bind the page + IG business account to the app

1. In **App Roles → Permissions and Features**, confirm `pages_manage_metadata`, `pages_read_engagement`, `pages_messaging`, `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments` are **Live** (not Standard). If they show Standard, click **Request advanced access** for each.
2. **Page subscriptions:** Settings → Business Settings → **Accounts → Pages → Realty Pandit → Connected Apps**. Confirm our app is connected with the listed permissions.
3. **Instagram subscription:** Settings → Business Settings → **Accounts → Instagram accounts → @realtypandit → Connected Apps**. Same check.

### Step 4 — Smoke test (3 minutes)

From a **non-admin** Facebook account:
1. Comment on a Realty Pandit page post → within 5 seconds, expect a public reply + a private Messenger DM with WhatsApp link.
2. Send a Messenger message to the page → expect a templated reply with WhatsApp button.

From a **non-admin** Instagram account:
1. Comment on a recent Realty Pandit reel → expect public reply + private IG DM with WhatsApp link.
2. Send a DM → expect templated reply.

If any leg fails:
```bash
# Tail backend logs while you trigger from your phone
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'pm2 logs realty-backend --lines 0 --raw 2>&1 | grep -iE "facebook|instagram|fb_|ig_|social_replier"'
```

Verify the events landed in DB:
```sql
SELECT channel, event_type, COUNT(*) FROM interactions
WHERE channel IN ('facebook','instagram','messenger') AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY 1,2;
```

---

## Token rotation (every 60 days for FB_PAGE_ACCESS_TOKEN)

Page access tokens issued from a long-lived user token usually last 60 days. When they expire, FB/IG replies silently stop.

Refresh:
1. developers.facebook.com → Graph API Explorer → select app `1868797817103904`
2. Generate new User Access Token with `pages_show_list`, `pages_manage_metadata`, `pages_messaging`
3. Exchange for long-lived token:
   ```
   GET https://graph.facebook.com/oauth/access_token?
       grant_type=fb_exchange_token
      &client_id=1868797817103904
      &client_secret=<FB_APP_SECRET>
      &fb_exchange_token=<short-lived-user-token>
   ```
4. Get the page access token from `/me/accounts` using the long-lived user token.
5. Update `.env`:
   ```bash
   ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224
   nano /var/www/realty-pandit/backend/.env
   # update FB_PAGE_ACCESS_TOKEN=<new>
   pm2 reload realty-backend
   ```

Same flow for `IG_ACCESS_TOKEN` (uses different Graph API endpoints — Instagram's `me/accounts` returns the IG-business token).

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Webhook handshake fails with 403 | `FB_WEBHOOK_VERIFY_TOKEN` in `.env` doesn't match the value pasted in Meta dashboard |
| Comments not getting replies | `feed` not subscribed at app level; OR `FB_PAGE_ACCESS_TOKEN` expired; OR `pages_manage_metadata` permission not in Live state |
| IG DMs not received | `instagram_manage_messages` permission still in Standard; OR IG account isn't connected to the FB page; OR the IG account isn't a Business account |
| Replies post but to OUR own comments (infinite loop) | Backend should already skip own — confirm `FB_PAGE_ID` and `IG_BUSINESS_ACCOUNT_ID` env vars are set correctly so `social_replier.ts` can filter |
| Webhooks suddenly stop working | Token expired. Check Sentry/GlitchTip for `OAuthException` errors. Rotate per section above. |

---

## Files referenced

- Webhook entry: `agents/backend/src/integrations/facebook.ts`
- Reply logic: `agents/backend/src/services/social_replier.ts`
- Express mount: `agents/backend/src/app.ts:265` (mounts `/webhooks/facebook/*`)
- Env: `/var/www/realty-pandit/backend/.env` (FB_*, IG_*, META_BUSINESS_ID)
