# Production deployment runbook

Production deploys only from the protected GitHub Actions workflow at
`.github/workflows/deploy-hostinger.yml`. Do not use the legacy SCP deploy agent or
run `git pull` in production.

## One-time VPS cutover

Complete this under an approved maintenance window before enabling
`HOSTINGER_GITHUB_DEPLOY_ENABLED`:

1. Reconcile nginx and PM2 so they use `/var/www/realty-pandit/current`.
   `realty-backend` runs in root PM2, `realty-website` runs in the `realty` user's
   PM2, and nginx serves admin files from `current/frontend/dist`.
2. Replace the legacy PM2 entries once with the versioned configs after `current`
   points at the initial release:

   ```bash
   cd /var/www/realty-pandit/current/backend
   pm2 delete realty-backend
   HOSTINGER_DEPLOY_PATH=/var/www/realty-pandit pm2 start ecosystem.config.js
   pm2 save

   sudo -u realty -H bash -lc 'cd /var/www/realty-pandit/current/website && \
     HOSTINGER_DEPLOY_PATH=/var/www/realty-pandit pm2 delete realty-website; \
     HOSTINGER_DEPLOY_PATH=/var/www/realty-pandit pm2 start ecosystem.config.js; pm2 save'
   ```
3. Create a non-root deploy identity with narrowly scoped passwordless sudo for
   `pm2 reload realty-backend --update-env` as root and
   `sudo -u realty -H pm2 restart realty-website`. Do not grant a general root shell.
4. Create these persistent paths with least-privilege ownership:

   ```text
   /var/www/realty-pandit/
   |-- releases/
   |-- shared/
   |   |-- backend.env
   |   |-- website.env
   |   |-- uploads/
   |   `-- logs/
   `-- current -> releases/<sha>/
   ```

5. Take and verify database and uploads backups, then restore them into an isolated
   test target. Create a Hostinger snapshot for disaster recovery.
6. Configure GitHub's protected `production` environment with a required reviewer,
   protected-main restriction, and the secrets listed in the deployment assessment.
7. Rehearse one deployment and one rollback, then enable
   `HOSTINGER_GITHUB_DEPLOY_ENABLED`.

## Release

Merge a reviewed PR to `main`. The workflow tests, lints, builds, audits production
dependencies, packages the exact Git SHA, builds it under `releases/<sha>`, switches
`current` atomically, restarts services, verifies all three local endpoints, and
keeps at least three releases.

Keep `run_migrations=false` unless the approved revision contains a reviewed,
backward-compatible migration and a fresh restore-tested backup exists. Migration
rollback is intentionally manual.

## Verify

Confirm the deployed `current/REVISION` equals the approved SHA, both PM2 owners are
stable, PostgreSQL and Redis are connected, BullMQ failed counts do not increase,
only one scheduler owns recurring jobs, logs are clean, and disk/memory are healthy.
Then smoke-test the public site, property data, admin login/read-only screens, and
`admin.realtypandit.in/sw.js`. Do not trigger real provider sends.

## Roll back

Without a database migration, run the release script on the VPS with the previous
SHA and repeat all verification:

```bash
HOSTINGER_DEPLOY_PATH=/var/www/realty-pandit \
  bash /tmp/github-hostinger-release.sh rollback _ <previous-sha> 0
```

After a migration, stop and make a reviewed database decision; never automatically
reverse SQL or overwrite newer production data.
