---
name: reference-admin-frontend-deploy-path
description: Correct scp deploy target for Realty Pandit admin frontend on prod server
metadata:
  type: reference
---

Realty Pandit admin (admin.realtypandit.in) nginx document root is:

`/var/www/realty-pandit/frontend/dist/`

NOT `/var/www/admin.realtypandit.in/` — that directory exists but is unused.

**Why:** nginx site config at `/etc/nginx/sites-enabled/admin.realtypandit.in` line 8 sets `root /var/www/realty-pandit/frontend/dist;`. Deploying to the wrong path silently succeeds — the old bundle keeps being served, browser shows stale UI, and grep on the wrong dir falsely "confirms" the deploy.

**How to apply:** When scp-ing the Vite `dist/` to prod, target `/var/www/realty-pandit/frontend/dist/`. To verify a deploy actually went live, `curl -s https://admin.realtypandit.in/?bust=$(date +%s) | grep -o 'index-[A-Za-z0-9_-]*\.js'` and confirm it matches the local `dist/assets/index-*.js` filename.
