# Enterprise Digital Forensic Audit — Part 1

**Target:** Realty Pandit (realtypandit.in) · **Date:** 2026-08-07
**Method:** direct read-only inspection of the **live production server** `72.62.231.224` over 3 consolidated SSH sessions, plus live HTTPS probes through the public edge.
**Evidence standard:** every statement below was observed on the running system. Nothing is inferred from the local clone, which is known to lag production.

> **Scope of Part 1:** Infrastructure · Runtime · Backend · API surface · Data layer · Security posture · DevOps.
> **Not yet covered** (Part 2): frontend component/bundle audit, UX/UI, SEO/GEO/AEO, accessibility, business-process reverse engineering, redevelopment blueprint.

---

## 1. Executive summary

The platform is **substantially more mature than a typical SMB build**: UFW default-deny, origin 443 restricted to Cloudflare ranges only, fail2ban with 4 jails, CSRF middleware, per-route-group rate limiting, Sentry/GlitchTip instrumentation, circuit breakers on the LLM, and a nightly database backup. Health endpoint reports DB 3 ms, Redis 2 ms.

The problems are **operational drift**, not architectural failure. Five items need attention, one of them promptly.

| # | Severity | Finding | Evidence |
|---|---|---|---|
| 1 | **HIGH** | Swagger UI publicly readable, unauthenticated | `GET https://api.realtypandit.in/api-docs/` → **200** |
| 2 | **HIGH** | Backend has no systemd auto-start; may not survive reboot | `systemctl is-enabled pm2-root` → **not-found** |
| 3 | **HIGH** | Nginx app logs never rotated — 1.2 GB and growing | no logrotate config references the log dir |
| 4 | MEDIUM | 28 abandoned `*_bak_*` tables in production | `pg_tables` enumeration |
| 5 | MEDIUM | Two redundant admin processes; nginx serves admin statically anyway | `ss`, `ps`, nginx `root` directive |
| 6 | MEDIUM | `uploads/` at 5.5 GB, of which `pending/` is 748 MB | `du -sh` |
| 7 | MEDIUM | App dirs owned by a non-existent UID (Windows artifact) | `stat` → `197609:197121`, absent from passwd |
| 8 | LOW | Duplicated & conflicting security headers | two `X-Frame-Options`: `DENY` **and** `SAMEORIGIN` |

---

## 2. Infrastructure (verified)

| | |
|---|---|
| Host | `srv1344620`, Ubuntu 24.04.4 LTS, kernel 6.8.0-110 |
| Resources | 2 cores · 7.8 GB RAM (3.9 GB used) · 96 GB disk, 32% used |
| Uptime | 98 days |
| Edge | **Cloudflare** (`server: cloudflare`, `cf-cache-status: DYNAMIC`) |
| Runtime | Node **v20.20.0**, npm 10.8.2 |
| TLS | Let's Encrypt. `realtypandit.in` cert covers www + **api + admin** as SANs, expires 14 Sep 2026; `errors.` separate, 12 Sep 2026 |

**Firewall — genuinely well configured.** `iptables -P INPUT DROP`; UFW default deny incoming. Inbound allowed: 22 (plus two pinned dev IPs and a /24), **80/tcp anywhere**, **443/tcp only from 10 Cloudflare ranges**, and UDP 1024–65535 (WebRTC/voice).

*Consequence:* port **40681 is not reachable externally** — no explicit rule, so default-deny applies. The stray service on it (§5) is an ops problem, not a breach.

*Gap:* **80/tcp is open to the world**, so the origin IP is directly reachable over HTTP, bypassing Cloudflare.

### Process topology

| Manager | Process | Port | cwd | Restarts |
|---|---|---|---|---|
| root PM2 | `realty-backend` ×2 (**cluster**) | 7071 | `/var/www/realty-pandit/backend` | 69 |
| root PM2 | `panditji-voice` | 8765 | `agents/pipecat` | 9 |
| root PM2 | `realty-admin` → `node /usr/bin/serve` | **40681** | **`/root`** | **143** |
| realty PM2 | `realty-website` (Next.js 16.1.6) | 3000 | `website` | 2 |
| realty PM2 | `realty-admin` → `vite preview` | 5173 | `frontend` | 0 |

Also running: PostgreSQL 16.14, Redis 7, Postfix (25/587), Dovecot (110/143/993/995), and **4 Docker containers** for self-hosted GlitchTip (web, worker, postgres, redis) proxied at 8100.

---

