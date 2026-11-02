# Contact designation migration — isolated rehearsal proof

## Result: PASS — 2026-10-26

**Historical evidence:** the migration and rollback SQL were subsequently modified to add
target/approval, advisory-lock and data-loss guardrails. This proof applies only to the hashes
below, not to the current SQL. A fresh rehearsal of the current bytes and encrypted off-server
backup verification are required before production execution.

The user authorized an isolated migration rehearsal. The verified production archive was
restored into a disposable PostgreSQL database on the VPS. The exact fix-dev migration and
rollback SQL were executed there, then the database and its temporary owner role were removed.
Production application configuration, schema and business records were not migrated or repaired.

## Inputs and evidence

- Feature worktree: `fix-dev`, baseline a663130; implementation remains uncommitted.
- Backup: `/root/backups/contact-roles-prechange-20261026T092202Z/reality_pandit.dump`.
- Backup size: 24,388,861 bytes.
- Backup SHA-256: `115b91f7eb32195225faf186f67573a72516dc5a98c4a4d1ea3ff7562e17bf4c`.
- Migration: `agents/backend/prisma/migrations/20261026093000_property_contact_designations/migration.sql`.
- Exact migration SHA-256: `9c85dd1737004d166d46a2b793ae1653785d4f31a891ca5cc85e56665419e5c4`.
- Rollback: `docs/agent/contact-roles-rollback.sql`.
- Exact rollback SHA-256: `59ac6cef2144a72d077b43d4a86aadbcc2b7690e6a79c9284fb20d9490b161b1`.
- PostgreSQL/pg_restore version: 16.15.
- Rehearsal started: `2026-10-26T16:05:34.232Z`.
- Rehearsal and cleanup completed: `2026-10-26T16:06:30.732Z`.
- Independent verification completed: `2026-10-26T16:08:37.339Z`.

Private evidence directory on the VPS:

```
/root/backups/contact-roles-prechange-20261026T092202Z/rehearsal-20261026160534_822951/
```

It retains `rehearsal-proof.json`, `verification-receipt.json`, and the exact `migration.sql` /
`rollback.sql` copies. JSON evidence was parsed again successfully; files are mode 0600 and
the containing directory is 0700. The proof file's independently recorded SHA-256 is
`413d7831e1ff1a51bf8d22e8d3314355819ef8a3018543573b486908eb834db2`.

## Isolation and restore

- Approximately 19.6 GB free was verified against a minimum requirement of 1.71 GB.
- A unique database and unique non-login owner role were created. The owner was verified
  non-superuser, without CREATEDB or CREATEROLE; PUBLIC database privileges were revoked.
- The restore used a Unix-socket administrator connection with `pg_restore --role` switching
  object creation to the restricted owner. No production application credential was needed.
- Restore flags included `--exit-on-error --single-transaction --no-owner --no-acl --no-comments
  --no-tablespaces`. Crucially, **no --create or --clean** was used: pg_restore could not redirect
  the restore into the database name embedded in the archive.
- Database-level DDL was checked absent from the default schema restore output. The empty
  scratch public schema was removed only because this archive explicitly recreates it.
- Database encoding/collation/provider matched the production database metadata.
- No application, worker, scheduler or provider integration was started against the copy.

Restored **104 public tables**, including:

| Table | Restored rows |
|---|---:|
| contacts | 7,174 |
| inventory | 1,057 |
| transactions | 6,966 |

These are backup-snapshot counts, not a claim about current live-directory totals.

## Migration, rollback and reapply

All mutation commands asserted the exact scratch database and restricted current role first.
The SQL payload hashes were checked against both the local files and saved evidence copies.

| Check | Result |
|---|---|
| Full archive restore | PASS; all 104 public tables restored |
| Baseline new designation/label columns | Absent |
| Exact forward SQL | PASS; all seven expected columns exist as nullable TEXT with no defaults |
| Implicit data backfill | None; new columns remain NULL on restored rows |
| Table counts after forward migration | Unchanged across all 104 tables |
| Existing contacts/inventory/transactions data | Deterministic row fingerprints unchanged |
| New-column write probes | PASS in all three target tables; probe transaction rolled back |
| Non-internal target-table triggers | None; no trigger side effects during probes |
| Exact rollback SQL | PASS; seven columns removed and baseline column-schema fingerprint restored |
| Counts/data fingerprints after rollback | Unchanged |
| Forward SQL reapplied after rollback | PASS; expected columns/nulls, counts and fingerprints verified again |
| Original archive after rehearsal | Same SHA-256 |
| Production new-column metadata | Unchanged; independently queried count remains zero |
| Scratch database and owner role cleanup | Both independently confirmed absent |

Existing-row fingerprints exclude only the seven added fields, so they compare the original
business values before/after DDL without exporting row contents into the report. Row-count
checks cover every restored table. Full counts/fingerprints are retained in the private proof.

## Remaining release gates

- This verifies the SQL and backup restoration, not an authenticated feature/API smoke test
  against the copied database. No application was launched using copied customer data.
- No Prisma migration-history entry was added: the rehearsal deliberately executed the exact
  SQL payloads, not an unrestricted `prisma migrate deploy` over historical pending migrations.
- The production migration, guarded application deployment and live smoke require separate
  approval and fresh operational preflight. Confirm pending migration history first.
- The 155 proposed referral unlinks and nine unresolved owner identities remain unchanged and
  separately gated. Migration rehearsal is not approval to execute the data repair plan.
- Restoring the full production archive is not a normal application rollback. Application
  rollback can leave nullable columns in place; dropping populated new fields requires an
  explicit decision about preserving their newly entered values.
