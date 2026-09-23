# Session handover — 2026-09-22

> **Purpose:** hand over the production-deployment work started this session.
> **Scope:** repository cleanup, audit-work commit, SSH access restoration, and a full
> read-only reconnaissance of the live VPS.
> **Status:** production is healthy and untouched. **No deployment was performed.**
> **Bottom line:** a deploy is **not** safe yet — production runs ~6 features that exist
> nowhere in Git. See §4.

---

## 1. What was done this session

### 1.1 Repository cleanup — committed

Tracked files reduced **3,039 → 2,270** (769 files, ~50 MB). No deployed source touched.

| Removed | Reason |
|---|---|
| `agents/browser-qa/node_modules/` (546 files, 12.4 MB) | Dependencies were committed; `.gitignore` only covered backend/frontend/website |
| `agents/browser-qa/screenshots/` (209 files, 37.2 MB) | Generated QA artefacts |
| 4 `.zip` archives | Stale backups of small config directories |
| `gitignore.txt` | Dead copy of `.gitignore`, no unique rules, git never reads it |
| `code-review-graphignore` | Byte-identical duplicate of `.code-review-graphignore` |
| 8 legacy deploy scripts | `deploy.sh`, `deploy-now.sh`, `deploy-to-server.sh`, `upload-to-server.sh`, `push-update.sh`, `push-update-scp.sh`, `update-server.sh`, `PUSH-UPDATE.bat` — root SSH/SCP against the live host, forbidden by `AGENTS.md`. Verified to contain no embedded passwords and no `rsync --delete`. |

`.gitignore` gained `agents/browser-qa/node_modules/`, `agents/browser-qa/screenshots/`, `*.zip`.

**Kept deliberately:** root historical `*.md` reports (AGENTS.md cites them as the
source-of-truth chain), `docker-compose.yml` (local dev, now env-var driven),
`.vscode/launch.json`.

### 1.2 The 2026-09-22 audit work — committed

It was sitting **uncommitted** in the working tree and would never have deployed. Now on
GitHub. Covers call-gateway boundary hardening, honest Redis readiness, credential
remediation, the Next 16 `proxy.ts`/instrumentation migration, 3 new CI workflows, and 4 docs.

⚠️ `agents/website/src/proxy.ts` was **untracked**. It is Next 16's middleware convention and
308-redirects old property slugs to canonical URLs. Had a deploy run without it, the build
would have emitted no middleware and every indexed old property URL would have stopped
redirecting.

### 1.3 Branch and commits

Branch `release/audit-hardening-20260922`, **merged**:

| Commit | Contents |
|---|---|
| `cf2abdd` | Repo cleanup (769 deletions) |
| `8efe5e8` | Audit hardening (33 files) |

Split deliberately so a reviewer can skip the deletions.

### 1.4 🔴 The repository moved

`AvnishRana25/Realty-Pandit-CRM-ai` → **`realty-pandit-swastik/Realty-Pandit-CRM-ai`**

The local remote has been repointed. **All GitHub configuration — default branch, `production`
environment, deploy secrets, branch protection — must be done on the new repo.** Repo
visibility was changed to **private** this session.

### 1.5 SSH access restored

Previously `Permission denied (publickey)`. The handover checklist item *"append the new
developer's public key to `/root/.ssh/authorized_keys`"* had never been completed.

Fixed via the **Hostinger hPanel browser terminal** (which bypasses `sshd` entirely — the
server has `PasswordAuthentication no`, so there was no other route in).

`~/.ssh/config` alias `realty-pandit` was written **without** `StrictHostKeyChecking no`, and
host keys are pinned in `~/.ssh/known_hosts`.

`/root/.ssh/authorized_keys` now holds **3** keys:

| Key | Owner |
|---|---|
| `realty-pandit-deployment` (ED25519) | Varchasv |
| `#hostinger-managed-key` (RSA 4096) | Hostinger platform — benign, not an intruder |
| `avnish-realtypandit` (ED25519) | This session |

Fingerprint to verify: `SHA256:5kRH6BlnBdZPXGalnVHq8coddehygZGJ85JSSoMue+E`

> Handover §2.1's claim that *"exactly one SSH key is authorized"* is out of date — Hostinger's
> managed key was already present.

---

## 2. Verified production state (read-only, 2026-09-22)

| Item | Value |
|---|---|
| Host | `72.62.231.224`, hostname `srv1344620` |
| Uptime | 46 days |
| Node / npm | v20.20.0 / 10.8.2 |
| Next.js | 16.1.6 (declared **and** installed) |
| Disk | 31 GB used of 96 GB — 66 GB free |
| Memory | 7.9 GB total, **3.6 GB available**, 2 GB swap |
| Backend health | `db` connected 1 ms, `redis` connected 1 ms, circuits CLOSED |
| nginx | config test passes |

