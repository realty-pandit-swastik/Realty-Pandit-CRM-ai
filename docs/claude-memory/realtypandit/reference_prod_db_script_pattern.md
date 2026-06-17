---
name: Running prod DB scripts/queries reliably (avoid SSH quote-mangling)
description: The reliable way to run ad-hoc prod DB logic — Node+Prisma from the backend dir using ./dist/db — and why nested-SSH psql/timestamp literals keep breaking.
metadata:
  type: reference
---

Recurring time-sink this session: deeply nested SSH single-quote escaping
(`'"'"'`) around `psql -c` SQL, `TIMESTAMPTZ '...'` literals, and
`$queryRawUnsafe` regex strings **silently corrupts the command** — wrong
timestamps stored, `syntax error at or near ","`, etc. Hit it 3+ times.

**Reliable pattern for ad-hoc prod data work** (verification, backfill, merge):

1. Write a Node script via a quoted heredoc INTO the backend dir, run it there:
   ```
   ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'cd /var/www/realty-pandit/backend && cat > rp_tmp.js <<"EOF"
   const prisma = require("./dist/db").default;   // NOT ts-node, NOT /tmp
   ... use prisma.* methods; for raw use $executeRawUnsafe(`... $1 ...`, val) ...
   EOF
   timeout 60 node rp_tmp.js; rm -f rp_tmp.js'
   ```
   - `require("./dist/db")` works because `npx tsc` emits `dist/` on deploy.
     `/tmp/x.js` + `ts-node/register` FAILS (module resolution from /tmp).
   - Prefer Prisma model methods (`findMany({where:{phone_number:{in:[...]}}})`)
     over raw SQL — no quoting, no regex-in-shell.
   - For unavoidable raw: `$executeRawUnsafe(\`UPDATE "t" SET "c"=$1 WHERE "c"=$2\`, a, b)`
     — parameters, never string-interpolate values through the shell.
   - Dates: `new Date("2026-05-17T03:30:00.000Z")` in JS, not a SQL literal.

2. Read-only `psql` is fine for quick counts, but get DSN with
   `grep ^DATABASE_URL= .env | cut -d= -f2-` then strip `?params`:
   `DB="${DB%%\?*}"` (psql rejects `connection_limit`). Never `source .env`
   (unquoted PEM breaks bash — see [[reference_meta_webhooks_live]]).

3. Always: `pg_dump` affected tables before a mutation; wrap multi-table
   merges in `prisma.$transaction` (atomic — a missed FK rolls back cleanly);
   `rm` the temp script after.

Contact merges specifically: repoint ALL contact FKs — see
[[feedback_lead_assignment_dedup]] (23 columns; enumerate via
information_schema, prune the 1:1 unique ones).
