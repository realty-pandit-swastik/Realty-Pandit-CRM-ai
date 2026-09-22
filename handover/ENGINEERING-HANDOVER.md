# Realty Pandit — Engineering Handover & Server Control

**Prepared:** 2026-09-12 · **For:** the incoming developer · **From:** Varchasv Bhardwaj
**Source of truth for anything that contradicts this file:** `docs/PROJECT_STATUS.md`, then the runbooks in `docs/runbooks/`.

> ### 🔐 Read this first — what is deliberately NOT in this document
>
> This file contains **no passwords, no private keys, no API tokens, no `.env` values.** It tells you
> _what every secret is, what it protects, which account it comes from, where it lives on the server,
> and how to rotate it._ The values themselves are handed over **out-of-band** (see §2). This document
> is safe to email; a version with the values pasted in would not be, and must never exist.
>
> Every credential inventory below was verified against the live server on 2026-09-12 by listing
> environment-variable **names only**.

---

## 1. The system at a glance

| Surface              | URL                                         | Served by                                                                       |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| Public website       | `https://realtypandit.in` (+ `www`)         | Next.js, PM2 `realty-website` (**as user `realty`**), port 3000                 |
| Admin CRM            | `https://admin.realtypandit.in`             | Vite/React static build in `/var/www/realty-pandit/frontend/dist/` behind nginx |
| API                  | `https://api.realtypandit.in`               | Node + ts-node, PM2 `realty-backend` (root, cluster ×2), port 7071              |
| Voice bot (Panditji) | proxied under `api.realtypandit.in` → :8765 | Python/Pipecat, PM2 `panditji-voice` (root)                                     |
| Error tracking       | `https://errors.realtypandit.in`            | Self-hosted GlitchTip, 4 Docker containers, :8100                               |
| Mail                 | `mail.realtypandit.in` (MX)                 | Postfix + Dovecot + OpenDKIM on the same VPS                                    |

**One server does everything.** Hostinger VPS `72.62.231.224`, hostname `srv1344620`, Ubuntu 24.04.4 LTS,
Node 20.20, PM2 6.0.14, PostgreSQL 16.15, Redis, Docker 29. Uptime at handover: 5 weeks.

```
                    Cloudflare DNS (authoritative)            ← NOT Hostinger's zone (see §6.2)
                              │
                    72.62.231.224  (Hostinger VPS)
   ┌──────────────────────────┼──────────────────────────────────┐
   │ nginx :80/:443 (certbot TLS, 4 sites)                        │
   │   realtypandit.in ─────→ :3000  next-server   [pm2 realty]   │
   │   admin.realtypandit.in → /frontend/dist (static) + /api→7071│
   │   api.realtypandit.in ──→ :7071 realty-backend [pm2 root] ×2 │
   │                       └→ :8765 panditji-voice (pipecat)      │
   │   errors.realtypandit.in→ :8100 glitchtip (docker)           │
   │ postgres :5432 (localhost)   redis :6379 (localhost)         │
   │ postfix :25/:587  dovecot :110/:143/:993/:995  opendkim      │
   └──────────────────────────────────────────────────────────────┘
```

**Two clients, two codebases in one repo:** `agents/backend` (API), `agents/frontend` (admin CRM),
`agents/website` (public site), `agents/pipecat` (voice), `agents/android` (staff app, Kotlin),
`agents/call-gateway` (new, Sept 2026 — see §12).

---

## 2. Getting access — do this in order

### 2.1 The rule: you get your **own** key. The existing one is never copied.

Right now **exactly one** SSH key is authorized on the server (`realty-pandit-deployment`, ed25519),
and it lives on Varchasv's machine. Sharing that private key would mean two people hold one
credential that can't be revoked for one without revoking it for both.

**New developer — generate a keypair on your machine:**

```bash
ssh-keygen -t ed25519 -C "<yourname>-realtypandit" -f ~/.ssh/realty_pandit_key
# Send ONLY the .pub file to Varchasv. Never the private key.
cat ~/.ssh/realty_pandit_key.pub
```

**Varchasv — authorize it (one batched command, see the rate-block warning below):**

```bash
ssh realty-pandit 'cat >> /root/.ssh/authorized_keys <<EOF
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHtBVBQiG/GV1D1d7X1lT7J3o5V6IZgZSn2WXRUbbQKg avnish-realtypandit
EOF
chmod 600 /root/.ssh/authorized_keys && wc -l /root/.ssh/authorized_keys'
```

**New developer — `~/.ssh/config`:**

```sshconfig
Host realty-pandit
    HostName 72.62.231.224
    User root
    IdentityFile ~/.ssh/realty_pandit_key
```

```bash
chmod 600 ~/.ssh/realty_pandit_key
ssh realty-pandit "hostname && whoami && pm2 list"
```

Server-side SSH posture (verified): `PasswordAuthentication no`, `PermitRootLogin prohibit-password`
— **key auth only, there is no password path.** fail2ban runs 4 jails including `sshd`.