## 3. Backend architecture (verified)

**Express 5.2.1 + TypeScript + Prisma 5.22 + PostgreSQL 16 + BullMQ/Redis.** Monolith, cluster mode ×2.

- **332 TypeScript source files**, 496 compiled JS in `dist/`
- Largest areas: `services/` **110 files**, `utils/` 44, `routes/` 37, `workflows/` 21, `scripts/` 21, `__tests__/` 47
- 37 dependencies. Notable: `helmet`, `express-rate-limit`, `zod`, `bcryptjs`, `googleapis`, `@google/generative-ai`, `@sentry/node`, `winston`, `nodemailer`, `multer`
- **58 environment variables** in the production `.env` (names only recorded; no values read)

⚠️ **`package.json` has no `build` script** — only `test`, `test:watch`, `test:coverage`, `start`, `dev`. Compilation to `dist/` therefore happens outside the documented workflow, which is a reproducibility risk for any rebuild.

### API surface — 466 endpoints across 37 route files

Largest routers: `inventory` 36 · `public` 32 · `agent` 32 · `api` 28 · `team` 27 · `deals` 26 · `leads` 23 · `reports` 22 · `builder` 21 · `internal_tools` 20.

Mount groups, each with its own rate limiter: `/auth`, `/user`, `/webhooks` (+ `/internal/tools`, `/omnidim`, `/facebook`), `/public` (+ `/auth`, `/master`, `/taxonomy`), `/api/*` (~20 sub-routers), `/agent`, `/builder`, `/external` (+ `/99acres`, `/magicbricks`, `/housing`), `/inventory`.

**Rate limits:** strictest 5/min and 5/hour (auth), then tiers of 100/200/300/500 per 15 min.

### Authentication — four separate JWT realms

`JWT_SECRET` (41 refs) · `AGENT_JWT_SECRET` (14) · `USER_JWT_SECRET` (4) · `BUILDER_JWT_SECRET` (2). Signing in 6 files, verification in 10.

⚠️ Per project memory, `JWT_SECRET` **also doubles as the AES encryption key**. Reusing one secret for both token signing and data encryption is a crypto-hygiene weakness: rotating it to fix a token leak would simultaneously render encrypted data unreadable.

### AI / LLM

Google Gemini only — `gemini-2.5-flash` (×3 call sites) and `gemini-2.5-pro` (×1), used in `services/llm.ts`, `services/transcription.ts`, `services/image_moderation.ts`. A **circuit breaker** wraps Gemini (health endpoint shows `state: CLOSED`, 48 successes) — a genuinely good resilience pattern. No vector DB, no RAG, no embeddings store observed.

### Scheduling

BullMQ (`src/queues/`, `src/workers/call_processor.ts`), plus `src/cron/{ai_boss_jobs,qa_daily_jobs}.ts` and `src/jobs/cleanup_uploads.ts`. ~16 distinct daily cron patterns. **Server TZ is IST**, so these fire at the Indian hour, not UTC.

OS-level `/etc/cron.d`: `realty-backup`, `realty-healthcheck`, `certbot`, `disk-alert`, `docker-image-prune`. Root crontab is empty.

---

## 4. Data layer (verified)

**PostgreSQL 16.14**, database `reality_pandit`, **99 MB**, **96 tables**.
**Prisma: 66 models, 25 enums, 166 `@@index`, 8 `@@unique`, 24 `onDelete`, 45 migrations.**

Largest tables by row count:

| Table | Rows | Size |
|---|---|---|
| `interactions` | 33,689 | 20 MB |
| `notifications` | 26,081 | 22 MB |
| `tasks` | 8,743 | 7.3 MB |
| `contacts` | 5,733 | 5.2 MB |
| `transactions` | 5,352 | 5.1 MB |
| `inventory` | 845 | 2.4 MB |
| `leads` | 910 | 648 kB |

**Observations**

- Only **8 `@@unique` constraints across 66 models** — low for a CRM whose integrity depends on phone-number identity. Uniqueness is largely enforced in application code, so any write path that bypasses it can create duplicates.
- Only **24 `onDelete`** rules for 66 models — most relations have no explicit delete behaviour declared.
- **28 abandoned snapshot tables** remain in production, dated May–July 2026 — e.g. `contacts_bak_demand_p0_20260529063734`, `inventory_bak_pricefix_20260621`, `node_fields_bak_dedup_20260526_163701`, `agents_gtoken_bak_20260722`. These explain most of the 96-vs-66 gap. They are small but they clutter the schema and several contain **copies of contact PII** with no retention policy.

