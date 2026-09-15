# Audit Remediation Plan — 2026-08-07

## ✅ EXECUTION LOG — Tier 1 + 2 + step 7 DONE (2026-08-07)

Owner approved with "start fixing". Tier 3 (CSP + og:image) **deliberately not started** — needs a
website rebuild.

| Step | Result |
|---|---|
| 0 Pre-flight backups | ✅ `/root/backups/remediation-20260807/` (9 files incl. both nginx vhosts, next.config.ts, layout.tsx, app.ts, dump.pm2, both pm2 state dumps) |
| 1 Logrotate | ✅ Config added, **first rotation forced**: `admin-access.log` 719 MB → `.1`, new file 0 B, nginx confirmed still writing. Now daily/rotate 14/compress. |
| 2a Stray root `realty-admin` | ✅ Deleted (`serve` on :40681, cwd `/root`, **143 restarts**). Verified first that nginx references neither 40681 nor 5173 and serves admin statically from `frontend/dist`. Admin stayed **200** across 3 post-delete checks. ~200 MB RAM freed. |
| 2b PM2 persistence | ✅ `pm2 save` (dump refreshed 2026-07-13 → 2026-08-07) then `pm2 startup systemd`. **`pm2-root.service` now exists and is `enabled`.** ⚠️ Not yet proven by an actual reboot. |
| 3 Duplicate headers | ✅ **Conflicts resolved** — see the correction note below. |
| 7 `/api-docs` | ✅ Blocked at nginx (`location = /api-docs`/`^~ /api-docs/` → 404). **Verified 404**; `/health` and `/public/properties` still 200. |

**Regression sweep after all changes — all green:**
website 200 · /properties 200 · admin 200 · api /health 200 · /public/properties 200 ·
/api-docs **404** · errors.realtypandit.in 200 · nginx/postgres/redis all active · all 5 PM2
processes online.

### ⚠️ Correction to step 3 — the plan's diagnosis was incomplete

The plan assumed the duplicate headers came from `sites-enabled/realtypandit.in` alone. Removing those
six lines did **not** reduce the count, because nginx inherits http-level `add_header` **only when a
level defines none of its own**. Stripping the vhost's headers *activated* the previously-shadowed
global **`/etc/nginx/conf.d/security-headers.conf`**.

A three-layer test (Next origin → local nginx → Cloudflare) gave 5 → 10 → 10, proving nginx was
doubling and Cloudflare added nothing.

The functionally important conflict was **Permissions-Policy**: browsers apply the **intersection** of
multiple copies, so the global `geolocation=()` was overriding Next's `geolocation=(self)` and
**denying geolocation site-wide** — including the admin panel's Google Maps, whose vhost sets no
Permissions-Policy and therefore inherits the global file.

Fix applied: aligned `conf.d/security-headers.conf` to `geolocation=(self)` and HSTS `63072000` so
every duplicate is now an **identical pair with no conflict**. Deleting the global file was rejected —
`errors.realtypandit.in` has no headers of its own and would have been left unprotected.

Full lesson recorded in memory as `precaution_nginx_add_header_inheritance.md`.

### Follow-ups created by this session

1. **Reboot test still required** — an untested availability fix is not a fix.
2. Website still returns two identical copies of each header; clean end-state is one owning layer per vhost. Cosmetic.
3. ⚠️ `admin.realtypandit.in` returned **no** `X-Frame-Options`/`Permissions-Policy` at `/` despite its vhost declaring them at lines 75–78 — possibly scoped inside a non-matching `location`. Unverified.
4. The `realty` user's `realty-admin` (`vite preview`, :5173) is **also** unreferenced by nginx — likely vestigial too, but left running deliberately since the plan scoped 2a to the root process only.

---

## ✅ TIER 3 ALSO DONE (2026-08-07, later)

Owner approved with "check and proceed". Deployed after **four failed build attempts** whose root
cause turned out to be self-inflicted — see below.

| Item | Result |
|---|---|
| CSP `connect-src` + `errors.realtypandit.in` | ✅ **GlitchTip now connects** — the browser block is gone (F9 closed) |
| CSP `worker-src 'self' blob:` | ✅ blob-worker block gone (F11) |
| CSP `script-src` + `static.cloudflareinsights.com` | ✅ CF Insights no longer blocked (F12) |
| CSP dead `report-uri /csp-report` removed | ✅ the 404s per page-load are gone (F10) |
| CSP `connect-src` + `www.google.com` | ✅ added — GA4's `/g/collect` signals endpoint was blocked (found during verification, not in the original plan) |
| `og:image` | ✅ live with `og:image:width/height/alt` + `twitter:image` (F14) |
| **`bg-[url('/grid.svg')]` in 8 files** | ✅ fixed — **this had been silently blocking every website rebuild** |

