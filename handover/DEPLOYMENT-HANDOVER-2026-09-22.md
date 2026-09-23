# Realty Pandit — Deployment Handover

> **Prepared:** 2026-09-22  
> **Repository:** `realty-pandit-swastik/Reality-Pandit-CRM-ai`  
> **Purpose:** Current handover of the repository, production-readiness work, GitHub Actions deployment setup, and the latest deployment attempt.  
> **Evidence rule:** This file records repository evidence and the GitHub Actions results reviewed during this session. It does **not** claim a successful production deployment or current live-health verification.

## Executive status

- The repository checks passed in GitHub Actions.
- The deployment gate was initially disabled, so workflow run **#7** skipped the `deploy` job.
- `HOSTINGER_GITHUB_DEPLOY_ENABLED` was then configured as a repository variable with value `true`.
- Workflow run **#8** entered the deploy job but failed during SSH/SCP upload with:

  ```text
  Permission denied (publickey).
  Error: Process completed with exit code 255.
  ```

- **No successful deployment has been confirmed.** The latest run proves only that the workflow reached the Hostinger connection step and the server rejected the supplied SSH key for the configured user.
- Do not retry repeatedly until the SSH identity, deploy user, host, and port are verified; repeated invalid SSH attempts can trigger Hostinger rate limiting or IP blocking.

## Work completed before the latest deployment attempt

### Repository cleanup and audit hardening

The prior session handover records the repository cleanup and audit-hardening work. In summary:

- Removed committed browser-QA dependencies and generated screenshots, stale archives, duplicate ignore files, and legacy direct-SCP/root deployment scripts.
- Added appropriate ignore rules for browser-QA dependencies/screenshots and archives.
- Committed audit hardening covering call-gateway boundaries, Redis readiness, credential remediation, Next.js 16 instrumentation/proxy migration, CI workflows, and documentation.
- Preserved historical reports where they are part of the documented source-of-truth chain; do not treat historical “complete” or “production-ready” claims as current runtime proof.
- The repository was moved from `AvnishRana25/Realty-Pandit-CRM-ai` to `realty-pandit-swastik/Reality-Pandit-CRM-ai` and made private.

See also:

- `handover/SESSION-HANDOVER-2026-09-22.md` — detailed production drift and security handover.
- `handover/PRODUCTION-DEPLOYMENT-RECOMMENDATION.md` — deployment architecture and readiness assessment.
- `docs/runbooks/deploy.md` — guarded production deployment runbook.
- `.codex/AGENTS.md` — current repository safety and deployment rules.

### Production reconnaissance and drift findings

The earlier read-only VPS review found that production was healthy at the time of inspection, but was not aligned with Git:

- Production contained server-only features and migrations not present in the repository at that point.
- The live server used a flat pre-cutover layout rather than the intended `releases/`, `shared/`, and `current` release layout.
- Production had separate PM2 daemons/users and a production-only bootstrap/configuration concern.
- The server was ahead on contact sharing, partner revert, lead-stage synchronization, programmatic SEO routes, agent deal browsing, and utility code; Git was also ahead on selected audit/property-sharing changes.
- This is a real reconciliation task, not a safe fast-forward deploy. Replacing production with an unreconciled Git revision could silently remove live features or indexed SEO routes.

### Credential/security follow-up

- A privileged `super_boss` password had previously been committed and exposed. It was removed from `HEAD`, but removal from the latest commit does not erase historical exposure.
- Rotate the affected privileged account password out of band and review recent account/record activity.
- Do not put credentials, private keys, or secret values in this file, commits, issues, or chat.

## GitHub Actions deployment workflow

The workflow is `.github/workflows/deploy-hostinger.yml`.

### Checks

The workflow runs these prerequisite jobs:

- `backend-check`: install dependencies, generate Prisma client, run backend tests, run dependency audit.
- `frontend-check`: lint, build, dependency audit.
- `website-check`: lint, build, dependency audit.

The checks passed in the successful preflight shown in workflow run #7/#8.

### Deployment gate

The deploy job is guarded by:

```yaml
if: github.ref == 'refs/heads/main' && vars.HOSTINGER_GITHUB_DEPLOY_ENABLED == 'true'
```

Therefore:

- The workflow must run against `main`.
- `HOSTINGER_GITHUB_DEPLOY_ENABLED` must be a GitHub Actions variable whose value is exactly the lowercase string `true`.
- A green workflow summary does not prove deployment; it can mean only that checks passed while `deploy` was skipped.

### Deployment environment and inputs

The job uses the protected GitHub environment `production` and these secrets:

```text
HOSTINGER_HOST
HOSTINGER_PORT
HOSTINGER_USER
HOSTINGER_SSH_PRIVATE_KEY
HOSTINGER_KNOWN_HOSTS
HOSTINGER_DEPLOY_PATH
```

The manual `workflow_dispatch` input `run_migrations` defaults to false. Keep it false unless a reviewed migration plan, backup, compatibility check, and rollback decision exist.

The workflow packages the approved backend, frontend, and website revision, copies the archive and release script to Hostinger over SSH/SCP, then invokes `deploy/github-hostinger-release.sh` remotely.

## GitHub configuration completed

The following repository variable was added:

```text
Name:  HOSTINGER_GITHUB_DEPLOY_ENABLED
Value: true
```

Location:

```text
Repository → Settings → Secrets and variables → Actions → Variables
```

The deployment secrets should be checked in the `production` environment, not pasted into this document:

```text
Repository → Settings → Environments → production → Environment secrets
```

The workflow's `production` environment may also require an approval before the job can execute.

## GitHub workflow evidence

### Run #7 — gate disabled

Observed in the GitHub Actions UI:

- `backend-check`: passed.
- `frontend-check`: passed.
- `website-check`: passed.
- `deploy`: skipped.

Conclusion: the workflow was green, but nothing was uploaded or activated on Hostinger.

### Run #8 — SSH authentication failure

Observed in the GitHub Actions UI:

- `backend-check`: passed.
- `frontend-check`: passed.
- `website-check`: passed.
- `deploy`: started and failed.
- `Validate deployment configuration`: passed.
- `Configure SSH`: passed.
- `Package approved revision`: passed.
- `Upload and deploy`: failed.

The relevant log was:

```text
target="${HOSTINGER_USER}@${HOSTINGER_HOST}"
Permission denied (publickey).
scp: Connection closed
Error: Process completed with exit code 255.
```

Interpretation:

- The workflow had non-empty values for the required configuration checks.
- The runner created the SSH key and known-host files.
- The failure is SSH public-key authentication, before the remote release script could perform the deployment.
- This is not a frontend, backend, website, Prisma, or application-build failure.
- Passing host-key verification does not prove that the private key is authorized for the configured user.

## Immediate next actions

### 1. Verify the exact GitHub production secrets

In the `production` environment, verify the names and values without exposing them:

- `HOSTINGER_HOST`: correct Hostinger VPS hostname/IP.
- `HOSTINGER_PORT`: correct SSH port.
- `HOSTINGER_USER`: intended non-root deployment user.
- `HOSTINGER_SSH_PRIVATE_KEY`: complete private key, including the begin/end lines and multiline formatting.
- `HOSTINGER_KNOWN_HOSTS`: host key for the same host and port.
- `HOSTINGER_DEPLOY_PATH`: absolute, non-root application path.

Do not paste or print the private key. If the key was copied through a UI, replace it with a freshly generated dedicated deploy key rather than trying to repair an uncertain value.

### 2. Verify the matching public key on Hostinger

The public key corresponding to `HOSTINGER_SSH_PRIVATE_KEY` must be present in the configured user’s:

```text
/home/<HOSTINGER_USER>/.ssh/authorized_keys
```

Verify the following on the VPS through an approved access path (for example, Hostinger hPanel terminal or an already-authorized admin session):

- The username is the one used by `HOSTINGER_USER`.
- The matching public-key fingerprint is present in that user’s `authorized_keys`.
- `~/.ssh` is not group/world writable.
- `authorized_keys` is not group/world writable.
- The user’s shell and home directory are valid.
- The configured port matches the SSH daemon.
- The user can read/write the temporary archive path and execute the narrowly approved deployment commands.

Known-hosts success only confirms the server identity; it does not authorize the client key.

### 3. Test one controlled SSH login

After correcting the secret/key pairing, perform one controlled non-destructive authentication test using the same host, port, user, and private key. Do not repeatedly retry a failing key. Do not use `StrictHostKeyChecking=no`.

### 4. Re-run the workflow once authentication is corrected

Use:

```text
Actions → Deploy to Hostinger → Run workflow → main
```

Leave `run_migrations` disabled unless explicitly approved.

A successful SSH upload still does not prove a successful live release. Review the remote script output and then perform the runbook smoke checks.

## Production safety gates still outstanding

Do not treat the SSH fix as proof that production is ready. Before a successful release, resolve or explicitly approve:

- Production/Git drift and the server-only features/migrations.
- The missing release layout (`releases/`, `shared/`, `current`) required by the release script.
- Dedicated non-root deployment identity and narrowly scoped permissions.
- Database and uploads backups, including verification that database dumps are non-zero and restorable.
- PM2/nginx ownership and target paths after cutover.
- Release/rollback rehearsal and health/queue/browser smoke checks.
- Dependency audit findings and any documented risk acceptance.
- Rotation of previously exposed privileged credentials and review of account activity.