### 2.2 ⚠️ Hostinger will blackhole your IP if you hammer SSH

Many rapid SSH/scp/curl connections in a short window trip **Hostinger's upstream DDoS mitigation**,
which silently drops every packet from your IP — ping, SSH and HTTPS all time out at once — while
the server is perfectly healthy for everyone else. It is **not** a server-side block (fail2ban/ufw
stay clean) and auto-clears in ~2 minutes; re-bursting re-trips it.

**Batch all server work into single SSH connections.** The pattern used throughout the project:

```bash
# write a script locally, ship it as one connection
ssh realty-pandit "echo $(base64 -w0 script.sh) | base64 -d | bash"
```

If you are blackholed: wait 2 minutes, or use the Hostinger hPanel browser terminal.

### 2.3 Firewall note for your IP

`ufw` is active. It currently allows `22/tcp` from **Anywhere** (plus two now-redundant specific-IP
rules and a `/24`). So your IP needs no firewall change to SSH in — but see §11 for why that rule
should be tightened once you're in.

### 2.4 The secrets handover (out-of-band)

What you need beyond SSH, and how it reaches you — **none of it by email or chat:**

| Item                                                                      | How it reaches you                                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Nothing for the backend `.env`                                            | Server-side scripts read it in place. You do not need a copy.                                     |
| Local `.env` for `agents/backend` + `agents/website` (only for local dev) | Password manager share, or Varchasv places them on the server for you to `scp` down over your key |
| Console logins (Meta, Google Cloud, Cloudflare, Hostinger, GlitchTip)     | Password manager share; **each should be rotated first** — see §11                                |
| Admin CRM test login                                                      | Password manager share                                                                            |

---

## 3. Server map — what runs, as what, and where

### 3.1 Linux users

| User                | Purpose                                                                             |
| ------------------- | ----------------------------------------------------------------------------------- |
| `root`              | Everything except the public website. Where you land over SSH.                      |
| `realty` (uid 5001) | Owns and runs the public website + admin static server under **its own PM2 daemon** |
| `postgres`          | Database                                                                            |

### 3.2 🔴 There are TWO PM2 daemons. This has caused multi-day outages.

```bash
pm2 list                    # ROOT daemon (systemd: pm2-root.service)
sudo -u realty -H pm2 list  # REALTY daemon (systemd: pm2-realty.service)
```

| Daemon | Process                       | Script / cwd                                                | Port |
| ------ | ----------------------------- | ----------------------------------------------------------- | ---- |
| root   | `realty-backend` ×2 (cluster) | `/var/www/realty-pandit/backend/server-bootstrap.js`        | 7071 |
| root   | `panditji-voice`              | `/var/www/realty-pandit/agents/pipecat/main.py`             | 8765 |
| root   | `pm2-logrotate`               | module                                                      | —    |
| realty | `realty-website`              | `/var/www/realty-pandit/website` (`next start`)             | 3000 |
| realty | `realty-admin`                | `/var/www/realty-pandit/frontend` (`npm` → `serve -s dist`) | 5173 |

**Restart the website as `realty`, never as root:** `sudo -u realty -H pm2 restart realty-website`.
Restarting it from root's PM2 "works" and silently produces an orphan process that holds :3000.

### 3.3 Everything else (verified 2026-09-12)

- **systemd:** `nginx`, `postgresql@16-main`, `redis-server`, `docker`, `postfix`, `dovecot`,
  `opendkim`, `fail2ban`, `cron`, `pm2-root`, `pm2-realty`
- **Docker:** `glitchtip-web-1`, `glitchtip-worker-1`, `glitchtip-postgres-1`, `glitchtip-redis-1`
- **nginx sites:** `realtypandit.in`, `admin.realtypandit.in`, `api.realtypandit.in`, `glitchtip`
  — `/etc/nginx/sites-enabled/`
- **TLS:** certbot; one cert covers `realtypandit.in` + `admin` + `api` + `www` (expires 2026-11-14),
  one for `errors.realtypandit.in` (2026-11-12). Auto-renew via `/etc/cron.d/certbot`.
- **cron (`/etc/cron.d/`):** `certbot`, `realty-backup`, `realty-healthcheck`, `disk-alert`,
  `docker-image-prune`, `docker-builder-prune`, `sysstat`. Root and `realty` user crontabs are empty.
- **Listening only on localhost:** postgres 5432, redis 6379, backend 7071, pipecat 8765, next 3000, admin 5173.
  **Listening on all interfaces:** 22, 80, 443, mail ports, and **8100 (GlitchTip via docker-proxy — see §11)**.

### 3.4 Directory map — `/var/www/realty-pandit/`

