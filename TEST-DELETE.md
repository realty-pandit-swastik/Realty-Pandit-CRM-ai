# Production deployment — Phase 2 and Phase 3

> Updated 2026-09-22. Reconciled against `handover/ENGINEERING-HANDOVER.md` (2026-09-12),
> `handover/PRODUCTION-DEPLOYMENT-RECOMMENDATION.md` (2026-09-21), `docs/runbooks/deploy.md`,
> `docs/runbooks/REMOTE-ACCESS.md`, and live local verification.
>
> Where these documents contradict each other, the contradiction is called out explicitly
> below rather than silently resolved. **Several of them are actively dangerous if followed
> verbatim.** Read §0 before running anything.

---

## 0. 🔴 STOP — three blockers, in this order

### 0.A Nothing you changed is on GitHub

`git rev-list --left-right --count origin/main...HEAD` → `0 0`. Local commits are **identical**
to GitHub. But the working tree holds:

| Category | Count |
|---|---|
| Modified tracked files | 22 |
| New untracked files | 12 |
| Staged deletions (repo cleanup, 2026-09-22) | 769 |

The entire 2026-09-22 audit hardening batch — call-gateway boundary hardening, Redis readiness
accuracy, credential remediation, the Next 16 `proxy.ts`/instrumentation migration, and three
new CI workflows — **exists only in your working tree.** The deploy pipeline builds from a
GitHub checkout, so none of it would ship. Deploying today would push the *old* code.

Files that must be committed or the deployed site loses behaviour:

- `agents/website/src/proxy.ts` — **untracked.** Next 16's middleware convention. It
  308-redirects old/leaky property slugs to canonical URLs (privacy + SEO). Absent from a
  GitHub checkout, the build simply emits no middleware and every shared or indexed old
  property URL stops redirecting.
- `agents/website/instrumentation.ts`, `instrumentation-client.ts` — **untracked.** Sentry/
  GlitchTip wiring. Missing them kills error reporting silently.
- `.github/workflows/frontend-ci.yml`, `call-gateway-ci.yml`, `secret-scan.yml` — **untracked.**
  Never run until committed.
- `.env.example`, `agents/call-gateway/.env.example` — **untracked.** Verified placeholder-only;
  no real secrets.

### 0.B 🔴 A plaintext admin password is on GitHub right now

Three tracked scripts contain a hardcoded privileged password in the committed revision:

| File | On GitHub | Working tree |
|---|---|---|
| `agents/backend/create-admin.js` | password literal | requires `ADMIN_PASSWORD` |
| `agents/backend/create-admin-prod.js` | password literal | requires `ADMIN_PASSWORD` |
| `agents/backend/update-admin-password.js` | password literal | requires `ADMIN_PASSWORD` |

The audit fixed all three — **uncommitted**, so the exposure is still live.

1. **Check whether the repository is public.** Settings → General. If public, treat this as an
   active incident.
2. **Rotate the admin CRM password now**, before committing anything. Committing the fix does
   **not** remove it from history — `git log -p` still shows it.
