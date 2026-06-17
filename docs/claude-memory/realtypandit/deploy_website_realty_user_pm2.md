---
name: deploy_website_realty_user_pm2
description: realtypandit.in public WEBSITE runs under the `realty` user's PM2 (pm2-realty.service → realty-website :3000), NOT root PM2 — the deploy script's `pm2 restart realty-website` fails after a successful build; restart it manually as the realty user
metadata:
  type: reference
---

The public website (https://realtypandit.in / https://www.realtypandit.in — Next.js, nginx proxies to
`127.0.0.1:3000`) is run by the **`realty` user's PM2 instance** (systemd unit `pm2-realty.service`),
process **`realty-website`** (id 0). **Root's PM2** only has `realty-admin`, `realty-backend` (×2 cluster),
`panditji-voice`, `pm2-logrotate` — there is **no website process under root**.

**The gotcha:** `deployment/deploy-agent.js` (and the `realty-pandit-qa` **`deploy website`** MCP) finish with
`ssh root@… "pm2 restart realty-website"`, which queries ROOT's PM2 →
`[PM2][ERROR] Process or Namespace realty-website not found` → the deploy reports **FAILED**. But that's the
LAST step: Steps 1–3 (scp, `npm install`, `npm run build` → `.next`) already succeeded, so the new build **is
on disk** — only the restart didn't fire.

**Recover after a "failed" website deploy** (build already done — do NOT re-run the whole deploy):
```
ssh -i <rp_key> root@72.62.231.224 "sudo -u realty -H pm2 restart realty-website"
```
Verify: `curl -s -o /dev/null -w '%{http_code}' https://www.realtypandit.in/` → 200; and
`sudo -u realty -H pm2 list` shows `realty-website` online with a fresh uptime. Confirm the build is fresh via
`stat -c '%y' /var/www/realty-pandit/website/.next/BUILD_ID` and grep your new strings in
`/var/www/realty-pandit/website/.next/static/chunks/`.

**Permanent fix (do once):** change the deploy script's website restart to
`sudo -u realty -H pm2 restart realty-website` (or document it in the deploy runbook). The `realty` user's PM2
also runs its own `realty-admin` + `realty-backend` alongside root's — a pre-existing dual-PM2 setup; leave it.

Server `root@72.62.231.224`, key `C:/Users/VARCHA~1/AppData/Local/Temp/rp_key`. Discovered 2026-06-07 while
deploying the partner multi-lead / direct-client approval-workflow website changes. See the [[deploy]] runbook.