| Path                                                                                                                                                   | Status                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `backend/`                                                                                                                                             | **LIVE API.** PM2 runs `server-bootstrap.js` here. Holds the real `.env`.             |
| `frontend/`                                                                                                                                            | **LIVE admin.** nginx serves `frontend/dist/`.                                        |
| `website/`                                                                                                                                             | **LIVE public site.** Owned by `realty`.                                              |
| `agents/pipecat/`                                                                                                                                      | **LIVE voice bot.**                                                                   |
| `agents/backend/`, `agents/frontend/`                                                                                                                  | ⚠️ **Stale mirrors. NOT what runs.** Editing them does nothing.                       |
| `backups/`, `/root/backups/`                                                                                                                           | Code + DB backups (725 entries in `/root/backups` at handover)                        |
| `logs/`                                                                                                                                                | Backend winston logs — `backend/logs/combined-YYYY-MM-DD.log`, `error-YYYY-MM-DD.log` |
| `DEPLOYMENT_GUIDE.md`, `MASTER_MANUAL.md`, `PUSH-UPDATE.bat`, `push-update*.sh`, `update-server.sh`, `docker-compose.yml`, `src/`, `admin/`, `deploy/` | Legacy from earlier eras. Treat as untrusted history, not instructions.               |

**The backend has no build step.** PM2 runs ts-node `--transpile-only` on `src/` — a changed `.ts`
is live after `pm2 reload realty-backend`. Type errors do not crash it (there is a large tolerated
`tsc` baseline); only syntax errors do. The frontend is the opposite: `tsc -b && vite build` is
**strict with a clean baseline** — any new type error fails the build.

---

## 4. Secrets inventory — backend `.env` (65 variables, names verified live)

Location: `/var/www/realty-pandit/backend/.env`. **Values are not reproduced here.**

> 🔴 **`.env.production` is a SUBSET of `.env`, not a copy.** 24 variables exist **only** in the live
> `.env`. Running `cp .env.production .env` — which older docs suggest — **deletes them** and takes the
> API down (this happened on 2026-07-13: `REDIS_PASSWORD` gone → NOAUTH crash-loop → 502 everywhere).
> Never do it. Backups of the file exist alongside it (`.env.backup.*`, `.env.bak-*`); restore missing
> keys by merging, never by overwriting.

> ⚠️ **Never `source .env` in bash.** It contains an unquoted multi-line PEM (`FLOW_PRIVATE_KEY`) that
> breaks sourcing and silently unsets later variables. Read one at a time:
> `grep '^FB_PAGE_ID=' .env | cut -d= -f2-`

### 4.1 Core / auth

| Variable                                                                                                                                                                                       | Purpose                                                              | Origin / owner | Rotation notes                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                                                                                                                                                                 | Postgres DSN (`reality_pandit` DB, localhost)                        | Server         | Carries Prisma-only `?connection_limit` — strip `?…` before handing to `psql`/`pg_dump`                                                                                              |
| `REDIS_HOST/PORT/PASSWORD`                                                                                                                                                                     | Cache + BullMQ queues                                                | Server         | `REDIS_PASSWORD` is **server-only** — the one whose loss caused the July outage                                                                                                      |
| `JWT_SECRET`                                                                                                                                                                                   | Admin session JWTs **AND the AES-256-GCM key for `utils/crypto.ts`** | Server         | 🔴 **Dual-purpose.** Rotating it orphans every encrypted value in the DB (`agents.google_refresh_token`, `agents.email_smtp_password`). Runbook: `docs/runbooks/secrets-recovery.md` |
| `AGENT_JWT_SECRET`, `USER_JWT_SECRET`, `BUILDER_JWT_SECRET`                                                                                                                                    | Per-audience JWTs (staff app / customer / builder)                   | Server         | Rotate = force re-login for that audience                                                                                                                                            |
| `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT`                                                                                                                                                         | Web-push (PWA notifications)                                         | Generated once | Rotating invalidates every push subscription                                                                                                                                         |
| `ALLOWED_ORIGINS`, `ADMIN_PANEL_URL`, `API_BASE_URL`, `WEBSITE_URL`, `COMPANY_EMAIL`, `COMPANY_PHONE`, `PORT`, `NODE_ENV`                                                                      | Config, not secret                                                   | —              | —                                                                                                                                                                                    |
| `COLD_NUDGE_ENABLED`, `INTERACTION_ENGINE_ENABLED`, `INVENTORY_BROADCAST_ENABLED`, `SESSION_KEEPALIVE_ENABLED`, `SOCIAL_LLM_REPLIES_ENABLED`, `WA_MARKETING_ENABLED`, `META_SIGNATURE_ENFORCE` | Feature flags                                                        | —              | `COLD_NUDGE_ENABLED` was turned **off** in July after the automated nudges got the WhatsApp account locked for spam. Do not re-enable casually.                                      |

### 4.2 Meta / WhatsApp / Facebook / Instagram

All issued from **Meta Business Manager `782804307620931`**, app **"Panditji" `1868797817103904`**.

