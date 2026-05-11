# Deployment Gotchas

These have all bitten us at least once. Read before deploying.

## Gotcha 1: Wrong nginx path

`admin.realtypandit.in` serves from `/var/www/realty-pandit/frontend/dist/` — NOT `/var/www/html/` and NOT `/home/realty/admin-panel/dist/`. Both wrong paths exist on the server (legacy). Uploading there does nothing visible.

**How to apply:** Always use `deploy-agent.js`. If you must SCP manually, confirm with `pm2 show realty-admin | grep script` first.

## Gotcha 2: Server build hash ≠ local build hash

Even with identical source, `npm run build` on the server can emit different chunk filenames than your local build (different Node minor version, different filesystem ordering of imports). This causes `index-XXXX.js` references in `sw.js` to mismatch between server and any locally-built `dist/` you might upload.

**How to apply:** Don't ship a locally-built `dist/`. The deploy script uploads source + builds on the server, so `sw.js` references match. If you bypass the script, you must build on the server.

## Gotcha 3: Backend has no `npm run build`

Backend runs via `ts-node` in production. There is no `dist/` step. Deploy = SCP the changed `.ts` file + `pm2 restart realty-backend`.

**Why:** Saves a TypeScript compile step. The deploy script handles this via `npx tsc` (typecheck only, no emit).

## Gotcha 4: Prisma client cache in PM2

If you add a new column via migration, then PM2-managed processes may continue to reject the new field with "Unknown argument `<field>`" even after `pm2 restart` + `npx prisma generate` on the server. (Happened with `owning_manager_id` on 2026-04-17.) Root cause never fully identified — possibly module cache held by systemd at a level we can't reach via SSH.

**Workaround:** Insert without the new field via the Prisma model, then backfill via `$executeRaw UPDATE`. Safe because the column exists in the DB.

## Gotcha 5: Service worker doesn't auto-update if precache manifest unchanged

Frontend deploy can succeed and PWA users still see old code. Cause: SW only refreshes when the workbox manifest revision changes. If your change didn't alter `index.html` content, the manifest is identical.

**How to apply:** Bump the `<!-- v20260509 -->` comment in `frontend/index.html` on any user-facing change. See [`../runbooks/pwa-cache-bust.md`](../runbooks/pwa-cache-bust.md).

## Gotcha 6: GA console errors are not real failures

Browser QA flags "Failed to load resource: 401" for `google-analytics.com/g/collect` URLs. These are CSP-blocked GA pings — not app errors. Ignore them in QA results. Filter for non-GA errors when reviewing.
