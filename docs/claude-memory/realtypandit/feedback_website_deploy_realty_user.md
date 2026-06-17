---
name: Website (realty-website) deploy — pm2 runs under the `realty` user, deploy-agent restarts as root → "not found"
description: deploy-agent.js website step fails the pm2 restart because realty-website lives under the realty user's pm2, not root's; also .next is built as root and must be chowned to realty.
metadata:
  type: feedback
---

Deploying the public website (`agents/website`, the Next.js `/post-property` etc.) via `node deployment/deploy-agent.js website --skip-verify` **uploads + `npm run build`s fine but FAILS at the pm2 restart**: `[PM2][ERROR] Process or Namespace realty-website not found`. Root cause: the deploy runs `pm2 restart realty-website` as **root**, but `realty-website` (id 0, the `next-server` on 127.0.0.1:3000 behind nginx for www.realtypandit.in) runs under the **`realty` user's** pm2 (there's a `pm2-realty.service` systemd unit). Root's pm2 only has realty-admin + realty-backend (cluster) + panditji-voice + pm2-logrotate.

**Manual completion after a website deploy (until deploy-agent is fixed):**
```
ssh root@72.62.231.224
# the build ran as root → .next is root-owned; the server runs as realty → fix perms:
chown -R realty:realty /var/www/realty-pandit/website/.next
su - realty -c 'pm2 restart realty-website --update-env'
```
Then verify (never trust deploy SUCCESS, per [[feedback_frontend_build_verify]]): `curl https://www.realtypandit.in/post-property` → 200, and `ls /var/www/realty-pandit/website/.next/BUILD_ID`. The backend (realty-backend) and admin are under root's pm2 and restart fine — this only bites the website.

Backend deploys are unaffected (realty-backend restart as root works). Consider fixing `deploy-agent.js` website component to `su - realty -c 'pm2 restart realty-website'` + chown .next.

Separately (same session): the public `/post-property` chat had a **pre-existing** bug — `website/src/lib/chatApi.ts` uses a bare axios (no `withCredentials`/CSRF), so anonymous `/api/chat/start` 403'd for everyone. Fixed by adding `/api/chat/` to the CSRF-exempt list in `backend/src/middleware/csrf.ts` (it's an anonymous pre-login flow like `/public/`).