### PM2 — two daemons, confirmed

| Daemon | Process | Mode | Port |
|---|---|---|---|
| root | `realty-backend` ×2 | cluster | 7071 |
| root | `panditji-voice` | fork | 8765 |
| root | `pm2-logrotate` | module | — |
| realty | `realty-website` | next start | 3000 |
| realty | `realty-admin` | npm preview | 5173 |

**`realty-admin` is vestigial.** nginx serves the admin UI *statically* from
`/var/www/realty-pandit/frontend/dist` (`root` + `try_files`). **No vhost proxies to :5173.**
The release script not restarting it is therefore harmless. Consider deleting the process after
cutover to free memory and reduce confusion.

### Other observations

- Release layout (`releases/`, `shared/`, `current`) — **all missing.** Cutover not started.
- Backend PM2 `exec cwd` is `/var/www/realty-pandit/backend` — the flat pre-cutover layout.
- `/var/www/realty-pandit/` still contains the legacy scripts and docs; `backend/` and
  `frontend/` are owned by UID **197609:197121** (Windows UIDs from historic SCP copies).
- The live website `.next` build is dated **2026-08-07** — six weeks old.

---

## 3. Current blockers, in order

### 3.1 Credential exposure — status UNKNOWN, please confirm

Three scripts (`create-admin.js`, `create-admin-prod.js`, `update-admin-password.js`) contained
a hardcoded plaintext password for a **`super_boss`** account, phone `+919958860411`.

- In history since **2026-06-11** — **103 days** in a public repository.
- `POST /auth/login` (`routes/auth.ts:53`) takes **phone + password only** — no OTP, no 2FA.
  Both halves were in the same public file, so it was a complete working login.
- The commit removes it from `HEAD`. **It remains in Git history.**
- Making the repo private stops further exposure but does not undo 103 days of it.

**Action:** rotate via `admin.realtypandit.in` → My Profile → Change Password. Then review the
team list and recent record changes for anything unfamiliar. Handover §11 also lists Cloudflare
(password leaked to a chat transcript, **2FA off**, controls DNS for site/admin/API/mail) and
the GlitchTip Postgres password as needing rotation.

### 3.2 🔴 Production runs code that is not in Git — THE blocker

Measured by comparing every source file on the live server against `origin/main`, CR-normalized.

| Area | Server-only | Git-only | Content differs |
|---|---:|---:|---:|
| `backend/src` | 4 | 3 (tests) | 37 |
| `frontend/src` | 2 | 0 | 37 |
| `website/src` | 7 | 2 | 37 |
| `prisma/schema.prisma` | 1 model + 3 fields | 0 | 45 lines |
| `prisma/migrations` | **2** | 0 | — |

**13 server-only source files, 111 differing, 2 unpushed migrations.**
Production has **48** applied migrations; Git has **46**.

#### The unpushed work is ~6 coherent features from August 2026

| Feature | Server-only artefacts |
|---|---|
| Contact sharing (2026-08-09) | `ContactShare` model, `contact_shares` table, migration `20260809000000_add_contact_shares`, `services/contact_shares.ts`, `Contact.shares` relation |
| Partner revert (2026-08-10) | `PartnerAgent.reverted_at` / `reverted_by`, migration `20260810000000_add_partner_reverted`, `components/RevertToCustomerDialog.tsx` |
| Lead stage sync | `services/lead_stage_sync.ts` (142 lines, imported by 6 files), `scripts/backfill_lead_stage.ts` |
| Programmatic SEO pages | `app/properties/in/[city]/[locality]/*`, `app/properties/in/[city]/budget/[range]/*` — **confirmed built and serving** |
| Agent deal browse | `app/agent/deals/[id]/browse/page.tsx` |
| Utilities | `utils/video_compress.ts`, `lib/useMasterData.ts` |

The schema comments are dated and describe deliberate expand/contract rollouts, including a
35-row backfill where 26 timestamps are approximate. **This is production work, not scratch
code.**

#### Why a deploy would be worse than a crash

`origin/main` has **zero** references to `contact_shares` or `lead_stage_sync`, and all 9 files
that import them are in the differs list. A deploy replaces those importers with versions that
never import the services, so the backend **would not crash** — it would silently delete the
features. Nothing would appear in any log. Deleting the SEO pages would 404 indexed URLs.

#### The drift runs both ways

- **Git is ahead** on `services/property_sharing.ts` (674 lines with the WhatsApp media change
  vs 638 live), plus `app.ts`, `utils/redis.ts` and the audit tests.
- **The server is ahead** on the six features above.

This is a genuine merge, not a fast-forward.

### 3.3 The release layout does not exist