| Variable                                                                                                                                                      | Purpose                                                                                            | Rotation                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WHATSAPP_TOKEN`                                                                                                                                              | Cloud API sends (WABA `2124684824933246`, phone-id `1021151161081768`, number **+91 81784 91914**) | Generated on **System User "WA"** in Business Manager, expiry _Never_; phone verification goes to the owner's number. Runbook: `docs/runbooks/whatsapp-token-rotation.md`. A 401 opens a circuit breaker that blocks all sends for ~5 min. |
| `WHATSAPP_SYSTEM_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`                                                         | Webhook verification + ids                                                                         | Config                                                                                                                                                                                                                                     |
| `FB_ACCESS_TOKEN`                                                                                                                                             | **Marketing API** (ad account `act_850915011262416`) + Graph reads                                 | User token. `data_access_expires_at` already lapsed in July 2026 while `is_valid` stayed true — silently. Re-issue via Graph API Explorer → long-lived exchange.                                                                           |
| `FB_PAGE_ACCESS_TOKEN`                                                                                                                                        | Page `905415725999343` (Realty Pandit) webhooks, comment replies                                   | **Expires ~60 days.** Symptom: `OAuthException` on every webhook event in GlitchTip. Runbook: `docs/runbooks/meta-fb-ig-webhook-subscribe.md`                                                                                              |
| `IG_ACCESS_TOKEN`, `IG_APP_ID`, `IG_BUSINESS_ACCOUNT_ID`                                                                                                      | Instagram `17841447875862678` (@airealtypandit)                                                    | Same 60-day pattern. **Expired 15 Jun 2026 unnoticed** — the IG bot never replied once.                                                                                                                                                    |
| `FB_APP_ID`, `FB_APP_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `META_BUSINESS_ID`, `META_CATALOG_ID`, `FB_PAGE_ID`, `FB_PIXEL_ID`, `FB_WEBHOOK_VERIFY_TOKEN` | App identity, webhook signature check, product catalog                                             | App Dashboard → Settings → Basic. ⚠️ The Meta app was **accidentally deleted once** (2026-04-16); every token from it died.                                                                                                                |
| `FLOW_PRIVATE_KEY`, `BOOKING_FLOW_ID`, `SEARCH_FLOW_ID`                                                                                                       | WhatsApp Flows (encrypted flow payloads)                                                           | Multi-line PEM — the reason `.env` can't be sourced                                                                                                                                                                                        |

Webhook callback: `https://api.realtypandit.in/webhooks/facebook/webhook`. Conversions-API dataset
`27479789261692563` (page-matched; the older `760915983366996` is the wrong Page and cannot work).

### 4.3 Google

GCP project **"Panditji"** (`gen-lang-client-0714891689`, number `1007436351560`).

| Variable                                   | Purpose                                                                | Rotation                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`                           | All LLM calls (gemini-2.5-flash)                                       | GCP → Credentials → **"Gemini API Key"** (restricted, `AQ.`-format). The old _unrestricted_ key was deleted 2026-07-25.                                                                                                                                                                                                                        |
| `GOOGLE_MAPS_API_KEY`                      | Browser Places autocomplete                                            | **HTTP-referrer restricted** — Google **denies** it for server-side calls.                                                                                                                                                                                                                                                                     |
| `GEOCODING_API_KEY`                        | Server-side geocoding (99acres ingest, location matching)              | The **"Panditjit"** key — no referrer restriction. If it is ever deleted, geocoding silently returns null and location matching degrades to text.                                                                                                                                                                                              |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth for Calendar/Tasks sync + Sign-in with Google, **for all staff** | OAuth client **"RealtyPandit Web"**. 🔴 In July 2026 these **vanished from every location on the server with no copy anywhere** and killed sync for the whole team for 9 days. Google will not show an existing secret again — use _Add secret_. **Store them in a password manager now.** Redirect URIs must match `google_oauth.ts` exactly. |

### 4.4 Lead portals

| Variable                                          | Portal                             | Notes                                                                                                                                                                                |
| ------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NINETY_NINE_ACRES_USERNAME/PASSWORD/API_URL`     | 99acres pull API (poller)          | Leads route to the agent whose `nine9acres_email` matches the feed's sub-user. 99acres stopped sending `SubUserName` on 2026-07-22 — escalated to their account manager; still open. |
| `MAGICBRICKS_API_KEY`, `MAGICBRICKS_PUSH_API_KEY` | MagicBricks push webhook (`/push`) | Routes on `sub_user` = lister's phone `@timesgroup.com`                                                                                                                              |
| `HOUSING_ACCOUNT_ID`, `HOUSING_API_KEY`           | Housing.com broker-leads API       | Currently ~0 leads/60d                                                                                                                                                               |

### 4.5 Voice, telephony, observability

