---
name: feedback_prod_backend_paths
description: pm2 runs realty-backend from /var/www/realty-pandit/backend/, NOT /var/www/realty-pandit/agents/backend/. The deploy script copies to the right place. Don't waste a session editing files in the agents/ mirror — pm2 won't see them. Also schema.prisma's em-dashes break `npx prisma generate` on prod (sed strip non-ASCII before generate).
metadata:
  type: feedback
---

Two operational gotchas burned ~15 min during the Phase 5 column-drop deploy:

**1. Active backend dir is `/var/www/realty-pandit/backend/`, not `…/agents/backend/`.**

`ecosystem.config.js` declares `cwd: "/var/www/realty-pandit/backend"` and pm2
runs `node_modules/.bin/ts-node --transpile-only src/server.ts` from there.
The deploy script (`agents/deployment/deploy-agent.js backend`) tarballs the
local `agents/backend/` and untars it to `/var/www/realty-pandit/backend/` —
NOT `/var/www/realty-pandit/agents/backend/`.

The `…/agents/backend/` directory also exists on prod but is a stale leftover.
Editing files there directly does nothing because pm2 doesn't see it. When
running an inline smoke / migration / `prisma generate` on prod, always `cd
/var/www/realty-pandit/backend/` first.

**How to apply:**
- Manual prod operations (migrate deploy, prisma generate, ad-hoc node scripts
   that `require` the active client): use `/var/www/realty-pandit/backend/`.
- `node_modules/@prisma/client` at `…/backend/node_modules/` is the one pm2
   loads — that's the path to require when writing prod smoke scripts.

**2. `npx prisma generate` chokes on em-dashes in schema.prisma comments.**

After the local schema is scp'd to prod, `prisma generate` errors with a bare
`Error: Invalid character` (no file, no line). It's choking on `—` / `–` (U+2014 /
U+2013) in comments — even though the rest of the schema is valid UTF-8 and
`prisma migrate deploy` accepts the same file without complaint.

Strip before generating on prod:

```bash
sed -i 's/—/-/g; s/–/-/g' /var/www/realty-pandit/backend/prisma/schema.prisma
# or aggressive:
perl -i -pe 's/[^\x00-\x7F]/-/g' /var/www/realty-pandit/backend/prisma/schema.prisma
npx prisma generate
```

This only matters when regenerating the prisma client AFTER a fresh schema
push to prod (which the deploy script does NOT do — it only ships source). If
your migration adds/removes columns, you MUST re-generate or runtime
`prisma.contact.findUnique({ select: { demand_taxonomy_node_id: true } })` will
throw `Unknown argument` even though the column exists in postgres.

**Sequence that works:**
```bash
# After deploy + migrate-deploy:
ssh realty-pandit "cd /var/www/realty-pandit/backend && \
  sed -i 's/—/-/g; s/–/-/g' prisma/schema.prisma && \
  cp .env.production .env && \
  npx prisma generate && \
  pm2 restart realty-backend"
```

Related: [[reference_test_tsc_baseline]] (the .env file holds the WRONG
DATABASE_URL — `admin` user is dev-only; prod uses `realty_user` from
`.env.production`), [[reference_demand_canonical_sot]] for the Phase 5 case
that triggered all this.

**3. Direct-file deploy workflow (no deploy-script) — used heavily 2026-05-30/31.**
The server `src/` IS what runs and is **NOT git-tracked** (`git rev-parse` → "not a git
repository"). For surgical changes, scp individual files rather than the deploy script:
- **ALWAYS md5-parity-check first** (`md5sum` server file vs local `Get-FileHash -Algorithm MD5`)
  before overwriting — confirms local==server so you don't clobber server-only edits. Back up
  the original (`cp …/file /root/backups/…`) before scp.
- **Backend = ts-node `--transpile-only` on `src/`** (`server-bootstrap.js` → `require("ts-node").register({transpileOnly:true}); require("./src/server.ts")`). So: **type errors do NOT crash runtime** (the 384-error tsc baseline runs fine); only **syntax errors** crash on module load. **No build step** — scp the `.ts` then `pm2 restart realty-backend`; the change is live. (`dist/` is only for ad-hoc `require("./dist/db")` scripts.) To check you added no NEW type errors: diff `npx tsc --noEmit` message-set vs the backed-up original (line numbers shift; compare messages).
- **Frontend = `tsc -b && vite build`** and **`tsc -b` is STRICT with a CLEAN baseline (exit 0)** —
  so any new `.tsx` MUST be fully type-clean or the build fails (unused imports/vars error too —
  remove them). Served statically by `serve -s dist` (pm2 `realty-admin`), picked up live, no restart.
- **PWA stale-bundle (recurring friction):** vite-plugin-pwa precaches the shell; after a build the
  new SW shows "New version installed. Refresh when ready" but **keeps serving the OLD bundle** until
  activated. Users (incl. the client) report "I don't see the new feature" → tell them
  **hard-refresh (Ctrl+Shift+R)** or close+reopen; to force in a Playwright/QA session,
  `navigator.serviceWorker.getRegistrations()→unregister()` + `caches.keys()→delete()` then reload.
  See [[feedback_pwa_deploy]] / [[feedback_pwa_networkonly]].