`releases/`, `shared/`, `current` are all missing, so the workflow's preflight would refuse to
run. Independent of 3.2 — can be prepared in parallel.

---

## 4. Step-by-step: what to do next

### Step 1 — Rotate the exposed password (today, ~5 min)

`admin.realtypandit.in` → log in as `+919958860411` → **My Profile → Change Password**.
Then check the team list and recent record modifications for anything unexpected.

Also: Cloudflare password + **enable 2FA**, and 2FA on the `realtypandit2026@gmail.com`
recovery inbox — handover §5 notes that inbox is equivalent to DNS control.

### Step 2 — Ship the WhatsApp change only (today, ~15 min, reversible)

Your original feature is 4 files and is **additive** — it does not touch any server-only
feature. The backend runs `ts-node --transpile-only`, so there is no build step.

Files:
- `agents/backend/src/services/property_sharing.ts`
- `agents/backend/src/__tests__/property_share_content.test.ts`
- `agents/frontend/src/lib/buildWhatsAppShareText.ts`
- `agents/frontend/index.html`

Procedure:

1. **Back up on the server first** — copy each target file to `<name>.bak-20260922`.
2. Copy the new files in (preserve ownership; `backend/` is UID 197609).
3. `pm2 reload realty-backend --update-env`
4. Wait **25–40 s** — the app takes that long to bind :7071.
5. Verify: `curl -fsS http://127.0.0.1:7071/health`
6. Functional check: share a property over WhatsApp **to a number you control**. Confirm photos
   and videos arrive before the details text.
7. For the frontend file: rebuild `frontend/` and bump the `<!-- vYYYYMMDD -->` stamp in
   `index.html`, or the PWA service worker will keep serving the old bundle.

**Rollback:** copy the `.bak-20260922` files back and `pm2 reload realty-backend`. Under a
minute.

> ⚠️ A WhatsApp `sendText()` returning 200 does **not** mean delivered. Check `grep WA-Delivery`
> in `/var/www/realty-pandit/backend/logs/`.

### Step 3 — Reconcile the drift (the real work, ~1–2 days)

A CR-normalized snapshot of the server source (782 files) was pulled to the session scratchpad
as `server-snapshot.tgz`. **Re-pull it if that scratchpad is gone** — it is session-scoped.

1. Create a branch, e.g. `reconcile/server-drift-20260922`.
2. Work app by app, starting with `backend/src`. Sort the 37 differing files into three buckets:
   - **Take Git** — audit-only changes (`app.ts`, `utils/redis.ts`, audit tests).
   - **Take server** — August feature work.
   - **Line-level merge** — files touched by both.
3. Add the 13 server-only files and the 2 migrations.
4. Update `schema.prisma` with `ContactShare`, `Contact.shares`, and the `reverted_*` fields.
5. Re-run every suite: backend `npm test`, call-gateway `npm test`, both builds.
6. Compare files **outside `src/`** — `package.json` already differs (server pins Next
   `16.1.6`, repo declares `^16.3.5`).
7. PR into `main`.

**Always `tr -d '\r'` both sides before diffing.** The local `schema.prisma` is CRLF and the
server's is LF; a naive diff reports all 5,273 lines as changed when the real diff is 45.

### Step 4 — Prepare the release layout (parallel with Step 3, maintenance window)

Full detail in `TEST-DELETE.md` §3. Summary:

1. Back up: `pg_dump` + uploads tar. **`ls -lh` the dump** — it can silently write 0 bytes.
   Restore into a scratch database to prove it. Take a Hostinger snapshot.
2. Create the deploy user — non-root, **passphrase-less key** (a GitHub runner cannot type one),
   with narrowly scoped sudo for exactly the two commands `reload_services()` calls.
3. Build `releases/`, `shared/`, `current` **alongside** the live directories. Do not repoint
   anything yet.
4. Move `.env` to `shared/backend.env`, `chmod 640`.
   🔴 `.env.production` is a **subset** — never `cp .env.production .env` (caused a 502 on
   2026-07-13). Never `source .env` — the multi-line PEM breaks bash.
5. Repoint nginx and PM2 at `current/`. **See the unresolved `ecosystem.config.js` issue below.**
6. Run `github-hostinger-release.sh preflight` until it passes.

### Step 5 — GitHub configuration (on the NEW repo)

Default branch → `main`; protect it; create the `production` environment with a required
reviewer; add the six `HOSTINGER_*` environment secrets; set
`HOSTINGER_GITHUB_DEPLOY_ENABLED=false` until rehearsal is done.

> The deploy workflow exists only on `main`, and GitHub only shows the `workflow_dispatch`
> button for workflows on the **default** branch — so it is un-runnable until the default
> branch is `main`.

### Step 6 — Prove the pipeline with a no-op deploy

