---
name: PWA Deploy & Permissions Lessons
description: Critical lessons from the 2026-04-12 PWA redesign — deploy path, permissions architecture, migration tracking
type: feedback
---

# Deploy & Architecture Lessons — 2026-04-12

## Rule: Frontend deploy goes to `/var/www/realty-pandit/frontend/dist/`

NOT `/home/realty/admin-panel/dist/` — both directories exist but PM2 `realty-admin` serves from `/var/www/realty-pandit/frontend/dist/`.

**Why:** Early in the session a subagent deployed to the wrong path. Always verify with: `pm2 show realty-admin | grep script`

**How to apply:** Every frontend deploy, use:
```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 "rm -rf /var/www/realty-pandit/frontend/dist"
scp -i ~/.ssh/realty_pandit_key -r dist root@72.62.231.224:/var/www/realty-pandit/frontend/
pm2 restart realty-admin
```

---

## Rule: Backend permissions are code-based, not DB-based

`backend/src/config/permissions.ts` contains the RBAC matrix. The `agents` table has NO permissions column. `/auth/me` calls `getAllPermissions(agent.role)` from this file.

**Why:** Investigation found employee role had `manage_agents` hardcoded in the permissions array — every employee got Team section access. Fix was a 1-line deletion in the file + scp + pm2 restart.

**How to apply:** When diagnosing permission issues, check `permissions.ts` first before looking at the DB.

---

## Rule: Backend has no build step — scp TypeScript files directly

No `npm run build` exists. Backend runs `ts-node src/server.ts`. Deploy = `scp` the changed `.ts` file + `pm2 restart realty-backend`.

**Why:** Tried `npm run build` in session, got "Missing script: build". The backend uses ts-node in production.

---

## Rule: Check `_prisma_migrations` before running any migration SQL manually

`prisma migrate resolve --applied <name>` marks a migration as done without re-running SQL. Use this when schema changes were applied manually but not tracked.

**Why:** `20260411_contact_refactor` SQL was already in DB but not in `_prisma_migrations`. Running the SQL again would have failed (IF NOT EXISTS guards help, but data seed would duplicate). The correct fix was `migrate resolve`.

**How to apply:** Always run `prisma migrate status` before touching the DB to understand what Prisma thinks vs reality.