| Variable                            | Purpose                                                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PIPECAT_SERVICE_URL`               | Backend → Panditji voice service (127.0.0.1:8765). WhatsApp voice calls use the Cloud API **webhook** path (SIP was tried and abandoned — DTLS never completed). |
| `VAPI_PRIVATE_KEY`, `DAILY_SIP_URI` | Vapi / Daily.co (earlier voice experiments; `agents/voice_vapi` is a fallback stub)                                                                              |
| `GLITCHTIP_DSN`, `SENTRY_DSN`       | Error reporting → `errors.realtypandit.in`. Both names exist; `GLITCHTIP_DSN` is current.                                                                        |

### 4.6 Website `.env` (`/var/www/realty-pandit/website/`)

`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (the referrer-restricted one),
`NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_SENTRY_DSN`, `PORT`. All public-by-design; nothing secret.

### 4.7 Android staff app (`agents/android/local.properties`, not in git)

`sdk.dir` and `GLITCHTIP_DSN`. Without `local.properties` the app builds with **no** error reporting and
warns nobody.

---

## 5. Third-party accounts & consoles

| Service                             | Controls                                                                   | Identity                                                                       | Notes                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Hostinger**                       | The VPS itself — billing, reboot, hPanel browser terminal, **rDNS/PTR**    | Owner's account                                                                | 🔴 Its DNS zone for `realtypandit.in` is **stale and inert**. Editing it "succeeds" and changes nothing.    |
| **Cloudflare**                      | **Authoritative DNS** for every hostname; DKIM/DMARC TXT records live here | `realtypandit2026@gmail.com`, account `26d6f34e1ee7ff658479684a799bb397`       | 🔴 **2FA is OFF.** Whoever holds this can redirect the site, admin, API and mail. Fix before sharing (§11). |
| **Meta Business Manager**           | WABA, Page, IG, Ad account, App, System Users, token minting               | Owner's Facebook; **2FA codes go to the owner's WhatsApp**                     | See §4.2 ids                                                                                                |
| **Google Cloud** (project Panditji) | Gemini key, Maps keys, OAuth client                                        | Owner's Google account                                                         | Deleted credentials are restorable for 30 days                                                              |
| **GlitchTip**                       | Error dashboard                                                            | `realtypandit2026@gmail.com`; direct Postgres access also documented in memory | Runbook: `docs/runbooks/glitchtip.md`                                                                       |
| **99acres / MagicBricks / Housing** | Lead feeds                                                                 | Owner's portal accounts                                                        | Contact at 99acres: account manager (escalation email 2026-08-03 in `docs/archive/`)                        |
| **Xiaomi Mi account**               | Bootloader unlock for the calling-project handset                          | Owner                                                                          | See §12                                                                                                     |

The `realtypandit2026@gmail.com` mailbox is the recovery identity for Cloudflare and GlitchTip —
**treat access to that inbox as equivalent to DNS control.**

---

## 6. Deploying and operating

### 6.1 The commands that actually work

```bash
# Backend: source is live under ts-node — no build
ssh realty-pandit "cd /var/www/realty-pandit/backend && pm2 reload realty-backend --update-env"

# If a stale Prisma client persists after a schema change (rare) — the ONLY safe restart-from-scratch:
ssh realty-pandit "cd /var/www/realty-pandit/backend && pm2 delete realty-backend; \
  pm2 start server-bootstrap.js --name realty-backend -i 2 --time && pm2 save"
# ⚠️ ecosystem.config.js is BROKEN in cluster mode — do not `pm2 start ecosystem.config.js`.

# Admin frontend
ssh realty-pandit "cd /var/www/realty-pandit/frontend && npm run build"   # tsc -b && vite build
# → nginx serves dist/ immediately. Bump the <!-- vYYYYMMDD --> comment in index.html or PWA users keep the old bundle.

# Public website (as realty!)
ssh realty-pandit "cd /var/www/realty-pandit/website && npm run build && \
  chown -R realty:realty .next && sudo -u realty -H pm2 restart realty-website"

# Health after any backend restart — app takes 25–40s to bind :7071, so wait before judging
curl -s -o /dev/null -w '%{http_code}\n' https://api.realtypandit.in/public/properties
```

The scripted path is `node agents/deployment/deploy-agent.js <backend|frontend|website|all>`
(`docs/runbooks/deploy.md`) — it expects the SSH key at `%LOCALAPPDATA%\Temp\rp_key` on Windows.
There is also an MCP tool `realty-pandit-qa deploy` used from Claude Code sessions.

### 6.2 Traps that have each caused a real incident