Final build: `BUILD_ID 7M8eDW2vW1xivJNluYWg7 → jzz8aTEg8cjcWJ9Brmu13 → 8HUIM60d759TyYC8m7G2V`,
compiled in ~12 s. Verified 200: `/`, `/properties`, `/services`, `/faq`, `/blog`, `/tools`,
`/about`, `/contact`, `/compare`; admin 200; api 200; `/api-docs` 404; glitchtip 200.
Browser console errors **6 → 4**.

### The real blocker — and it was mine

The website could not be rebuilt *at all* before today. Two independent causes:

1. `bg-[url('/grid.svg')]` — Tailwind v4 + Turbopack HTML-escape the inner quotes to `&#x27;`, so the
   module can't resolve. Pre-existing, in 8 files.
2. 🔴 **`.next.rollback` — the backup I created inside `website/`.** Tailwind v4 scans project files
   for class names and only skips what `.gitignore` lists; the repo ignores `/.next/` but **not**
   `.next.rollback`. So 42 MB of old compiled chunks kept re-supplying the deleted class, and the
   build failed even with the source already fixed.

Diagnosis was by elimination: an isolated copy with the fix built fine; production with the same fix
failed; moving the backup out of the directory made it build immediately. Clearing `.next/cache` did
**not** help.

**Rule going forward: build backups live in `/root/backups/`, never inside the project.**
Full lesson: `precaution_website_build_tailwind_scan.md`.

### Remaining console errors (not regressions, not claimed fixed)

- `www.google.com/g/collect` — server CSP is correct (verified); the browser is replaying a
  service-worker-cached document. Resolves on SW swap, per `feedback_website_sw_stale_chunk`.
- **React #418 hydration mismatch** — pre-existing, still open (audit Part 2 F13).
- `/user/me` 401 on anonymous loads — pre-existing (Part 2 F19).

### `og:image` caveat

Wired to `/logo.png` (1280×720 — dimensionally valid, above the 600×315 minimum). A purpose-designed
1200×630 asset would be better; that is a design task, not an engineering one.

---

**Original plan below.**
Source findings: `docs/investigations/2026-08-07-enterprise-forensic-audit-part{1,2,3}.md`

All edits are made **on production** (`/var/www/realty-pandit/…`), because prod is the source of truth
for code and the local clone lags it — see `precaution_local_repo_behind_prod.md` and
`feedback_prod_backend_paths.md`. Changes must be copied back to the repo afterwards, never the
reverse.

---

## ⚠️ Read this before doing anything

**`pm2 save` must not be run until the stray admin process is dealt with.**

Root PM2 currently runs `realty-admin` → `node /usr/bin/serve` (cwd `/root`, port 40681, **143
restarts**). Nginx serves the admin SPA *statically* from `frontend/dist` and never proxies to 40681
or 5173, so this process appears to serve nothing.

If `pm2 save` runs first, that stray is written into `dump.pm2` and becomes **permanent** across
reboots. Decide step 2a before step 2b.

Also note `/root/.pm2/dump.pm2` is dated **2026-07-13** — 3.5 weeks stale. Enabling startup without a
fresh `pm2 save` would resurrect the July-13 process list, not today's.

---

## Pre-flight (always)

```bash
ssh realty-pandit
mkdir -p /root/backups/remediation-20260807
cd /root/backups/remediation-20260807
cp /etc/nginx/sites-enabled/realtypandit.in            nginx-realtypandit.in.bak
cp /var/www/realty-pandit/website/next.config.ts        next.config.ts.bak
cp /var/www/realty-pandit/website/src/app/layout.tsx    layout.tsx.bak
cp /var/www/realty-pandit/backend/src/app.ts            app.ts.bak
cp /root/.pm2/dump.pm2                                  dump.pm2.bak 2>/dev/null
pm2 jlist > pm2-root-state.json
su - realty -c "pm2 jlist" > pm2-realty-state.json
ls -la
```

Rollback for every step below = copy the `.bak` back and re-run that step's reload command.

---

# TIER 1 — no risk to running services

## 1. Logrotate for application logs

**Fixes:** Part 1 F3. `admin-access.log` is 719 MB; total 1.2 GB, unbounded.

**Pre-check ownership first** (do not assume `root root`):

```bash
stat -c '%U:%G %n' /var/www/realty-pandit/logs/*.log | head
ps -o user= -C nginx | sort -u
```

Then create `/etc/logrotate.d/realty-pandit`, substituting the real owner into `su`:

```
/var/www/realty-pandit/logs/*.log {
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    su <OWNER> <GROUP>
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 $(cat /var/run/nginx.pid)
    endscript
}
```

**Verify (dry run — changes nothing):**
```bash
logrotate -d /etc/logrotate.d/realty-pandit
```

