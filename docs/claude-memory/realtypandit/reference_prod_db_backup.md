---
name: Prod DB backup recipe (before any data migration/cleanup) — strip ?connection_limit for pg_dump/psql
description: Puneet requires a backup before risky data changes. pg_dump/psql reject Prisma's DATABASE_URL query params; strip them. Plus instant-rollback snapshot tables.
metadata:
  type: reference
---

Before any prod data migration/cleanup (field-catalog edits, media changes, dedup, etc.) take BOTH a logical dump and snapshot tables. Run as a `.sh` scp'd to prod (avoids PowerShell→bash nested-quote hell).

**Gotcha:** the backend `.env` `DATABASE_URL` carries Prisma-only query params (`?connection_limit=…`) that **`pg_dump`/`psql` reject** (`invalid URI query parameter`). Strip everything from `?` onward:
```bash
cd /var/www/realty-pandit/backend
DBURL_RAW=$(grep -E "^DATABASE_URL=" .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
DBURL="${DBURL_RAW%%\?*}"          # <-- strips ?connection_limit=...
mkdir -p /root/backups
pg_dump "$DBURL" | gzip > /root/backups/db-pre-<change>-$(date +%Y%m%d-%H%M%S).sql.gz
# instant-rollback snapshot tables (underscore timestamp — NO dashes, they break SQL identifiers):
T="bak_$(date +%Y%m%d_%H%M%S)"
psql "$DBURL" -c "CREATE TABLE inventory_$T AS SELECT * FROM inventory;"
psql "$DBURL" -c "CREATE TABLE field_definitions_$T AS SELECT * FROM field_definitions;"
psql "$DBURL" -c "CREATE TABLE node_fields_$T AS SELECT * FROM node_fields;"
```
Restore = `INSERT INTO <table> SELECT * FROM <table>_bak_*` (after TRUNCATE) or `psql < gunzip dump`. The deploy-agent backs up CODE only, never DATA — this is separate and essential. SSH key: `~/.ssh/realty_pandit_key`, root@72.62.231.224.