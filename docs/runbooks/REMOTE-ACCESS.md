# Remote Access & Working Reference

How to access and work on RealtyPandit from a fresh machine (e.g. a cloud VS Code box).
This file travels with git, so once the repo is cloned it's available everywhere. Secrets
(SSH private key, DB password, `.env` files) are **not** in git — carry them separately.

## 0. What you must carry over (not in git)
| Item | Source | Move it via | Secret |
|---|---|---|---|
| SSH private key | `~/.ssh/realty_pandit_key` | secure file copy (never paste into chat/logs) | YES |
| Local `.env` files | `agents/backend/.env`, `agents/website/.env` | secure copy (only needed for a local DB tunnel) | YES |
| Claude memory (optional) | `~/.claude/projects/…/memory/` + workspace `CLAUDE.md` | copy folders | partly |
| DB password | server `.env` only | nothing — server-side scripts read it automatically | YES |

## 1. SSH
`~/.ssh/config`:
```sshconfig
Host realty-pandit
    HostName 72.62.231.224
    User root
    IdentityFile ~/.ssh/realty_pandit_key
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
```
```bash
chmod 600 ~/.ssh/realty_pandit_key
ssh realty-pandit "hostname && whoami"   # connection test
```
The deploy script also expects a copy of the key at a Windows temp path (`%LOCALAPPDATA%\Temp\rp_key`).
On a non-Windows box, edit `agents/deployment/deploy-agent.js` to use `~/.ssh/realty_pandit_key`.

## 2. Server topology
```
Server:   root@72.62.231.224   (key auth)
Web root: /var/www/realty-pandit/{backend, website, frontend}
DB:       Postgres @ localhost:5432  db "reality_pandit"  user "admin"  (pw in server .env)
Backups:  /root/backups/

pm2:
  realty-backend  → /var/www/realty-pandit/backend   ROOT    (cluster, server-bootstrap.js)
  realty-website  → /var/www/realty-pandit/website   realty  (next start)   ← NOT root
  realty-admin    → /var/www/realty-pandit/frontend  realty  (admin panel)

URLs: realtypandit.in · admin.realtypandit.in · api.realtypandit.in
```

## 3. Install (after clone)
```bash
cd agents/backend  && npm install && npx prisma generate
cd ../website      && npm install
cd ../frontend     && npm install
```
Drop the `.env` files into `agents/backend/` and `agents/website/`.

## 4. Deploy
```bash
cd agents
node deployment/deploy-agent.js <backend|website|frontend|all> [--skip-build] [--skip-verify] [--dry-run]
```
**Website pm2 restart fails** (script runs as root; the process is owned by `realty`). Finish manually:
```bash
ssh realty-pandit "chown -R realty:realty /var/www/realty-pandit/website/.next && \
  sudo -u realty -H pm2 restart realty-website"
```
After a frontend/website deploy, hard-refresh **Ctrl+Shift+R twice** (PWA service-worker swap).

## 5. Database (verify / read prod)
Preferred — run a Node script **on the server** (uses server Prisma + `.env`):
```bash
cat myscript.js | ssh realty-pandit \
  "cat > /var/www/realty-pandit/backend/_tmp.js && \
   cd /var/www/realty-pandit/backend && node _tmp.js; rm -f _tmp.js"
```
Optional local tunnel (only if local `.env` creds are valid): `ssh -f -N -L 5433:localhost:5432 realty-pandit`.
**Back up before any bulk write:**
```bash
ssh realty-pandit "cd /var/www/realty-pandit/backend; \
  DBURL=\$(grep '^DATABASE_URL' .env | cut -d'\"' -f2); \
  pg_dump \"\${DBURL%%\?*}\" | gzip > /root/backups/db-\$(date +%Y%m%d-%H%M%S).sql.gz"
```
File transfer when `scp` resets: `base64 -w0 localfile | ssh realty-pandit "base64 -d > /remote/path"`.

## 6. Repo layout & worktrees
```
reality-pandit/                         integration branch: feature/contact-system-refactor
├── agents/{backend,website,frontend}/
├── agents/deployment/deploy-agent.js
└── docs/                               source of truth (PROJECT_STATUS.md wins on conflicts)
rp-worktrees/{backend,frontend,website} worktrees on wt/backend, wt/frontend, wt/website
```
Flow: edit in a `wt/*` worktree → commit → merge into `feature/contact-system-refactor` → deploy.

## 7. Knowledge layers
- **In-repo `docs/`** (this folder) = authoritative, travels with git: `PROJECT_STATUS.md` (read first),
  `architecture/`, `decisions/`, `plans/`, `runbooks/`, `precautions/`, `backlog/`.
- **Claude-side memory** = machine-local, NOT in git: `~/.claude/projects/…-sunny-sharma/memory/`
  (`MEMORY.md` index + reference_/feedback_ notes) and the workspace `CLAUDE.md`. Copy these for continuity.

## 8. Top gotchas
- 3-mode protocol: Discuss → Plan → Execute; never auto write/deploy/DB-write without explicit "go".
- Website runs as `realty`, not root (§4).
- Next 16: in-page `redirect()`/`permanentRedirect()` renders a 200 shell under streaming —
  canonical redirects live in `agents/website/src/middleware.ts`.
- Backend `tsc` has a large pre-existing Zod-v4 error baseline; the deploy tolerates it. Judge only NEW errors.
- Bad data in a listing is the owner's to fix — surface, don't silently edit.
- Always back up the DB before bulk writes; verify by running the app/server-side script, not by trusting the diff.