**Then force one rotation and confirm nginx keeps writing:**
```bash
logrotate -f /etc/logrotate.d/realty-pandit
ls -lh /var/www/realty-pandit/logs/ | head
curl -sI https://www.realtypandit.in/ -o /dev/null -w '%{http_code}\n'
ls -lh /var/www/realty-pandit/logs/admin-access.log   # should be small and growing again
```

⚠️ The first compression of 719 MB will use noticeable CPU on a 2-core box. Run it off-peak.

**Rollback:** `rm /etc/logrotate.d/realty-pandit` (rotated files stay; nothing is lost).

---

## 2. PM2 persistence — the reboot risk

**Fixes:** Part 1 F2. `realty-backend` (both cluster instances) has no systemd unit.

### 2a. Decide the stray first

```bash
# Confirm nothing depends on it
grep -rn "40681\|:5173" /etc/nginx/sites-enabled/
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:40681/
```

Nginx serves admin from `root /var/www/realty-pandit/frontend/dist` — confirmed in Part 1. If nothing
references 40681:

```bash
pm2 delete realty-admin      # the ROOT one only; leave the realty user's alone
pm2 list
curl -sI https://admin.realtypandit.in/ -o /dev/null -w 'admin still up: %{http_code}\n'
```

**Rollback:** `pm2 start /usr/bin/serve --name realty-admin` (or restore from `pm2-root-state.json`).

### 2b. Persist the corrected state

```bash
pm2 save                                  # AFTER 2a, so the stray isn't baked in
pm2 startup systemd -u root --hp /root    # prints a command — run exactly what it prints
systemctl is-enabled pm2-root             # expect: enabled
systemctl status pm2-root --no-pager | head -5
```

**Verify properly — this is the whole point:**
The only real test is a reboot. Schedule one in a maintenance window:
```bash
reboot
# then, from the workstation, after ~90s:
curl -s https://api.realtypandit.in/health
curl -sI https://www.realtypandit.in/ -o /dev/null -w '%{http_code}\n'
curl -sI https://admin.realtypandit.in/ -o /dev/null -w '%{http_code}\n'
```

⚠️ Do **not** mark this fix done without the reboot test. An untested availability fix is not a fix.

**Rollback:** `pm2 unstartup systemd`, then `cp dump.pm2.bak /root/.pm2/dump.pm2`.

---

# TIER 2 — validated before reload

## 3. Remove duplicate / conflicting security headers

**Fixes:** Part 2 F7. Both layers set overlapping headers with contradictory values.

| Header | `next.config.ts` | nginx (lines 12–17) | Keep |
|---|---|---|---|
| X-Frame-Options | `DENY` | `SAMEORIGIN` | **DENY** (stricter) |
| Strict-Transport-Security | `63072000; preload` | `31536000` | **preload version** |
| Permissions-Policy | `geolocation=(self)` | `geolocation=()` | **`(self)`** — the site needs Maps |
| X-Content-Type-Options | nosniff | nosniff | either (identical) |
| Referrer-Policy | strict-origin-when-cross-origin | same | either (identical) |
| X-XSS-Protection | — | `1; mode=block` | drop (deprecated, can introduce bugs) |

The nginx `geolocation=()` is actively fighting the map/locality feature. `next.config.ts` has the
better set, so **nginx is the layer to strip.**

Delete lines 12–17 of `/etc/nginx/sites-enabled/realtypandit.in` (the six `add_header` directives).
Leave the `Cache-Control` headers at lines 46 and 52 — those are correct and unrelated.

```bash
nginx -t                    # MUST pass before reloading
systemctl reload nginx      # graceful; no dropped connections
```

**Verify — expect exactly one of each now:**
```bash
curl -sI https://www.realtypandit.in/ | grep -icE '^x-frame-options'          # expect 1
curl -sI https://www.realtypandit.in/ | grep -iE 'x-frame|strict-transport|permissions-policy'
```

**Rollback:** `cp nginx-realtypandit.in.bak /etc/nginx/sites-enabled/realtypandit.in && nginx -t && systemctl reload nginx`

---

# TIER 3 — requires a rebuild (highest risk)

> Memory records that a masked frontend build failure caused a **25-minute outage** on 2026-05-24, and
> that the website restart must run as the **`realty`** user or the deploy falsely reports failure.
> Both traps apply here.

## 4. CSP cluster — restores frontend error visibility

**Fixes:** Part 2 F9, F10, F11, F12.

In `/var/www/realty-pandit/website/next.config.ts`, replace the CSP value on **line 7**:

Four changes:
1. `script-src` **+** `https://static.cloudflareinsights.com`
2. `connect-src` **+** `https://errors.realtypandit.in` **+** `https://cloudflareinsights.com`
   *(the RUM beacon POSTs to `cloudflareinsights.com/cdn-cgi/rum`, not the `static.` host)*
