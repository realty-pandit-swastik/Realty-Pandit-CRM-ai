# Deployment Runbook

## What deploys where

| Component | Local path | Server path | PM2 process |
|---|---|---|---|
| Frontend (admin panel) | `frontend/` | `/var/www/realty-pandit/frontend/` | `realty-admin` |
| Backend (API) | `backend/` | `/var/www/realty-pandit/backend/` | `realty-backend` |
| Website (public) | `website/` | `/var/www/realty-pandit/website/` | `realty-website` |

**Server:** `root@72.62.231.224`
**SSH key:** `C:/Users/VARCHA~1/AppData/Local/Temp/rp_key` (auto-loaded by deploy script)

## Deploy command

From `clients/sunny-sharma/projects/reality-pandit/agents/`:

```bash
node deployment/deploy-agent.js <component>
# <component> = website | backend | frontend | all
```

Flags:
- `--skip-build` — upload only, skip build step
- `--skip-verify` — skip post-deploy browser QA
- `--dry-run` — show commands without executing

The script: (1) tars source, (2) SCPs to /tmp, (3) extracts to server path, (4) `npm install`, (5) builds (`npx tsc` for backend, `npm run build` for frontend), (6) `pm2 restart`, (7) Browser QA verification.

## ⚠ Critical: nginx serving paths

`admin.realtypandit.in` is served from `/var/www/realty-pandit/frontend/dist/` — NOT `/var/www/html/`. Uploading to the wrong path is a common mistake when bypassing the deploy script. **Always use the deploy script.**

## ⚠ Critical: PWA cache invalidation

The frontend uses Vite Plugin PWA with `registerType: 'autoUpdate'`. The service worker only auto-installs a new version when its content (the workbox precache manifest) changes. If `index.html` and chunks all keep the same hashes, the SW never refreshes and PWA users see stale UI.

**Force-refresh trick:** bump a comment in `frontend/index.html`:
```html
<title>Realty Pandit - Dashboard</title>
<!-- v20260509 -->
```

Change the date stamp on any non-cosmetic frontend change. This changes the precache manifest revision → new `sw.js` → browsers auto-update. Re-run the deploy.

See: [`pwa-cache-bust.md`](pwa-cache-bust.md) for the full mechanism.

## Post-deploy verification

The deploy script runs `browser-qa/qa-agent.js` automatically. To re-run manually:
```bash
node browser-qa/task-verify.js --last
```

For UI verification, open `https://admin.realtypandit.in` in the Playwright MCP browser tools (configured in your session). Screenshot before + after the change.

## Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Deploy succeeds, UI still old | Browser SW cache; force-bump `index.html` comment | See PWA section above |
| Backend pm2 process keeps crashing | Prisma schema mismatch with DB | `npx prisma generate` on server; check migration state |
| Frontend build OK locally, fails on server | Different Node version (server is v20) | Verify `node -v` on server; align local |
| Browser QA reports 401s in console | GA analytics CSP — not a real failure | Ignore the GA-related 401s |