| Trap                                           | What happens                                                                                | Rule                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `cp .env.production .env`                      | Deletes 24 live secrets → 502                                                               | Never. Merge missing keys only.                                       |
| `pm2 delete` + `pm2 start ecosystem.config.js` | Cluster workers never bind → infinite restart                                               | Use the `server-bootstrap.js` command above                           |
| Editing `agents/backend/` on the server        | Nothing changes                                                                             | Live dir is `backend/`, not the mirror                                |
| Restarting the website from root PM2           | Orphan process holds :3000, "site not refreshing"                                           | `sudo -u realty -H pm2 …`                                             |
| `source .env`                                  | PEM breaks bash, later vars silently unset                                                  | `grep '^KEY=' .env`                                                   |
| `npx prisma generate` after a schema copy      | Chokes on em-dashes in comments                                                             | `sed -i 's/—/-/g; s/–/-/g' prisma/schema.prisma` first                |
| Frontend build "passes" but UI unchanged       | PWA service worker serving old bundle                                                       | Bump `index.html` stamp; users Ctrl+Shift+R twice                     |
| Rotating `JWT_SECRET`                          | Every stored Google token + SMTP password silently unreadable                               | Re-encrypt the data first (`secrets-recovery.md`)                     |
| Changing DNS in Hostinger                      | Looks fixed, never resolves                                                                 | Cloudflare only                                                       |
| A WhatsApp `sendText()` returns 200            | Does **not** mean delivered — the account was locked for 9 days while every log said "sent" | `grep WA-Delivery` in the logs first on any "bot not replying" report |
| Many quick SSH calls                           | Your IP is blackholed for 2 min                                                             | Batch into one connection (§2.2)                                      |

### 6.3 Database

```bash
# Read-only work: run a Node script ON the server using the live Prisma client
ssh realty-pandit 'cd /var/www/realty-pandit/backend && cat > rp_tmp.js <<"EOF"
const prisma = require("./dist/db").default;
(async () => { console.log(await prisma.contact.count()); await prisma.$disconnect(); })();
EOF
timeout 60 node rp_tmp.js; rm -f rp_tmp.js'

# BACKUP BEFORE ANY DATA CHANGE — the owner requires it. pg_dump rejects Prisma's ?params: strip them.
ssh realty-pandit 'cd /var/www/realty-pandit/backend && \
  DB=$(grep -E "^DATABASE_URL=" .env | head -1 | cut -d= -f2- | tr -d "\"'"'"'"); DB="${DB%%\?*}"; \
  pg_dump "$DB" | gzip > /root/backups/db-pre-<change>-$(date +%Y%m%d-%H%M%S).sql.gz && \
  ls -lh /root/backups/db-pre-<change>-*'
# ⚠️ pg_dump can silently write 0 bytes while the && chain still prints OK — ALWAYS ls -lh the dump.
```

- Migrations: `npx prisma migrate deploy` — prod history has **drifted** before (columns applied but not
  recorded → "column already exists"). Confirm via `information_schema`, then `prisma migrate resolve --applied`.
- `contacts.phone_number` is the **primary key with 23 cascading FKs**. Numbers are stored E.164 (`+91…`).
  Always normalise before lookup or you create duplicates.

### 6.4 Git — the source of truth is on the server, not GitHub

- **Bare remote:** `/root/realtypandit.git` on the VPS. Branch: `feature/contact-system-refactor`
  (plus `wt/backend`, `wt/frontend`, `wt/website`, `master`).
- **There is no checked-out worktree on the server.** Live dirs are edited in place; commits happen via
  a throwaway clone (`docs/runbooks/…`, memory `reference_git_commit_flow_agents_repo`).
- Tracked paths are prefixed `agents/` and mirror the live dirs.
- 🔴 **Most live files are CRLF; the repo is LF.** Copying a live file into the clone shows the whole file
  changed. Strip CR (`sed -i 's/\r$//'`) before `git add`, and eyeball `git diff --cached --stat`.
- **Drift is asymmetric:** code is written on the server first and pulled down; docs are written locally
  and pushed up. Never resolve it with `reset --hard` — you will lose one side.
- Local clone: `Project/clients/sunny-sharma/projects/reality-pandit/`; worktrees in `../rp-worktrees/`.

### 6.5 Monitoring

- **GlitchTip** `errors.realtypandit.in` — 4 services in 2 projects, filter by `service:` tag.
  A nightly digest is written to Claude memory. Alert source to watch for the ad pipeline:
  `ad_listing_link_broken`.
- **Logs:** `/var/www/realty-pandit/backend/logs/{combined,error}-YYYY-MM-DD.log` (winston).
  `[WA-Delivery]` lines are the WhatsApp delivery-status truth.
- **Cron:** `/etc/cron.d/realty-healthcheck`, `realty-backup`, `disk-alert`. Confirm where
  `realty-backup` writes — the newest full dump visible in `/root/backups` at handover is **2026-07-24**.
- Circuit breaker on WhatsApp: a 401 opens it for ~5 min; a backend restart resets it.

---

## 7. Where the knowledge lives