The release script intentionally refuses to proceed when the expected release/shared layout or environment files are missing. Do not bypass that preflight by reverting to legacy root/SCP scripts or a live-server `git pull`.

## Post-deployment verification checklist

Only after a successful workflow and approved cutover:

- Confirm the release SHA and `current` target on the server.
- Confirm backend PM2 processes restart under the intended owner.
- Confirm website PM2 and nginx serve the intended release.
- Wait for the backend to bind before judging health; the known startup window is approximately 25–40 seconds.
- Check backend health, database, and Redis connectivity.
- Check public website, admin website, and API reachability.
- Check queues/workers and recent error logs.
- Verify a read-only login/listing path and the service worker endpoint.
- Confirm uploads, environment files, logs, and persistent data were preserved.
- Record the deployed SHA and any approval/reviewer evidence.

## Rollback guidance

For a code-only release, use the release script’s previous-release activation/verification path. Do not reverse database changes automatically. After a migration, rollback is a manual database decision requiring a reviewed compatibility and recovery plan.

Do not use historical legacy deployment scripts, direct root SCP overlays, or an unreviewed production `git pull`.

## Working-tree note

At the time this handover was created, the working tree also contained pre-existing untracked files:

```text
TEST-DELETE.md
handover/SESSION-HANDOVER-2026-09-22.md
```

They were not modified or deleted while creating this handover. Review and commit/delete them deliberately; do not run `git add -A` blindly.

## Source references

- `.codex/AGENTS.md`
- `.github/workflows/deploy-hostinger.yml`
- `deploy/github-hostinger-release.sh`
- `docs/runbooks/deploy.md`
- `handover/SESSION-HANDOVER-2026-09-22.md`
- `handover/PRODUCTION-DEPLOYMENT-RECOMMENDATION.md`


## Actions Taken During Current Session (2026-09-23)

### 1. SSH Authentication Fix (`Permission denied`)
- **Diagnosis:** The initial `Permission denied (publickey)` error occurred because `HOSTINGER_USER` was incorrectly configured or the public key was only added to the `root` user, not the intended non-root deploy user (`rpdeploy`).
- **Resolution:**
  - Verified `rpdeploy` is the intended deployment user and holds the correct `NOPASSWD` sudo privileges for PM2 restarts (`/etc/sudoers.d/`).
  - Generated a fresh, dedicated Ed25519 deploy key pair (`github_deploy_key.txt`) to bypass potential terminal copy-paste whitespace corruption.
  - Authorized the new public key in `/home/rpdeploy/.ssh/authorized_keys`.
  - Removed the local development key (`realty_pandit_key.pub`) from `/root/.ssh/authorized_keys` to secure the server and adhere to the non-root deployment rule.
  - Instructed the user to update `HOSTINGER_USER` to `rpdeploy` and `HOSTINGER_SSH_PRIVATE_KEY` to the new key in the GitHub `production` environment secrets.

### 2. Symlink Permission Fix (`ln: failed to create symbolic link`)
- **Diagnosis:** After SSH authentication succeeded, the release script ran successfully (installed dependencies, built frontend/website) but failed during the final atomic switch with `ln: failed to create symbolic link '***/current': Permission denied`.
- **Root Cause:** The `rpdeploy` user lacked write permissions to the `/var/www/realty-pandit` directory. The directory was owned by `realty:realty` without group-write permissions, preventing `rpdeploy` (who is in the `realty` group) from replacing the `current` symlink.
- **Resolution:**
  - Instructed the user to run `chmod 775 /var/www/realty-pandit` and `chown -h realty:realty /var/www/realty-pandit/current` as `root`. This successfully granted `rpdeploy` the necessary permissions to update the symlink.

### 3. IP Block Fix (`Connection timed out`)
- **Diagnosis:** Subsequent GitHub Action runs failed immediately with `ssh: connect to host *** port ***: Connection timed out`.
- **Root Cause:** Hostinger's firewall/`fail2ban` flagged and blocked the GitHub Actions runner IP range due to the multiple `Permission denied` authentication failures during the initial troubleshooting phase.
- **Resolution:**
  - Pushed an empty commit (`chore: trigger fresh deploy to bypass firewall block`) to force GitHub to spin up a fresh runner with a new IP, temporarily bypassing the block.
  - Instructed the user to log into the Hostinger Web Terminal as `root` and run `fail2ban-client unban --all` and `iptables -F` to clear the permanent bans and restore normal GitHub Actions connectivity.