**Backups:** nightly `pg_dump` at 02:00 → gzip → `/var/backups/realty-pandit/`, 7-day retention. Working, but **database-only, 7 days, and no offsite replication observed** — uploads (5.5 GB of client media) are not in this job.

---

## 5. Detailed findings

### 🔴 F1 — Swagger UI is public and unauthenticated (HIGH)

`app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, …))` at `src/app.ts:153`, with **no auth guard**, mounted long before the JWT-protected `/api` at line 360.

Verified live: `https://api.realtypandit.in/api-docs/` → **200**.

This publishes the full shape of a 466-endpoint CRM — routes, parameters, schemas, auth scheme — to anyone. For a system holding 5,733 contacts and 33,689 interactions, that is free reconnaissance. The API landing page at `/` was deliberately hardened with `noindex, nofollow` and a lock screen, which shows the intent was to keep this surface private; `/api-docs` simply escaped that intent.

**Fix:** gate behind `requireSuperBoss`, or disable when `NODE_ENV=production`.

### 🔴 F2 — Backend has no systemd auto-start (HIGH — availability)

`systemctl is-enabled pm2-realty` → **enabled**. `systemctl is-enabled pm2-root` → **not-found**; no `pm2-root` unit exists, though `/root/.pm2/dump.pm2` is present.

`realty-backend` (both cluster instances), `panditji-voice`, and `pm2-logrotate` all run under **root's** PM2. With no systemd unit, there is no evidence they would return after a reboot — the website (under `realty`) would come back and the **API would not**.

Uptime is 98 days, so this has never been tested. It is a latent single point of failure that will surface at the worst possible moment.

**Fix:** `pm2 startup systemd -u root --hp /root` then `pm2 save`. Verify with a scheduled reboot.

### 🔴 F3 — Nginx application logs are never rotated (HIGH — disk exhaustion)

Confirmed: **no file in `/etc/logrotate.d/` references `/var/www/realty-pandit/logs`.** The stock `nginx` logrotate config only covers `/var/log/nginx`.

| Log | Size |
|---|---|
| `admin-access.log` | **719 MB** |
| `api-access.log` | 272 MB |
| `website-access.log` | 192 MB |
| `backend/logs/combined-2026-04-11.log` | 64 MB |

1.2 GB and growing without bound on a 96 GB disk (currently 32% used). There is a `disk-alert` cron, so this will be noticed — but only once it is already a problem.

**Fix:** add a logrotate stanza (daily, rotate 14, compress, `postrotate: nginx -s reopen`).

### 🟠 F4 — Two redundant admin servers; nginx doesn't use either (MEDIUM)

The nginx `admin.realtypandit.in` vhost serves the SPA **statically**: `root /var/www/realty-pandit/frontend/dist;`, proxying only `/api/`, `/public/`, `/auth/`, `/uploads/` to 7071. **It never proxies to 5173 or 40681.**

Yet two Node processes serve that same build:
- root PM2 → `node /usr/bin/serve`, cwd `/root`, port 40681, **143 restarts** (confirmed serving the admin `index.html`)
- realty PM2 → `vite preview --host`, port 5173, 0 restarts

Both appear **vestigial**. They consume RAM on a 2-core/7.8 GB box, and the 143 restarts indicate one has been failing repeatedly for a long time. Separately, `vite preview` is a development preview server and is explicitly not intended for production.

**Fix:** confirm no internal consumer depends on 5173/40681, then remove both from PM2 and `pm2 save`.

### 🟠 F5 — `uploads/` is 5.5 GB, with 748 MB stuck in `pending/` (MEDIUM)

5,044 files, 5.5 GB total — the real driver of the backend directory's 6.4 GB. `uploads/pending/` alone holds **748 MB**.

Project memory records a resolved 2026-05-24 incident where workflow uploads landed in transient `/uploads/pending/`, were never promoted, and were deleted by cleanup — causing 404s on 82% of listings, fixed via `utils/media_promote.ts`. **748 MB still sitting in `pending/` suggests either the promotion path is leaking again or the historical backlog was never swept.** This warrants investigation before it becomes another media-loss incident.

Directory listing is correctly disabled (`/uploads/` → 404).

### 🟠 F6 — Application directories owned by a non-existent user (MEDIUM)