3. **add** `worker-src 'self' blob:;`
4. **remove** `report-uri /csp-report` — the endpoint does not exist (verified), so it only produces 404s

Resulting value:

```
default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://maps.googleapis.com https://maps.gstatic.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https: http:; connect-src 'self' https://api.realtypandit.in https://errors.realtypandit.in https://www.google-analytics.com https://analytics.google.com https://maps.googleapis.com https://www.googletagmanager.com https://cloudflareinsights.com; worker-src 'self' blob:; frame-ancestors 'none'
```

*(Alternative to removing `report-uri`: create `src/app/csp-report/route.ts` returning 204 and keep
it. That preserves violation reporting and is the better long-term answer, but it is a code addition
rather than a config edit — propose separately.)*

## 5. `og:image`

**Fixes:** Part 2 F14. Every social share currently renders imageless.

⚠️ **There is no suitable asset.** `public/` holds `logo.png` (61 KB) and two ~3 KB screenshots. A
1200×630 image needs to be designed. Two options:

- **Interim:** point at `/logo.png` so shares stop being blank — better than nothing, looks weak in a
  `summary_large_image` card.
- **Proper:** design a 1200×630 `og-image.png`, drop it in `public/`, then wire it.

In `src/app/layout.tsx`, add to the `openGraph` block:

```ts
images: [{
  url: 'https://www.realtypandit.in/og-image.png',
  width: 1200, height: 630,
  alt: 'Realty Pandit — AI-powered property search',
}],
```

and to the `twitter` block:

```ts
images: ['https://www.realtypandit.in/og-image.png'],
```

## 6. Build & deploy (steps 4–5 share this)

```bash
cd /var/www/realty-pandit/website
npm run build            # MUST succeed. Read the output. Do not proceed on failure.
ls -la .next/BUILD_ID    # confirm a fresh build exists
chown -R realty:realty .next
su - realty -c "pm2 restart realty-website"     # as realty, NOT root
```

**Verify:**
```bash
curl -sI https://www.realtypandit.in/ -o /dev/null -w '%{http_code}\n'    # expect 200
curl -sI https://www.realtypandit.in/ | grep -i content-security-policy   # new value present
```
Then load the homepage in a browser and confirm the console is clean — specifically that the
`errors.realtypandit.in` blocked-connection error is gone, and that a test error reaches GlitchTip.

**Rollback:** `cp next.config.ts.bak layout.tsx.bak` back, rebuild, restart as `realty`.

---

## 7. `/api-docs` — BLOCKED, do not attempt yet

**Fixes:** Part 1 F1 (the highest-severity finding).

The change itself is trivial — wrap `app.ts:153` in `if (process.env.NODE_ENV !== 'production')`.

**But the backend `package.json` has no `build` script** — only `test`, `start`, `dev`. How `dist/`
(496 compiled JS files) is produced is undocumented, and `dist/` is what PM2 runs. Guessing at a
`tsc` invocation on production risks producing a broken or partial build of the live API.

**Resolve this first**, by one of:
- finding the real build command (deploy scripts, CI, or shell history), or
- applying the guard directly to the compiled `dist/app.js` as a surgical stopgap, or
- blocking `/api-docs` at nginx instead — **no rebuild required, and it is reversible in seconds:**

```nginx
# in sites-enabled/api.realtypandit.in
location /api-docs { return 404; }
```

**The nginx option is the recommended immediate action** — it closes the exposure today with zero
build risk, and the proper code fix can follow once the build path is known.

---

## Execution order

| # | Step | Risk | Time | Needs downtime |
|---|---|---|---|---|
| 0 | Pre-flight backups | none | 5 min | no |
| 1 | Logrotate | none | 15 min | no |
| 2a | Remove stray root `realty-admin` | low | 10 min | no |
| 2b | `pm2 save` + startup | low | 10 min | reboot to verify |
| 3 | Strip duplicate nginx headers | low | 15 min | no |
| 7 | Block `/api-docs` at nginx | low | 10 min | no |
| 4+5+6 | CSP + og:image + rebuild | **medium** | 45 min | brief restart |

Steps 0–3 and 7 are safe to run in a single session. Steps 4–6 should be done in a window where a
rollback is acceptable, and never at the same time as anything else.

---

## Deliberately excluded

- **Gemini API key rotation** — breaks prod AI chat until the server `.env` is updated. Owner decision.
- **Dropping the 28 `*_bak_*` tables** — needs a final `pg_dump` and owner sign-off; several contain contact PII.
- **`uploads/pending` 748 MB backlog** — needs investigation before deletion; memory records a prior incident where cleanup destroyed unpromoted media.
- **`chown` of the app directories** — the `realty` user does not own `backend`/`frontend`/`website`. Correct, but touches every file of a running service; deserves its own window.
- **Hydration error, code-splitting, React Query, metadata/ISR** — development work, not remediation.