| Layer                                                              | Path                                                                                                                                                                                  | In git?          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Live status (wins conflicts)**                                   | `docs/PROJECT_STATUS.md`                                                                                                                                                              | ✅               |
| Runbooks                                                           | `docs/runbooks/` — start with `REMOTE-ACCESS.md`, `deploy.md`, `secrets-recovery.md`, `whatsapp-token-rotation.md`, `whatsapp-waba-restriction.md`, `glitchtip.md`, `meta-ctw-ads.md` | ✅               |
| Architecture                                                       | `docs/architecture/` — `system-overview.md`, `integrations.md`, `database-schema.md`, `whatsapp-voice-bot.md`                                                                         | ✅               |
| Decisions, plans, precautions, backlog                             | `docs/decisions/`, `docs/plans/`, `docs/precautions/`, `docs/backlog/PENDING.md`                                                                                                      | ✅               |
| Claude-side memory (~187 notes, includes credential-bearing files) | `~/.claude/projects/c--Users-Varchasv-Bhardwaj-Project-clients-sunny-sharma/memory/`                                                                                                  | ❌ machine-local |

The memory directory contains several files flagged 🔐 SENSITIVE with plaintext passwords
(`admin_credentials.md`, `reference_cloudflare_account_access.md`, `reference_glitchtip_db_access.md`).
**Do not copy that directory to the new developer as-is.** Rotate those credentials first (§11), then
share only the non-sensitive notes if useful.

---

## 8. Local development setup

```bash
git clone -b feature/contact-system-refactor realty-pandit:/root/realtypandit.git reality-pandit
cd reality-pandit/agents
(cd backend  && npm install && npx prisma generate)
(cd frontend && npm install)
(cd website  && npm install)
(cd call-gateway && npm install && node test/protocol.test.ts)   # 30 tests, Node ≥22 for type-stripping
```

Drop the local `.env` files (from §2.4) into `agents/backend/` and `agents/website/`.
Debug base URL in the Android app is the emulator loopback `10.0.2.2:3000`, unreachable from a real phone.

**Android:** JDK 17, Android SDK with `platforms/android-34` + `build-tools/34.0.0`, Gradle wrapper in
`agents/android/`. `./gradlew :app:compileDebugKotlin` is the compile check. Build stack is Kotlin
1.9.20 / AGP 8.1.4 / Compose compiler 1.5.4 / kapt — **these versions are locked to each other**;
bump one and the build breaks.

---

## 9. The people and the roles

|                             | Role in the system                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Sunny / Savikant Sharma** | Owner. `super_boss`. The WhatsApp/Meta 2FA and the WA token phone-verification go to him. Inventory manager on many listings. |
| **Puneet Bhardwaj**         | `super_boss` admin user; the account used for Playwright verification.                                                        |
| **Varchasv Bhardwaj**       | Outgoing/parallel engineer — holds the only authorized SSH key at handover.                                                   |
| Team members (~15)          | `employee`/`manager` roles; Google Calendar/Tasks connected per agent; routed portal leads.                                   |

Reassignment authority, deal permissions and the never-reassign rule are in `docs/architecture/` and the
memory notes `reference_reassign_authority`, `reference_deal_permissions`, `feedback_lead_assignment_dedup`.

---

## 10. What is live and in flight (September 2026)

- **Meta ads:** A/B for `RP-GZB-RES-20913` launched 2026-08-06 (`120253692368960547` CTW+prefill,
  `120253692400010547` lead form). Ledger: memory `reference_meta_ad_performance_log`.
  Rule learned: **don't read an A/B before 72–96h**; Meta undercounts CTW leads ~3.7× — count
  `contact.meta_campaign_id` in the DB instead.
- **Ad → lead capture chain:** the listing code (`RP-XXX-XXX-NNNNN`) in the **ad name and the CTW prefill
  text** is what routes a lead to the listing's inventory manager. Rename an ad in Ads Manager and routing
  breaks (loudly — GlitchTip `ad_listing_link_broken`). Memory: `reference_ad_lead_capture_chain`.
- **AI calling gateway (Option A):** see §12.
- **Open items:** 99acres `SubUserName` outage (their side); `info@realtypandit.in` inbound broken since
  April (mail lands nowhere readable); rDNS/PTR mismatch for the mail server (Hostinger hPanel);
  Barracuda blocklist delisting; 467 listings with staff-as-owner awaiting owner re-entry.

---

## 11. 🔴 Do these BEFORE the new developer gets any credential

These are ordered by blast radius. Each one is a real, currently-open exposure found during this
handover, not a hypothetical.

1. **Cloudflare — rotate the password and enable 2FA.** The password was pasted into a chat transcript
   on 2026-08-10 and 2FA is off. This account controls DNS for the site, admin, API and mail.
2. **Google OAuth client secret — put it in a password manager, then rotate.** It disappeared once with
   no copy anywhere; recovery took 9 days of broken Calendar sync for 15 people. Use _Add secret_
   (safe — refresh tokens bind to the client ID), confirm, then disable the old one.
3. **Rotate every plaintext credential sitting in the memory directory:** the admin CRM super_boss
   password, the GlitchTip Postgres password, the Cloudflare password. Then the memory files can be
   shared or discarded.
4. **`ufw`: replace `22/tcp ALLOW Anywhere`** with the specific IPs of the two engineers. Today the
   specific-IP rules are decorative.