Deploy the commit **already live**. Same code in, same code out — zero functional change. Then
roll back and forward again. You rehearse recovery with nothing at stake.

### Step 7 — Deploy the audit hardening

Only now. `run_migrations=false` unless the merged branch includes the 2 new migrations, in
which case review them, take a fresh restore-tested backup, and get explicit approval.

---

## 5. Unresolved issues

### 5.1 `pm2 start ecosystem.config.js` — documents disagree

`docs/runbooks/deploy.md` instructs it. Handover §6.2 says that exact command causes cluster
workers to never bind → infinite restart.

**The naive fix is worse.** `cd`-ing into `current/backend` and running `pm2 start` captures
`getcwd()`, which resolves the symlink to a physical `releases/<sha>/backend` path. PM2 would
then be pinned to one release, and every future `pm2 reload` would restart the **old** code — a
deploy reporting success while changing nothing. The literal `cwd: .../current/backend` string
in `ecosystem.config.js` is what avoids that.

**Determine empirically during cutover:**

```bash
pm2 describe realty-backend | grep -iE 'exec cwd|status|restarts'
```

`exec cwd` must show a `current/` path, not `releases/<sha>/`.

### 5.2 Build memory on the server

`prepare_release()` runs `npm ci` plus **two** production builds on the VPS. Only 3.6 GB RAM is
available (plus 2 GB swap) while the backend holds 2.4 GB. An OOM during build could kill a
running process. Deploy at low traffic and watch memory.

### 5.3 Hostinger blackholes rapid SSH

Handover §2.2: several rapid connections trip upstream DDoS mitigation and drop all packets
from your IP for ~2 minutes. The deploy workflow makes **4** back-to-back (`scp`, `scp`, `ssh`,
`ssh`). If a deploy fails with a timeout rather than a script error, suspect this first.
Consider collapsing to a single `ssh`.

### 5.4 `ufw` vs GitHub runners

Handover §11 item 4 recommends restricting port 22 to specific IPs. GitHub-hosted runners have
dynamic IPs — doing so would permanently break automated deploys. Decide deliberately.

### 5.5 Backend typecheck

`tsc --noEmit` reports **391 errors** and is non-blocking in CI. Left visible on purpose.
Largest concentrations: `routes/team.ts` (69), `routes/inventory.ts` (57), `routes/builder.ts`
(25), `routes/public.ts` (23). Fix in domain batches; do not mask it.

---

## 6. Reference

### Connection

```bash
ssh realty-pandit          # alias already configured
```

Key: `~/.ssh/realty_pandit_key` (passphrase-protected; `ssh-add --apple-use-keychain` once).

### Key paths

| Path | Purpose |
|---|---|
| `/var/www/realty-pandit/backend` | **LIVE API.** Holds the real `.env`. |
| `/var/www/realty-pandit/frontend/dist` | **LIVE admin**, served statically by nginx |
| `/var/www/realty-pandit/website` | **LIVE public site**, owned by `realty` |
| `/var/www/realty-pandit/agents/` | ⚠️ **Stale mirrors — NOT what runs** |
| `/root/realtypandit.git` | Bare repo; newest branch `feature/contact-system-refactor` @ 2026-08-11. **No `main`.** |

### Traps

| Trap | Rule |
|---|---|
| `cp .env.production .env` | Never — deletes 24 live secrets |
| `source .env` | Never — multi-line PEM breaks bash |
| Restarting website from root PM2 | Use `sudo -u realty -H pm2 …` |
| Editing `agents/backend/` on the server | Live dir is `backend/` |
| `pg_dump` printing OK | Always `ls -lh` — it can write 0 bytes |
| Long pasted commands | Terminal splits at ~80 chars; use short lines or a file |

### Documents

| File | Use |
|---|---|
| `TEST-DELETE.md` | Full Phase 2/3 runbook, 16 pipeline guardrails, contradictions. **Fold into `docs/runbooks/deploy.md` and delete.** |
| `handover/ENGINEERING-HANDOVER.md` | System, secrets inventory, operational traps |
| `handover/PRODUCTION-DEPLOYMENT-RECOMMENDATION.md` | Deployment architecture rationale |
| `docs/engineering-audit.md` | 2026-09-22 audit ratings and findings |

---

## 7. Summary

**Done:** repo cleaned and committed, audit work committed and merged, SSH access restored,
production fully surveyed read-only, drift measured precisely.

**Not done:** nothing deployed. Production is untouched and healthy.

**Do first:** rotate the password (§4 Step 1), then ship the WhatsApp change (§4 Step 2).

**Do next:** reconcile the drift (§4 Step 3). Until it is fixed, **every** deploy carries the
same risk, and each week adds more unpushed server work.