```
197609:197121   /var/www/realty-pandit/backend
197609:197121   /var/www/realty-pandit/frontend
197609:197121   /var/www/realty-pandit/website
realty:realty   /var/www/realty-pandit/agents
```

`getent passwd 197609` → **no such user**. These are Windows UID/GIDs preserved by an scp/rsync from the dev machine.

The `realty` user runs `realty-website` and `realty-admin` under `pm2-realty.service` but **does not own the directories those apps run from**. This is the mechanical root of the recurring deploy friction already documented in memory (`chown -R realty:realty …/website/.next` needed after deploys).

**Fix:** `chown -R realty:realty` the three app dirs, and add `-o`/`--no-o` handling to the deploy script so it stops re-importing Windows ownership.

### 🟡 F7 — Duplicated and conflicting security headers (LOW)

The live response carries **two of each** major header, set independently by Next.js and by nginx/Cloudflare:

- `strict-transport-security`: `max-age=63072000; includeSubDomains; preload` **and** `max-age=31536000; includeSubDomains`
- `x-frame-options`: **`DENY`** and **`SAMEORIGIN`** ← contradictory
- `permissions-policy`: `geolocation=(self)` and `geolocation=()` ← contradictory
- `x-content-type-options`, `referrer-policy` duplicated (consistent values)

Browser behaviour with contradictory `X-Frame-Options` is not well defined across engines. `geolocation` is being both granted and denied, which will break the map/locality features if the deny wins.

Also `x-powered-by: Next.js` discloses the framework, and CSP includes `'unsafe-inline'` in `script-src` (both at the edge and in the backend's helmet config), which materially weakens XSS defence.

**Fix:** set each header in exactly one layer — prefer nginx/edge — and remove the duplicates.

### 🟡 F8 — CORS whitelist includes plaintext and raw-IP origins (LOW)

The fallback whitelist admits `http://` variants of every production host, plus `http://72.62.231.224:5173` and `http://72.62.231.224:3000`, plus four `localhost` ports — with `credentials: true`. `ALLOWED_ORIGINS` is set in the environment and presumably overrides this, but the insecure defaults remain in code as a footgun for any environment where that variable is missing.

---

## 6. What is genuinely well built

Worth stating plainly, because an audit that only lists faults is misleading:

- **Firewall posture is better than most production estates** — default-deny, 443 restricted to Cloudflare ranges, SSH pinned to specific IPs, fail2ban with 4 jails, 148 iptables rules.
- **Differentiated rate limiting** per route group rather than one blanket limit.
- **CSRF double-submit** middleware, `helmet`, `trust proxy` correctly scoped to `loopback` (the fix for the historical restart storm).
- **Circuit breaker on the LLM** with live success/failure counters exposed on `/health`.
- **Dual observability** — Sentry plus self-hosted GlitchTip in Docker.
- **166 database indexes** — someone has thought about query performance.
- **47 test files** in a codebase of this age.
- Health endpoint returns real dependency latencies, not a static `{ok:true}`.

---

## 7. Recommended remediation order

| Priority | Action | Effort | Risk if deferred |
|---|---|---|---|
| 1 | Gate or disable `/api-docs` in production | 15 min | Full API surface public |
| 2 | Register root PM2 with systemd; test a reboot | 30 min | API does not return after reboot |
| 3 | Add logrotate for `/var/www/realty-pandit/logs` | 20 min | Disk exhaustion |
| 4 | Investigate 748 MB `uploads/pending` backlog | 1–2 h | Repeat of the media-loss incident |
| 5 | Remove the two vestigial admin processes | 30 min | Wasted RAM; 143-restart noise masks real alerts |
| 6 | `chown` app dirs to `realty`; fix deploy script | 30 min | Ongoing deploy failures |
| 7 | Drop the 28 `*_bak_*` tables (after one final dump) | 1 h | PII with no retention policy |
| 8 | De-duplicate security headers | 1 h | Contradictory framing/geolocation policy |
| 9 | Extend backups: include uploads, lengthen retention, add offsite | 2–4 h | 5.5 GB of client media unprotected |

---

## 8. Method note & limitations

All findings were read from the running production host. No writes, no configuration changes, no service restarts were performed. Secret **values** were never read or printed — only environment variable **names**.

**Not yet audited** (Part 2): frontend component architecture and bundle analysis, rendering strategy, state management, accessibility, Core Web Vitals, SEO/GEO/AEO, business-process reverse engineering, and the redevelopment blueprint. Those require browser-level work against the live site plus a frontend source pass, and are the natural next phase.
