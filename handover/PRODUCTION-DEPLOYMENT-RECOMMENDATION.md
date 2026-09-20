# Production Deployment Assessment and Recommended Runbook

> **Prepared:** 2026-09-21
> **Scope:** Realty Pandit public website, admin CRM, backend API, PostgreSQL, Redis/BullMQ, nginx, PM2, GitHub Actions, and Hostinger VPS deployment.
> **Production domains:** `realtypandit.in`, `www.realtypandit.in`, `api.realtypandit.in`, and `admin.realtypandit.in`.
> **Important:** `admin.realitypunjath.in` does not currently resolve and appears to be a spelling error.
> **Evidence policy:** This is a dated assessment. Re-check the repository, GitHub settings, and live VPS before every production release.

## Executive decision

Keep the existing Hostinger VPS. The hosting platform is suitable for the current application, but the legacy deployment method is not.

Do not deploy through `deploy/DEPLOYMENT-GUIDE.md`, manual SCP, a live-server `git pull`, or `agents/deployment/deploy-agent.js`. The recommended approach is a protected GitHub Actions deployment using immutable release directories, explicit production approval, atomic activation, health checks, and immediate application rollback.

| Approach | Rating | Assessment |
|---|---:|---|
| Legacy deployment guide | 2/10 | Historical bootstrap material; unsafe for routine production releases |
| Current GitHub Actions design | 7/10 | Correct direction, but not ready to enable |
| Current repository deploy readiness | 3/10 | Blocked by dependency gates, server drift, and non-atomic deployment |
| Recommended release-based workflow | 9/10 | Best fit for the present Hostinger VPS architecture |

## Documents reviewed

- `deploy/DEPLOYMENT-GUIDE.md`
- `CODEBASE_ENGINEERING_HANDOVER_AND_AUDIT.md`
- `CODEBASE_FILE_COVERAGE_APPENDIX.md`
- `COMPLETE-IMPLEMENTATION-STATUS.md`
- `.codex/AGENTS.md`
- `.github/workflows/deploy-hostinger.yml`
- `deploy/github-hostinger-release.sh`
- `agents/deployment/deploy-agent.js`
- `docs/runbooks/deploy.md`
- `docs/runbooks/REMOTE-ACCESS.md`
- `docs/precautions/deployment-gotchas.md`

Graphify was used to trace competing deployment paths and relate the guarded workflow, legacy scripts, PM2 ownership, migration handling, backups, verification, and rollback. Current source and live read-only evidence took precedence over historical documentation.

## Why the legacy guide must not be used

The legacy guide is useful only for understanding the original VPS bootstrap. It is not a safe update procedure:

- It relies on root SSH and manual file copying.
- It runs unpinned `npm install` directly in live directories.
- It couples normal code deployment with database migration.
- Its quoted environment-file heredoc would write secret-generation commands literally instead of executing them.
- It contains credential-like examples that must not be copied or trusted.
- It provides no immutable release identity.
- It has no atomic cutover.
- Its ports, PM2 ownership, and admin serving assumptions conflict with newer production evidence.
- Manual overlays can preserve deleted source files and leave partially updated deployments.
- It does not protect server-only configuration, uploads, logs, environment files, or production bootstrap behavior adequately.

## Interpretation of the historical reports

`COMPLETE-IMPLEMENTATION-STATUS.md` is not production-readiness evidence. It says the application is fully complete while also documenting mock analytics, missing backend APIs, placeholder exports, features without persistence, and no automated tests.

`CODEBASE_FILE_COVERAGE_APPENDIX.md` is a complete catalog of the repository snapshot. It proves file classification coverage, not runtime correctness, test coverage, security, production parity, or deployability.

`CODEBASE_ENGINEERING_HANDOVER_AND_AUDIT.md` contains the most appropriate deployment direction: reconcile production drift, prove backups and restore, establish green gates, rehearse deployment and rollback, and then enable guarded GitHub delivery.

## Evidence captured during this assessment

### Repository state

- Local branch: `main`.
- Local `main` was two commits ahead of `origin/main`.
- The working tree contained 68 modified, deleted, or untracked entries.
- Uncommitted files are not part of a GitHub Actions checkout and therefore cannot be deployed by the GitHub workflow.
- The dirty tree included untracked admin/mock/fix scripts that require deliberate review. Do not use `git add -A` blindly.
- No current working-tree changes were detected in `schema.prisma` or `prisma/migrations`; based on that evidence, the present release should not request automatic migrations.

### Verification results