5. **GlitchTip :8100 is bound on `0.0.0.0` via docker-proxy.** Docker bypasses ufw. Bind it to
   `127.0.0.1:8100` in its compose file so only nginx reaches it, or confirm it is genuinely unreachable.
6. **Re-issue `FB_ACCESS_TOKEN`** — its data-access window lapsed in July while `is_valid` stayed true.
   Set a 60-day reminder for `FB_PAGE_ACCESS_TOKEN` and `IG_ACCESS_TOKEN`; the IG one has already
   expired silently once.
7. **Confirm automated DB backups.** `/etc/cron.d/realty-backup` exists; the newest full dump visible in
   `/root/backups` is 24 July. Find where it writes, and test a restore once.
8. **Commit + push the local docs.** ~183 lines of `docs/` exist only on Varchasv's machine, uncommitted.
9. **Set the mail PTR record in Hostinger** and request Barracuda delisting — the two remaining
   deliverability warnings.

---

## 12. The calling project (in progress — hand over with care)

**Goal:** AI that makes and receives real cellular calls from the company's own SIMs, driven by the CRM,
replacing the Omnidim stub. Design chosen: **Option A — a rooted Android handset as a call server**,
bridged to the VPS. Full state: memory `project_ai_calling_android_gateway` and
`docs/plans/2026-08-06-ai-calling-android-gateway.md`.

| Piece                      | State                                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handset                    | Redmi 9 **`M2004J19C`** (`lancelot`, Helio G80, Android 10, MIUI 12). Bootloader still locked; `oem_unlock_allowed=1`. **Mi Unlock 7-day clock — confirm it was started.**                   |
| Phase 0 — call control     | ✅ Proven on the device with no root: dial, detect ring, caller-ID (E.164), answer, hang up                                                                                                  |
| VPS `agents/call-gateway`  | ✅ Built, 30/30 tests. Phone dials **out** over WSS (it's behind Jio CGNAT — never design "server → phone")                                                                                  |
| Staff app `agents/android` | 3 defects fixed + compile-verified 2026-08-06 (service never started; recorder deleted its own file; upload erased the local row). **The recording feature had never worked in production.** |
| Next (no root needed)      | Android WS client + telephony control → CRM `call_gateway.ts` → blocking compliance gate (`opted_out_at`, `ai_paused`, DND/NCPR, 09:00–21:00 IST)                                            |
| Blocked on root            | Downlink capture (expected to work), **uplink injection (the one unknown)**                                                                                                                  |

**Hard facts the next engineer must not relearn the expensive way:**

- Every audio layer on this handset is a **closed MediaTek blob** (`audio.primary.mt6768.so`,
  `android.hardware.audio@5.0-impl-mediatek.so`, `com.mediatek.ims`). LineageOS ships the same blobs.
  Uplink injection is a binary-RE problem, not a HAL patch. **Option B (Pi as Bluetooth HFP peer) is the
  documented fallback** — no root, no injection, same handset.
- **`OFFHOOK` on an outbound call means the far end started ringing, not that anyone answered.**
  Android has no `DIALING` state without an `InCallService`. Never report it as "answered".
- **Hang-up is not instant** — `ENDCALL` returned while still off-hook; `IDLE` arrived seconds later.
  A line is free only when the phone _reports_ idle.
- `TelecomManager.endCall()` is restricted to the default dialer from API 31+. Works on this phone; won't
  survive a newer one without taking the dialer role.
- Use a **spare SIM** for all testing. The company number is the asset the project exists to protect.
- **The WhatsApp voice bot (Panditji/Pipecat) is off-limits** — it works; the owner said not to touch it.

---

## 13. Checklists

### Varchasv — handover

- [ ] §11 items 1–3 (rotate before sharing anything)
- [ ] Receive the new developer's **public** key; append to `/root/.ssh/authorized_keys`
- [ ] Share console logins + local `.env`s via password manager — **not email**
- [ ] Add the new developer to Meta Business Manager, GCP project, Cloudflare (as a member, not by sharing the login)
- [ ] Commit + push the uncommitted local docs
- [ ] Walk through §3.2 (two PM2 daemons) and §6.2 live, once

### New developer — first week

- [ ] SSH works with **your own** key; `pm2 list` and `sudo -u realty -H pm2 list` both make sense to you
- [ ] Read `docs/PROJECT_STATUS.md`, then `REMOTE-ACCESS.md`, `deploy.md`, `secrets-recovery.md`
- [ ] Take a DB backup by hand and `ls -lh` it (§6.3) — before you change anything
- [ ] Make one trivial backend change, `pm2 reload`, confirm via the API — no deploy script
- [ ] Open GlitchTip; find the `service:` tag filter; find `[WA-Delivery]` in the logs
- [ ] Do **not** run `cp .env.production .env`, `pm2 start ecosystem.config.js`, or edit `agents/backend/` on the server
- [ ] Confirm the Mi Unlock clock status and the spare-SIM rule before touching the calling project
