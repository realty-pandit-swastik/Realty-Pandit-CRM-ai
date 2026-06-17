---
name: Frontend build = tsc -b && vite build — verify it (not tsc --noEmit); deploy masks failures → dist wiped → 404 outage
description: The admin frontend deploy can take the whole site down because deploy-agent rm -rf dist then runs a build whose failure it hides; tsc --noEmit does not catch tsc -b errors.
metadata:
  type: feedback
---

**Caused a ~25-min admin.realtypandit.in OUTAGE (404) on 2026-05-24.** Root cause chain — memorize all three links:

1. **The frontend build is `tsc -b && vite build`** (see `frontend/package.json` `"build"`). `tsc -b` is **build/project-reference mode** and catches errors that **`tsc --noEmit` does NOT** (e.g. a `showToast` prop typed `(m,t?:string)` vs the real `ToastType` in `PropertyTaxonomy.tsx` — `--noEmit` reported CLEAN, `tsc -b` failed). **My per-file `npx tsc --noEmit | grep <file>` check is INSUFFICIENT for frontend.**
2. **`deploy-agent.js` runs `rm -rf dist` BEFORE the build, and pipes `npm run build 2>&1 | tail -20`** — so a failed build leaves `dist` **empty** AND the deploy still prints **"frontend: SUCCESS"** (tail's exit code masks the failure). A fast build duration (~26s vs the normal ~40s) is a tell that it failed.
3. **nginx serves the admin as STATIC files from `/var/www/realty-pandit/frontend/dist`** (`root … /dist; try_files $uri /index.html`). Empty dist → **404 Not Found (nginx)** for the entire admin SPA. (`realty-admin` pm2 being "online" is irrelevant — nginx serves the files, not pm2.)

**ALWAYS do, for any frontend change:**
- Before deploy: verify with **`cd frontend && npm run build`** (or `npx tsc -b`), NOT just `tsc --noEmit`. Confirm it exits 0 and emits `dist/index.html`.
- After every frontend deploy: **verify the site is up** — `curl -s -o /dev/null -w "%{http_code}" https://admin.realtypandit.in/` must be **200**, and/or `ls /var/www/realty-pandit/frontend/dist/index.html` exists. Do NOT trust the deploy's "SUCCESS".
- Fast restore if dist is empty: `scp` the fixed source file up + `ssh … 'cd /var/www/realty-pandit/frontend && npm run build'` (rebuilds dist in place; see build output unmasked). There is **no dist backup** (deploy backs up `frontend/src` only), so the only fix is to make the build pass and rebuild.

Relates to [feedback_verify_before_done] and [feedback_pwa_deploy]. Consider proposing a deploy-agent fix that fails the deploy when the build errors / dist is missing.