- Backend: 49 test files passed; 400 tests passed.
- Admin frontend: lint passed and production build passed, with warnings.
- Public website: lint passed and production build passed, with warnings.
- Backend dependency audit failed: 28 vulnerabilities, including 13 high.
- Admin frontend dependency audit failed: 9 vulnerabilities, including 1 critical.
- Public website dependency audit failed: 18 vulnerabilities, including 1 critical.

The guarded workflow executes `npm audit --omit=dev --audit-level=high`. Therefore, the current production job cannot pass until the dependency findings are deliberately remediated or a documented risk decision changes the release policy. Do not use `npm audit fix --force`.

### Live read-only checks

At the time of review:

- `https://realtypandit.in` returned HTTP 200.
- `https://admin.realtypandit.in` returned HTTP 200.
- `https://api.realtypandit.in/health` returned a healthy application response.
- PostgreSQL and Redis reported connected.
- The public endpoints were served through Cloudflare.
- Health data reported nine failed social-inbound jobs and nine failed scheduled jobs. These failures should be understood before deploying.

A successful `/health` response is necessary but is not sufficient proof of production health.

## Weaknesses in the current GitHub release script

The current GitHub workflow is a good foundation: it checks out a precise revision, uses lockfiles, pins the SSH host key, serializes production jobs, supports a protected environment, preserves persistent paths, and keeps migrations opt-in.

The associated release script still deploys in place and has important failure modes:

1. It overlays new files on live component directories without deleting removed source files.
2. It installs and builds inside the live directories.
3. An `npm ci`, build, ownership, or restart failure can occur before final verification and leave production partially updated.
4. Automatic code restoration is tied mainly to final verification failure.
5. The source archive is not a database backup.
6. Database rollback after migration is intentionally manual.
7. A production-only `server-bootstrap.js` prevents clean synchronization and proves repository/server drift still exists.

Do not enable `HOSTINGER_GITHUB_DEPLOY_ENABLED` until these issues have been addressed and deploy/rollback have been rehearsed.

## Recommended production architecture

```text
Reviewed pull request
  -> tests, lint, builds, dependency/security gates
  -> protected main branch
  -> GitHub production environment approval
  -> exact commit artifact
  -> build in /var/www/realty-pandit/releases/<commit-sha>/
  -> atomic current symlink switch
  -> restart PM2 under the correct owners
  -> health, queue, log, and browser verification
  -> switch back to previous release if verification fails
```

Recommended server layout:

```text
/var/www/realty-pandit/
|-- releases/
|   |-- <previous-sha>/
|   `-- <new-sha>/
|-- shared/
|   |-- backend.env
|   |-- website.env
|   |-- uploads/
|   `-- logs/
`-- current -> releases/<new-sha>
```

Environment files, uploads, logs, and other persistent data belong under `shared/` and must be linked into each release. PM2 and nginx should refer to `current`, not directly to a mutable source directory.

Keep at least the previous three application releases. Hostinger snapshots are disaster recovery, not the normal application rollback mechanism.

## One-time production preparation

### 1. Confirm production identity and topology

Collect fresh evidence before changing the VPS:

```bash
hostname
whoami
node --version
npm --version
nginx -t
df -h
free -m

pm2 list
sudo -u realty -H pm2 list

systemctl --no-pager status nginx postgresql redis-server

curl -fsS http://127.0.0.1:7071/health
curl -fsSI http://127.0.0.1:3000/
```

Record the following without copying secret values into reports or logs:

- nginx server blocks and actual serving paths;
- root and `realty` PM2 process dumps;
- live dependency-lock hashes;
- the live `server-bootstrap.js` hash, source, and responsibility;
- current Prisma migration state;
- database, uploads, and logs locations;
- environment-file ownership and permissions;
- the exact live release identity;
- Redis/BullMQ queue health and scheduler ownership;
- current backup age and restore evidence.

### 2. Reconcile the production-only bootstrap

Determine whether `server-bootstrap.js` is application code or host-specific provisioning:

- If it is application code, sanitize and version it.
- If it is host-specific provisioning, document it, checksum it, store it through a secure provisioning mechanism, and keep it outside release directories.
- Do not continue indefinitely with an unknown file that blocks clean releases.

### 3. Create a dedicated deployment identity

- Use a non-root deployment user.
- Use a dedicated SSH key stored in the GitHub `production` environment.
- Pin the server host key in `HOSTINGER_KNOWN_HOSTS`.
- Never set `StrictHostKeyChecking=no` in production automation.
- Grant only the narrow `sudo` commands needed for ownership, PM2 under the correct user, and controlled service reloads.
- Retain root credentials only for emergency recovery.

### 4. Establish backup and restore proof

In Hostinger hPanel:

1. Enable the strongest practical VPS backup frequency.
2. Create a manual snapshot before the first deployment cutover.
3. Remember that restoring a VPS snapshot overwrites the current VPS. It is not a lightweight application rollback.

Create independent logical and media backups before migration or bulk writes:

```bash
timestamp=$(date +%Y%m%d-%H%M%S)
backup_dir=/var/backups/realty-pandit
sudo install -d -m 700 "$backup_dir"