3. Decide separately on history remediation (`git filter-repo` / BFG + force-push, which
   rewrites every SHA and requires coordinating with the server's bare repo).
4. Handover §11 item 3 also lists the Cloudflare password and GlitchTip Postgres password as
   needing rotation, and §11 item 1 notes **Cloudflare 2FA is off** while that account controls
   DNS for the site, admin, API and mail. Do those in the same pass.

### 0.C You cannot reach the server

`ssh realty-pandit` returns `Permission denied (publickey)`. Diagnosed 2026-09-22; every
local cause is ruled out:

| Check | Result |
|---|---|
| `~/.ssh/realty_pandit_key` present, mode 600 | ✅ |
| Passphrase correct, key loaded into agent | ✅ |
| Agent fingerprint `SHA256:5kRH6BlnBdZPXGalnVHq8coddehygZGJ85JSSoMue+E` | ✅ matches handover §2.1 |
| `72.62.231.224:22` reachable, host keys pinned | ✅ |
| Server offered the key and refused it | ✅ |

**Cause:** the public key was never appended to `/root/.ssh/authorized_keys`. Handover §13
leaves *"Receive the new developer's public key; append to /root/.ssh/authorized_keys"*
**unchecked**, and §2.1 states only `realty-pandit-deployment` is authorized.

This cannot be self-fixed: the server runs `PasswordAuthentication no` and
`PermitRootLogin prohibit-password`, so there is no password path to bootstrap in.

**Fix — you have hPanel access, so use path B.**

- **A.** Varchasv runs the handover §2.1 authorize command (he holds the only working key), or
- **B.** ✅ **Use this one.** Hostinger hPanel → your VPS → **Browser terminal / Emergency
  console**. It attaches to the VM directly and does not go through `sshd`, so it works even
  though no key is authorized:

```bash
mkdir -p /root/.ssh && chmod 700 /root/.ssh
cat >> /root/.ssh/authorized_keys <<'EOF'
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHtBVBQiG/GV1D1d7X1lT7J3o5V6IZgZSn2WXRUbbQKg avnish-realtypandit
EOF
chmod 600 /root/.ssh/authorized_keys
wc -l /root/.ssh/authorized_keys   # expect 1 -> 2
```

**Bundle the deploy-user creation (§3 Step 5) into that same session** — it needs the same
access, and you otherwise burn a second favour.

Everything below is blocked until this is resolved.

---

## 1. What is already done

Phase 0 and Phase 1 completed 2026-09-22. All CI gates verified green locally:

| Gate | Result |
|---|---|
| Backend `npm test` | 49 files, 400/400 pass |
| Backend `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |
| Admin `npm run lint` | exit 0 — 0 errors, 892 warnings |
| Admin `npm run build` | pass |
| Admin audit | 0 vulnerabilities |
| Website `npm run lint` | exit 0 — 0 errors, 307 warnings |
| Website `npm run build` | pass |
| Website audit | 0 vulnerabilities |
| Prisma migrations in release | **none** → `run_migrations=false` |

- The dependency-audit blocker in the 2026-09-21 assessment (28 / 9 / 18 vulnerabilities) is
  **stale**. All three now report zero. CI is reachable.
- The WhatsApp photo/video change is **already on `origin/main`** — all four changed files
  byte-identical. Nothing was waiting to be pushed.
- Local `main` carried 3 duplicate-history commits with an identical tree; soft-reset onto
  `origin/main`. Recover with `git reset --hard backup/pre-reset-main-20260922`.
- No secrets tracked in git — only `.env.example` files.
- `server-bootstrap.js` is now committed and sanitized (2 lines), so that handover drift item
  is resolved and it ships inside the release tarball.
- Connection assets ready: host `72.62.231.224:22`, host keys pinned in `~/.ssh/known_hosts`,
  `~/.ssh/config` alias `realty-pandit` written **without** `StrictHostKeyChecking no`.

### Repository cleanup — 2026-09-22

Tracked files reduced **3,039 → 2,270** (769 removed, ~50 MB). Staged, not committed. No
deployed source under `agents/backend|frontend|website` was touched.

| Removed | Why |
|---|---|
| `agents/browser-qa/node_modules/` (546 files, 12.4 MB) | Dependencies were committed — `.gitignore` covered only backend/frontend/website |
| `agents/browser-qa/screenshots/` (209 files, 37.2 MB) | Generated QA artifacts |
| 4 `.zip` archives | Stale backups of tiny config dirs; `docs.zip` was already deleted |
| `gitignore.txt` | Dead copy of `.gitignore` with zero unique rules; git never reads it |
| `code-review-graphignore` | Byte-identical duplicate of `.code-review-graphignore` |
| 8 legacy deploy scripts | `deploy.sh`, `deploy-now.sh`, `deploy-to-server.sh`, `upload-to-server.sh`, `push-update.sh`, `push-update-scp.sh`, `update-server.sh`, `PUSH-UPDATE.bat` — direct root/SCP paths that AGENTS.md and the recommendation both forbid; one documented a `curl \| bash` install. No embedded passwords and no `rsync --delete` found. |

`.gitignore` gained `agents/browser-qa/node_modules/`, `agents/browser-qa/screenshots/`, `*.zip`.

**Kept deliberately:** the root historical `*.md` reports (AGENTS.md references them as the
reconciled source-of-truth chain), `docker-compose.yml` (local-dev Postgres on 5433, now
env-var driven), and `.vscode/launch.json`.

---

## 1.5 Phase 1.5 — get your work onto GitHub (do this before Phase 2)

Rotate the exposed admin password first (§0.B). Then:

```bash
cd /Users/avnish/Realty-Pandit-Codebase/reality-pandit
git status --short                    # review all 34 changes + 769 staged deletions
git diff                              # read the audit's modifications
```

Stage deliberately — **never `git add -A`** (the recommendation doc calls this out explicitly):

```bash
# the audit's source + CI hardening
git add agents/backend/src agents/backend/create-admin.js agents/backend/create-admin-prod.js \
        agents/backend/update-admin-password.js \
        agents/call-gateway agents/website docker-compose.yml .gitignore \
        .github/workflows .env.example docs/
git diff --cached --stat
```

Re-run the gates on the staged result, then commit on a branch and open a PR into protected
`main`:

```bash
git switch -c release/audit-hardening-20260922
git commit    # message describing: audit hardening + repo cleanup
git push -u origin release/audit-hardening-20260922
```

**Do not push straight to `main`.** Let `backend-ci`, `frontend-ci`, `website-ci`,
`call-gateway-ci` and `secret-scan` run first. Expect `secret-scan` (Gitleaks, `fetch-depth: 0`)
to **fail on the historical admin password** — that is correct behaviour, not a bug to suppress.
Rotate first, then decide on history remediation.

Only after this merges does Phase 3 deploy anything you actually changed.

---

## 2. 🔴 Contradictions between the existing documents

Resolve each of these **before** acting on the step it affects. Do not assume any single
document is current.

### 2.1 🔴 CONFIRMED 2026-09-22 — the server runs code GitHub has never seen

**Measured, not suspected.** Compared every `.ts`/`.js` file under `backend/src` on the live
server against `origin/main`, CR-normalized (live files are CRLF, repo is LF):

| Result | Count |
|---|---|
| Files only on the server | **4** |
| Files only in git | 3 (all tests — safe to add) |
| Files whose content differs | **37** |

The four server-only files have **never existed in git history** (`git log --all --follow`
returns nothing for any of them):

| File | Lines | Imported by (on the server) |
|---|---:|---|
| `services/lead_stage_sync.ts` | 142 | `transaction_state_machine`, `deal_service`, `transaction_service`, `ensure_deal`, `routes/leads`, `scripts/backfill_lead_stage` |
| `services/contact_shares.ts` | 85 | `lead_reingest`, `routes/leads`, `middleware/contact_visibility` |
| `scripts/backfill_lead_stage.ts` | 75 | — |
| `__tests__/convert_partner_idempotency.test.ts` | — | — |

`origin/main` contains **zero** references to `contact_shares` or `lead_stage_sync`, and every
one of those 9 importing files is in the 37-file differs list.

**Consequence of deploying today:** the backend would not crash — the importing files get
replaced by versions that never import these services. It would **silently delete a live
feature**. Lead stage synchronization and contact sharing would stop working on the production
CRM with no error anywhere. That is worse than a crash, because nothing would alert you.

Note `docs/runbooks/lead-deal-stage-sync.md` exists in the repo — the feature is documented
but its code was never pushed.

**The drift runs in both directions**, so this is a genuine two-way merge, not a fast-forward:

- GitHub is **ahead** on `services/property_sharing.ts` (674 lines with the WhatsApp media
  change vs 638 on the server), plus `app.ts`, `utils/redis.ts` and the test files from the
  2026-09-22 audit.
- The server is **ahead** on the lead-stage-sync / contact-shares feature.

### Full measured scope (all three apps + database)

| Area | Server-only | Git-only | Content differs |
|---|---:|---:|---:|
| `backend/src` | 4 | 3 (tests) | 37 |
| `frontend/src` | 2 | 0 | 37 |
| `website/src` | 7 | 2 | 37 |
| `prisma/schema.prisma` | 1 model + 3 fields | 0 | 45 lines |
| `prisma/migrations` | **2** | 0 | — |

**13 server-only source files, 5 git-only, 111 differing files, 2 unpushed migrations.**

### The unpushed work is ~6 coherent features from August 2026

| Feature | Server-only artefacts |
|---|---|
| Contact sharing (2026-08-09) | `ContactShare` model, `contact_shares` table, migration `20260809000000_add_contact_shares`, `services/contact_shares.ts`, `Contact.shares` relation |
| Partner revert (2026-08-10) | `PartnerAgent.reverted_at` / `reverted_by`, migration `20260810000000_add_partner_reverted`, `components/RevertToCustomerDialog.tsx` |
| Lead stage sync | `services/lead_stage_sync.ts`, `scripts/backfill_lead_stage.ts` |
| Programmatic SEO pages | `app/properties/in/[city]/[locality]/*`, `app/properties/in/[city]/budget/[range]/*` — **confirmed built and serving** |
| Agent deal browse | `app/agent/deals/[id]/browse/page.tsx` |
| Misc | `utils/video_compress.ts`, `lib/useMasterData.ts` |

The schema comments date these precisely and describe deliberate expand/contract rollouts —
this is considered production work, not scratch code. One comment records a backfill of 35 rows
where 26 have approximate timestamps.

### Database state

Production has **48 applied migrations; git has 46.** `prisma migrate deploy` from a GitHub
checkout would not corrupt anything (it only applies pending migrations, never drops), but the
`contact_shares` table and the `reverted_*` columns would become orphaned — present in the
database, absent from the schema, unreferenced by any deployed code.

### Line-ending trap

The local repo's `schema.prisma` is **CRLF** (2,614 CRs); the server's is LF. A naive `diff`
reports all 5,273 lines as changed. Always compare with `tr -d '\r'` first — the real diff is
45 lines. Note this is the *reverse* of handover §6.4's claim that live files are CRLF and the
repo is LF; both directions occur.

### Required before any deploy

1. Snapshot pulled to the session scratchpad: `server-snapshot.tgz` (782 files, CR-normalized).
2. Review the 111 differing files and decide per file which side wins. The drift runs **both
   ways**, so this is a merge, not a fast-forward.
3. Commit the 13 server-only files and the 2 migrations.
4. Re-run all suites against the merged result.
5. Compare files **outside `src/`** too — `package.json` already differs (server pins Next
   `16.1.6`, repo declares `^16.3.5`), and that was not covered by the `src/` manifests.

Only when a deploy is a no-op for the server-only features is it safe to proceed.

### 2.1b Original warning (now proven)

Handover §6.4 is explicit:

> *"Bare remote: `/root/realtypandit.git` on the VPS. Branch `feature/contact-system-refactor`."*
> *"There is no checked-out worktree on the server. Live dirs are edited in place."*
> *"Drift is asymmetric: code is written on the server first and pulled down; docs are written
> locally and pushed up."*

**This is the single largest risk in the whole plan.** The entire pipeline deploys *from*
GitHub. If production is running code that was written on the server and never pulled down,
the first deploy silently reverts it.

This also explains why the GitHub default branch is `feature/contact-system-refactor` — it
mirrors the server's bare repo, not a mistake.

**Hard gate before Phase 3:** diff every live directory against `origin/main`. Handover §6.4
also warns *"most live files are CRLF; the repo is LF"* — diff with whitespace normalization
or every file looks changed:

```bash
# on the server, in one batched connection
cd /tmp && rm -rf drift && git clone -q /root/realtypandit.git drift
for c in backend frontend website; do
  echo "=== $c ==="
  diff -rq --strip-trailing-cr \
    -x node_modules -x .next -x dist -x .env -x uploads -x logs -x .git \
    /var/www/realty-pandit/$c /tmp/drift/agents/$c 2>&1 | head -40
done
```

Anything reported as differing must be understood and committed to GitHub **before** the
first deploy, or it will be destroyed. Handover §6.4: *"Never resolve it with `reset --hard`
— you will lose one side."*

### 2.2 🔴 `pm2 start ecosystem.config.js` — two documents disagree, one predicts an outage

`docs/runbooks/deploy.md` Step 2 of the cutover instructs:

```bash
HOSTINGER_DEPLOY_PATH=/var/www/realty-pandit pm2 start ecosystem.config.js
```

Handover §6.2 lists **exactly that command** as a trap that has caused a real incident:

> *"`pm2 delete` + `pm2 start ecosystem.config.js` → Cluster workers never bind → infinite
> restart."* *"⚠️ ecosystem.config.js is BROKEN in cluster mode — do not `pm2 start
> ecosystem.config.js`."*

`agents/backend/ecosystem.config.js` is indeed `instances: 2, exec_mode: 'cluster'`.
§6.1 gives the form known to work:

```bash
pm2 start server-bootstrap.js --name realty-backend -i 2 --time && pm2 save
```

**But there is a second, subtler trap that makes the naive fix wrong too.** `cd`-ing into
`current/backend` and running `pm2 start` captures `getcwd()`, which resolves to the
*physical* path `/var/www/realty-pandit/releases/<sha>/backend`. PM2 would then be pinned to
that specific release, and after the symlink flips, `pm2 reload` restarts the **old code** —
a deploy that reports success while changing nothing.

The `ecosystem.config.js` literal string `cwd: ${appRoot}/current/backend` does *not* have
that problem — which is precisely why it exists.

**Unresolved. Do not guess.** During Step 7, determine empirically which form both (a) binds
in cluster mode and (b) keeps `cwd` pointing through the `current` symlink. Check with:

```bash
pm2 describe realty-backend | grep -iE 'exec cwd|script path|status|restarts'
```

If `exec cwd` shows a `releases/<sha>` path rather than a `current` path, atomic deployment is
broken regardless of what the health check says. Candidate third form to test:

```bash
pm2 start server-bootstrap.js --name realty-backend -i 2 --time \
  --cwd /var/www/realty-pandit/current/backend
```

Rehearse this on the inactive release before cutting production over.

### 2.3 🔴 `realty-admin` exists and the release script never restarts it

Handover §3.2 lists **three** PM2 processes across **two** daemons:

| Daemon | Process | Path | Port |
|---|---|---|---|
| root | `realty-backend` ×2 cluster | `backend/server-bootstrap.js` | 7071 |
| root | `panditji-voice` | `agents/pipecat/main.py` | 8765 |
| realty | `realty-website` | `website` (`next start`) | 3000 |
| realty | `realty-admin` | `frontend` (`serve -s dist`) | 5173 |

`deploy/github-hostinger-release.sh` `reload_services()` restarts only **two**:

```bash
sudo -n pm2 reload realty-backend --update-env
sudo -u realty -H pm2 restart realty-website
```

`realty-admin` is absent. Meanwhile handover §1 and `docs/runbooks/deploy.md` both say nginx
serves the admin **statically** from `frontend/dist/`, which would make the PM2 process
redundant. Three documents, three stories.

**Determine which is actually true** via `sudo -u realty -H pm2 list` and the nginx config for
`admin.realtypandit.in` (look for `root` vs `proxy_pass :5173`). If `realty-admin` is live and
serving, add it to `reload_services()` or the admin CRM keeps serving the previous build after
a "successful" deploy. Note the recommendation doc's activate section *does* list all three —
the implemented script does not.

### 2.4 Hostinger blackholes rapid SSH — the workflow makes 4 in a row

Handover §2.2: many rapid SSH/scp connections trip **Hostinger's upstream DDoS mitigation**,
silently dropping every packet from your IP for ~2 minutes. Not fail2ban, not ufw — invisible
server-side.

`deploy-hostinger.yml` "Upload and deploy" performs, back to back: `scp` archive, `scp`
script, `ssh` preflight, `ssh` deploy. **Four connections in seconds — exactly the pattern
that trips it.** If a deploy fails mid-run with a timeout rather than a script error, suspect
this before suspecting the code. Consider collapsing to a single `ssh` invocation.

### 2.5 Tightening `ufw` would permanently break Actions deploys

Handover §11 item 4 recommends replacing `22/tcp ALLOW Anywhere` with the two engineers'
specific IPs. GitHub-hosted runners have **dynamic, unpredictable IPs**. Doing this kills
every future automated deploy. Pick one: self-hosted runner, a documented CIDR allowlist, or
leave port 22 open and rely on key-only auth plus fail2ban. Decide deliberately.

### 2.6 `REMOTE-ACCESS.md` is the legacy path

It specifies `User root`, `StrictHostKeyChecking no`, `UserKnownHostsFile /dev/null`, and
`deploy-agent.js`. Handover §6.1 and the recommendation both supersede it. Use it only as a
topology reference, never as deploy instructions.

---

## 3. Phase 2 — one-time preparation

### Step 0 — restore SSH access

See §0. Nothing else can proceed.

### Step 1 — fix the default branch

`.github/workflows/deploy-hostinger.yml` exists **only on `main`**, but the repo default is
`feature/contact-system-refactor`. GitHub only surfaces the `workflow_dispatch` "Run workflow"
button for workflows present on the **default** branch, so the deploy workflow is currently
un-runnable from the UI.

`origin/main` is 15 commits ahead of `feature/contact-system-refactor`, which has **zero**
unique commits — a strict ancestor, so switching is lossless.

**Settings → General → Default branch** → `main`.
**Settings → Branches** → protect `main`: require a PR, require `backend-check`,
`frontend-check`, `website-check`, disallow force-push.

⚠️ Confirm with whoever maintains the server's bare repo that renaming the effective default
does not break their pull-down workflow (§2.1).

### Step 2 — GitHub production environment

**Settings → Environments → New environment → `production`**

- Require a reviewer; disable self-review where offered.
- Restrict deployment branches to `main`.

Environment secrets (not repository secrets — environment secrets stay unavailable until the
approval gate passes):

| Secret | Value |
|---|---|
| `HOSTINGER_HOST` | `72.62.231.224` |
| `HOSTINGER_PORT` | `22` |
| `HOSTINGER_USER` | the deploy user from Step 5 — **not root** |
| `HOSTINGER_SSH_PRIVATE_KEY` | deploy user's key, **no passphrase** |
| `HOSTINGER_KNOWN_HOSTS` | contents of `/tmp/rp_known_hosts` (already generated) |
| `HOSTINGER_DEPLOY_PATH` | `/var/www/realty-pandit` |

Repository variable `HOSTINGER_GITHUB_DEPLOY_ENABLED` = `false` until Phase 3.

Verified host fingerprints for `72.62.231.224` — confirm via hPanel console before trusting:

| Type | SHA256 |
|---|---|
| ED25519 | `faEMgJcq/HXW8gMbRYENVof5Mi1R/k0YZY7aCmeHQGM` |
| RSA | `d9jeTlyWyH2W6nnvMXbQbpwjzzLdcfReqKF58NFBbFc` |
| ECDSA | `ChDJjfChtAohgH04/HQT/AcSu9Wk/qN2epTsz1b1WS0` |

Cross-check with `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` from the hPanel terminal,
which doesn't traverse the network path a keyscan does.

### Step 3 — capture current production state

**One batched connection** (§2.4). Record before changing anything:

```bash
ssh realty-pandit 'hostname; whoami; node --version; npm --version; nginx -t; df -h; free -m
echo "--- ROOT PM2 ---"; pm2 list
echo "--- REALTY PM2 ---"; sudo -u realty -H pm2 list
echo "--- CWD PINNING ---"; pm2 describe realty-backend | grep -iE "exec cwd|script path"
echo "--- NGINX ADMIN ---"; grep -E "root|proxy_pass" /etc/nginx/sites-enabled/admin.realtypandit.in
echo "--- SERVICES ---"; systemctl --no-pager status nginx postgresql redis-server | head -40
echo "--- HEALTH ---"; curl -fsS http://127.0.0.1:7071/health; curl -fsSI http://127.0.0.1:3000/
echo "--- MIGRATIONS ---"; cd /var/www/realty-pandit/backend && npx prisma migrate status'
```

This single command settles §2.2 (cwd pinning), §2.3 (`realty-admin`), and migration drift.
Record environment-variable **names only**, never values.

### Step 4 — back up and prove the restore

```bash
timestamp=$(date +%Y%m%d-%H%M%S)
backup_dir=/var/backups/realty-pandit
sudo install -d -m 700 "$backup_dir"

cd /var/www/realty-pandit/backend
db_url=$(grep -E "^DATABASE_URL=" .env | head -1 | cut -d= -f2- | tr -d '"'"'"'')
db_url="${db_url%%\?*}"            # Prisma's ?connection_limit breaks pg_dump
pg_dump "$db_url" | gzip > "$backup_dir/database-$timestamp.sql.gz"

tar -C /var/www/realty-pandit/backend -czf "$backup_dir/uploads-$timestamp.tgz" uploads

ls -lh "$backup_dir"/*-"$timestamp".*   # MANDATORY
gzip -t "$backup_dir/database-$timestamp.sql.gz"
```

⚠️ Handover §6.3: **`pg_dump` can silently write 0 bytes while the `&&` chain still prints
OK.** Always `ls -lh` the dump. Then restore it into a scratch database and confirm it loads —
a backup with no proven restore is not a completed prerequisite.

Handover §11 item 7 notes the newest visible dump in `/root/backups` was **24 July**, despite
`/etc/cron.d/realty-backup` existing. Find where it actually writes.

Take a Hostinger snapshot too, but treat it as disaster recovery only — restoring it
overwrites the entire VPS.

### Step 5 — create the deploy identity

Non-root user, passphrase-less key (a GitHub runner cannot type a passphrase). Grant **only**
the two commands `reload_services()` invokes:

```
pm2 reload realty-backend --update-env
sudo -u realty -H pm2 restart realty-website
```

Plus `realty-admin` if §2.3 resolves that way. No general root shell. Keep root for emergency
recovery.

### Step 6 — build the immutable layout

Do this **without deleting the live directories.** Production keeps serving from the old
layout until the new one is verified.

```text
/var/www/realty-pandit/
├── releases/
│   └── <initial>/        ← copy of live backend/ frontend/ website/
├── shared/
│   ├── backend.env       ← the live 65-variable .env
│   ├── website.env
│   ├── uploads/
│   └── logs/
└── current -> releases/<initial>
```

🔴 **Moving `.env` is the highest-risk step in Phase 2.** Handover §4:

- `.env.production` is a **subset**, not a copy — 24 variables exist only in the live `.env`.
  `cp .env.production .env` caused a full 502 outage on 2026-07-13 (`REDIS_PASSWORD` lost →
  NOAUTH crash-loop). **Never** overwrite; merge missing keys only.
- **Never `source .env`** — `FLOW_PRIVATE_KEY` is an unquoted multi-line PEM that breaks bash
  sourcing and silently unsets everything after it.
- Copy byte-exactly (`cp -a`), verify with `wc -l` and `diff`, and confirm 65 variables survive.

The preflight in `deploy/github-hostinger-release.sh` rejects the layout unless **all** hold:

- `releases/`, `shared/uploads/`, `shared/logs/` exist
- `shared/backend.env` and `shared/website.env` exist
- `current` is a **symlink** resolving into `releases/`
- both env files are **not world-accessible** — octal mode must end in `0` (`chmod 640`)
- on PATH: `curl ln npm pm2 realpath stat sudo tar`

Also note handover §3.4: `/var/www/realty-pandit/agents/backend/` and `agents/frontend/` on the
server are **stale mirrors that are not what runs**. Live dirs are `backend/`, `frontend/`,
`website/` directly. The release tarball's `--strip-components=1` maps `agents/backend` →
`backend/`, which matches correctly.

### Step 7 — repoint nginx and PM2 at `current`

🔴 **Read §2.2 first.** Do not run `pm2 start ecosystem.config.js` until you have established
which start form binds in cluster mode *and* keeps `cwd` on the `current` symlink. Verify:

```bash
pm2 describe realty-backend | grep -iE 'exec cwd|status|restarts'
```

`exec cwd` must show a `current/` path, not `releases/<sha>/`. If it shows the latter, atomic
deploys are silently broken.

Website must be restarted **as `realty`, never as root** (§6.2: restarting from root's PM2
produces an orphan holding :3000 — "site not refreshing"):

```bash
sudo -u realty -H pm2 restart realty-website
```

Then point nginx's admin root at `current/frontend/dist`, and:

```bash
nginx -t && sudo systemctl reload nginx
```

The release script's verify issues a HEAD request to `http://127.0.0.1/` with
`Host: admin.realtypandit.in`, so that vhost must answer on localhost:80.

### Step 8 — preflight

As the **deploy user**:

```bash
HOSTINGER_DEPLOY_PATH=/var/www/realty-pandit \
  bash /tmp/github-hostinger-release.sh preflight
```

Must print `Deployment filesystem preflight passed: /var/www/realty-pandit`. Every failure
message names the exact missing item. Do not continue until it passes.

---

## 4. Phase 3 — first guarded deployment

### Gate — drift check

**Run §2.1's diff first.** If the live directories contain code not in `origin/main`, stop and
reconcile. Deploying over it destroys it.

### Step 1 — enable and run

1. Repository variable `HOSTINGER_GITHUB_DEPLOY_ENABLED` = `true`.
2. **Actions → Deploy to Hostinger → Run workflow**, branch `main`.
3. `run_migrations` = **false**. This release contains no migration (verified §1). Never
   enable migrations on a first deployment.
4. Approve the `production` environment gate.

The workflow runs the three check jobs, packages the exact SHA, extracts to `releases/<sha>`,
symlinks shared env/uploads/logs, runs `npm ci` + both builds **inside the inactive release**,
flips `current` atomically, reloads PM2, verifies. A build failure discards the release
directory and never moves `current`.

Note: the backend has **no build step** — PM2 runs ts-node `--transpile-only`, so type errors
do not block startup (§6.1). The frontend is the opposite: `tsc -b && vite build` is strict
with a clean baseline, so any new type error fails the build.

### Step 2 — verify

```bash
curl -fsS  https://api.realtypandit.in/health
curl -fsSI https://realtypandit.in/
curl -fsSI https://admin.realtypandit.in/
curl -fsSI https://admin.realtypandit.in/sw.js
```

A 200 from `/health` is necessary and nowhere near sufficient. Backend takes **25–40s to bind
:7071** after a restart — wait before judging (§6.1). Also confirm:

- `cat /var/www/realty-pandit/current/REVISION` equals the approved Git SHA
- `pm2 describe realty-backend` still shows a `current/` cwd (§2.2)
- both PM2 daemons stable, restart counts not climbing
- PostgreSQL and Redis connected
- BullMQ failed counts — the 2026-09-21 review saw **nine failed social-inbound and nine
  failed scheduled jobs**; understand those *before* deploying
- exactly one scheduler owner registering recurring jobs
- `/var/www/realty-pandit/backend/logs/{combined,error}-YYYY-MM-DD.log` clean
- GlitchTip (`errors.realtypandit.in`) shows no new spike; filter by `service:` tag

Browser smoke:

- public home, listing, and property detail load real API data
- admin login + one authenticated read-only CRM screen
- **the actual change:** share a property over WhatsApp and confirm photos/videos arrive
  before the details text — use a **test contact you control**, never a production customer

⚠️ A WhatsApp `sendText()` returning 200 does **not** mean delivered (§6.2 — the account was
locked for 9 days while every log said "sent"). Check `grep WA-Delivery` in the backend logs
for delivery truth.

⚠️ If the admin UI looks unchanged after a successful deploy, it is the **PWA service worker**
serving the old bundle (§6.2). Bump the `<!-- vYYYYMMDD -->` stamp in `frontend/index.html`;
users need Ctrl+Shift+R twice. Runbook: `docs/runbooks/pwa-cache-bust.md`.

Do not fire real WhatsApp, email, payment, or voice sends as casual smoke tests.

### Step 3 — rollback

No migration ran, so rollback is a symlink flip:

```bash
HOSTINGER_DEPLOY_PATH=/var/www/realty-pandit \
  bash /tmp/github-hostinger-release.sh rollback _ <previous-sha> 0
```

Then repeat every verification. The script also self-heals: if post-deploy verification fails
and no migration ran, it reactivates the previous release automatically.

If a migration **had** been applied, stop and make a deliberate database decision. Never
auto-reverse SQL or overwrite newer production data. Handover §6.3 warns prod migration
history has **drifted before** (columns applied but not recorded → "column already exists");
confirm via `information_schema`, then `prisma migrate resolve --applied`.

---

## 4.5 Guardrails — what keeps the site up

### Already built into the pipeline

| # | Guardrail | Where | What it prevents |
|---|---|---|---|
| 1 | Five CI gates must pass | `deploy` job `needs:` | Broken code reaching the deploy step at all |
| 2 | Branch protection on `main` | GitHub settings (Step 1) | Unreviewed code entering the deployable branch |
| 3 | Manual environment approval | `environment: production` | An accidental push auto-deploying |
| 4 | Kill switch | `HOSTINGER_GITHUB_DEPLOY_ENABLED` | Everything, instantly — set to `false` to freeze deploys |
| 5 | Serialized deploys | `concurrency: hostinger-production`, `cancel-in-progress: false` | Two deploys interleaving and corrupting a release |
| 6 | Pinned SSH host key | `HOSTINGER_KNOWN_HOSTS` | Deploying into a spoofed host |
| 7 | Filesystem preflight | `preflight()` | Deploying onto a layout that isn't ready |
| 8 | **Build happens in the inactive release** | `prepare_release()` | An `npm ci` or build failure touching the live site — `current` never moves |
| 9 | Release-collision guard | `[[ ! -e "$release" ]]` | Overwriting an existing release directory |
| 10 | `trap 'rm -rf "$release"' EXIT` | deploy path | A half-extracted release surviving a crash |
| 11 | **Atomic activation** | `ln -sfn` | Any window where the site serves a half-updated tree |
| 12 | Three-endpoint verification, 8 retries × 5s | `verify()` | Declaring success while backend/website/admin are down |
| 13 | **Automatic rollback on failed verify** | deploy path | A bad release staying live — it reactivates the previous one unaided |
| 14 | Release retention (≥3) | `keep_releases` | Losing the rollback target |
| 15 | Migrations off by default | `run_migrations=false` | Schema change riding along with a code deploy |
| 16 | Persistent data excluded from the artifact | `tar --exclude` + `shared/` symlinks | `.env`, uploads and logs being overwritten |

Guardrail 13 is the important one: **without a migration, a failed deploy self-heals.** The
script reactivates the previous release and re-verifies before giving up.

### What is NOT protected — know these

- **The database.** No automatic rollback, ever. If you set `run_migrations=true`, guardrail 13
  is disabled by design and you own the recovery decision.
- **Uploads.** Live production data in `shared/uploads/`. Backed up only by your Step 4 tar.
- **The one-time cutover (Phase 2 Steps 6–7).** Moving `.env` and repointing nginx/PM2 happens
  *outside* the pipeline, so none of the 16 guardrails apply. This is the single most dangerous
  hour in the whole plan. Do it in a maintenance window with the old directories intact.
- **Provider side effects.** A deploy cannot un-send a WhatsApp message.
- **PWA caching.** A correct deploy can still look wrong; see §5.

### Add these before your first deploy

1. **Deploy at low traffic**, never Friday evening.
2. **Open a second terminal** streaming `pm2 logs realty-backend --lines 50` throughout.
3. **Know the abort command before you start** — paste it somewhere visible:
   ```bash
   HOSTINGER_DEPLOY_PATH=/var/www/realty-pandit \
     bash /tmp/github-hostinger-release.sh rollback _ <previous-sha> 0
   ```
   Get `<previous-sha>` *before* deploying: `ls -1t /var/www/realty-pandit/releases | head -3`
4. **Rehearse a rollback first.** Deploy the *same* commit twice, then roll back to the first.
   You learn the mechanism with nothing at stake. The recommendation doc requires this.
5. **Set a 15-minute soak timer.** Do not walk away on green — restart loops and queue backlogs
   surface minutes later.
6. **Have the hPanel browser terminal open** as an out-of-band path in case SSH is blackholed
   (§2.4) exactly when you need to intervene.

---

## 5. Gotchas

| Trap | Consequence | Rule |
|---|---|---|
| `cp .env.production .env` | Deletes 24 live secrets → 502 | Never. Merge only. |
| `source .env` | Multi-line PEM breaks bash, later vars unset | `grep '^KEY=' .env` |
| `pm2 start ecosystem.config.js` | Cluster workers never bind → infinite restart | See §2.2 — unresolved |
| Restarting website from root PM2 | Orphan holds :3000 | `sudo -u realty -H pm2 …` |
| Editing `agents/backend/` on server | Nothing changes | Live dir is `backend/` |
| `pg_dump` prints OK | May have written 0 bytes | Always `ls -lh` |
| Rotating `JWT_SECRET` | Orphans every encrypted DB value | `docs/runbooks/secrets-recovery.md` |
| DNS change in Hostinger | Never resolves — zone is inert | Cloudflare only |
| Many quick SSH calls | IP blackholed ~2 min | Batch into one connection |
| `npx prisma generate` after schema copy | Chokes on em-dashes | `sed -i 's/—/-/g; s/–/-/g'` first |

Additional:

- `KEEP_RELEASES` must match `^[3-9][0-9]*$`, so `10` is **rejected** while `3` and `30` are
  accepted. Leave unset unless you have a reason.
- The release tarball excludes `node_modules`, `.env`, `uploads`, `logs` — those come from
  `shared/` via symlink. Anything else needed at runtime must be committed.
- `server-bootstrap.js` runs the backend through `ts-node` at runtime, so the release build
  must keep dev dependencies. The script's plain `npm ci` does this — do **not** add
  `--omit=dev` to it.
- Uncommitted local files can never be deployed; Actions checks out the merged commit.
  `docs.zip` is currently deleted in the working tree but not committed.
- `contacts.phone_number` is the primary key with **23 cascading FKs**, stored E.164. Always
  normalize before lookup or you create duplicates.

---

## 6. Housekeeping

This file is untracked and named `TEST-DELETE.md`. Once the cutover is done, fold what remains
useful into `docs/runbooks/deploy.md` — **including the §2.2 correction**, since that runbook
currently instructs a command the handover says causes an outage — then delete this file
rather than leaving a fourth competing deployment document in the repo root.