cd /var/www/realty-pandit/backend
db_url=$(sed -n 's/^DATABASE_URL=["'\''']\{0,1\}\([^"'\''']*\)["'\''']\{0,1\}$/\1/p' .env)
pg_dump "${db_url%%\?*}" | gzip > "$backup_dir/database-$timestamp.sql.gz"

tar -C /var/www/realty-pandit/backend \
  -czf "$backup_dir/uploads-$timestamp.tgz" uploads

gzip -t "$backup_dir/database-$timestamp.sql.gz"
```

Conduct a restore rehearsal into a separate non-production database. A backup without a proven restore path is not a completed deployment prerequisite.

## Repository release preparation

### 1. Review current work deliberately

```bash
git status --short
git diff --check
git diff
git diff origin/main...HEAD
```

Do not stage every file automatically. Review untracked scripts, generated artifacts, archives, dependency locks, and configuration changes individually.

Check database changes explicitly:

```bash
git diff origin/main...HEAD -- \
  agents/backend/prisma/schema.prisma \
  agents/backend/prisma/migrations
```

If the command is empty, keep `run_migrations=false`.

### 2. Run clean release gates

Run the same commands expected in CI from a clean checkout:

```bash
(cd agents/backend && \
  npm ci && \
  npx prisma generate && \
  npm test && \
  npm audit --omit=dev --audit-level=high)

(cd agents/frontend && \
  npm ci && \
  npm run lint && \
  npm run build && \
  npm audit --omit=dev --audit-level=high)

(cd agents/website && \
  npm ci && \
  npm run lint && \
  npm run build && \
  npm audit --omit=dev --audit-level=high)
```

Do not weaken tests, lint, authentication, signature verification, or deployment gates merely to make the job green. Upgrade vulnerable dependencies component by component and verify compatibility.

### 3. Commit through a pull request

1. Create a release branch.
2. Stage only reviewed paths.
3. Review `git diff --cached`.
4. Run a credential/secret review before pushing.
5. Commit the intended release.
6. Push the branch.
7. Open a pull request into protected `main`.
8. Require all checks to pass.
9. Merge only after human review.

Only committed content in the merged revision can be deployed by GitHub Actions.

## GitHub production environment

Create or verify an environment named `production` with:

- a required reviewer;
- self-review disabled where supported;
- deployment branches restricted to protected `main`;
- environment secrets unavailable until approval;
- concurrency preventing overlapping production deployments.

Required environment secrets:

- `HOSTINGER_HOST`
- `HOSTINGER_PORT`
- `HOSTINGER_USER`
- `HOSTINGER_SSH_PRIVATE_KEY`
- `HOSTINGER_KNOWN_HOSTS`
- `HOSTINGER_DEPLOY_PATH`

Keep `HOSTINGER_GITHUB_DEPLOY_ENABLED` false until preflight and rollback rehearsal are complete.

References:

- [Hostinger: VPS backups and snapshots](https://support.hostinger.com/en/articles/1583232-how-to-back-up-or-restore-a-vps)
- [Hostinger: VPS SSH keys](https://www.hostinger.com/support/4792364-how-to-use-ssh-keys-at-hostinger-vps/)
- [GitHub: Deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [GitHub: Controlling deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)

## Atomic deployment procedure

### 1. Build the inactive release

The workflow should:

1. Package the exact approved Git commit.
2. Upload it to a unique staging/release path.
3. Extract it into `releases/<commit-sha>`.
4. Link persistent environment files, uploads, and logs.
5. Run `npm ci` using lockfiles.
6. Generate Prisma Client.
7. Build the admin and website in the inactive release.
8. Fail without changing `current` if any install or build step fails.

### 2. Handle migrations separately

- Default `run_migrations` to false.
- Review every SQL migration before production.
- Take and verify a fresh database backup.
- Prefer expand/contract, backward-compatible migrations.
- Run `npx prisma migrate deploy` only with explicit production approval.
- Do not attempt automatic database rollback.

### 3. Activate the release

After the inactive release builds successfully:

```bash
ln -sfn "/var/www/realty-pandit/releases/$release_sha" \
  /var/www/realty-pandit/current

pm2 reload realty-backend --update-env
sudo -u realty -H pm2 restart realty-website
sudo -u realty -H pm2 restart realty-admin
```

The precise PM2 commands must be reconciled with the live process configuration during preflight. The backend and website/admin currently have different PM2 ownership expectations.

### 4. Record release identity

Write the deployed Git SHA and deployment timestamp to a non-secret release marker and expose it to operational diagnostics. This allows GitHub, the filesystem, PM2, and the running application to be reconciled without guessing from file timestamps.

## Post-deployment verification

### Automated endpoint checks

```bash
curl -fsS https://api.realtypandit.in/health
curl -fsSI https://realtypandit.in/
curl -fsSI https://admin.realtypandit.in/
curl -fsSI https://admin.realtypandit.in/sw.js
```

### Runtime checks

- Confirm the deployed release SHA matches the approved GitHub revision.
- Check both root and `realty` PM2 process lists.
- Confirm restart counts stabilize.
- Inspect backend, website, admin, and nginx error logs.
- Confirm PostgreSQL and Redis connectivity.
- Check BullMQ waiting, active, delayed, and failed counts.
- Confirm only one scheduler owner is registering recurring jobs.
- Investigate any increase in failed social or scheduled jobs.
- Confirm disk and memory remain healthy.

### Browser smoke tests

- Public home page loads.
- Property listing and property detail load real API data.
- Admin login succeeds.
- One authenticated read-only CRM path succeeds.
- Inventory and lead screens load.
- The PWA service worker serves the new revision.
- No new browser-console application errors appear.
- Do not send production WhatsApp, email, voice, or payment events as casual smoke tests.

## Rollback procedure

### No database migration

Switch to the previous release and restart the same services:

```bash
ln -sfn /var/www/realty-pandit/releases/<previous-sha> \
  /var/www/realty-pandit/current

pm2 reload realty-backend --update-env
sudo -u realty -H pm2 restart realty-website
sudo -u realty -H pm2 restart realty-admin
```

Repeat all automated, runtime, queue, log, and browser checks.

### Database migration was applied

- Application rollback is safe only when the migration is backward-compatible.
- Do not automatically reverse SQL or restore production data.
- Stop and make a deliberate database decision based on the reviewed migration, backup, and data written since deployment.
- Use the Hostinger snapshot only for full-server disaster recovery after understanding that it overwrites newer server state.

## Immediate action list

1. Review and classify all 68 current working-tree entries.
2. Do not stage untracked admin/mock/fix scripts without inspecting them for credentials and intended production use.
3. Push the two local commits only through the normal reviewed release branch/PR flow.
4. Remediate the three failing dependency-audit gates without forced upgrades.
5. Investigate failed social-inbound and scheduled jobs.
6. Reconcile `server-bootstrap.js` and the split PM2 ownership.
7. Replace the in-place release script with release directories and atomic activation.
8. Create and restore-test fresh database and uploads backups.
9. Configure the protected GitHub `production` environment and dedicated deploy user.
10. Rehearse one deployment and one rollback before enabling automatic delivery.
11. Deploy the current release with `run_migrations=false` unless the final reviewed commit introduces a migration.

## Go/no-go checklist

Deployment is a **go** only when all items are checked:

- [ ] Intended changes are committed and present in the approved Git revision.
- [ ] No unintended untracked scripts, archives, secrets, or generated files are included.
- [ ] Backend tests pass.
- [ ] Admin lint and build pass.
- [ ] Website lint and build pass.
- [ ] High/critical dependency release gates pass or have an explicit approved exception.
- [ ] Production bootstrap and live revision are reconciled.
- [ ] Database backup is fresh and restore-tested.
- [ ] Uploads backup is fresh and verified.
- [ ] Hostinger snapshot exists for disaster recovery.
- [ ] PostgreSQL, Redis, queues, disk, and memory are healthy.
- [ ] Failed queue jobs are understood.
- [ ] Production environment approval is configured.
- [ ] SSH host key is pinned.
- [ ] Deployment runs as a dedicated non-root identity.
- [ ] Migration decision is explicit; default is no migration.
- [ ] Atomic deploy and rollback have been rehearsed.
- [ ] Post-deploy browser and operational smoke checks are ready.

## Final recommendation

The correct next step is not to copy the current working directory to production. First make the release reproducible, secure, and reversible. Keep Hostinger, retain the guarded GitHub Actions foundation, replace live-directory overlays with immutable releases and an atomic symlink, and enable production delivery only after the current security gates, bootstrap drift, backup proof, and rollback rehearsal are resolved.
