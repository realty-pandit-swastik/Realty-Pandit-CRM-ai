# Contact change: guarded release and repair

## Status and hard gates

This is local, uncommitted `fix-dev` work. It has not been installed on the VPS. No production
repair, schema migration, deployment or provider send has been performed by the guardrail work.

**The existing production backup and rehearsal are valuable but are not sufficient for this
guarded execution:** their v1 evidence does not bind the cluster/database/schema or an independently
verified encrypted off-server copy. The migration/rollback SQL was subsequently changed to add
target, lock and data-loss guards, so the earlier rehearsal is not proof of the current SQL bytes.
Create a fresh v2 backup, rehearse the current SQL against its isolated restore and independently
verify an encrypted off-server copy before seeking approval. If the approved off-server storage,
operator permissions or protected release layout are unavailable, stop; do not forge evidence.

## Failure modes covered

| Failure | Enforced behavior |
|---|---|
| Wrong database, cluster, database OID, replica or read-only target | Reject before writes; recheck inside the transaction |
| Stale/modified backup, missing restore proof, schema drift or missing off-server encrypted copy | Reject; backup/proof freshness is one hour and checksums bind exact bytes |
| Wrong release, stale worker, wrong DB endpoint, degraded DB/Redis or public inventory | Refuse activation / restore previous symlink; every known backend worker must be observed |
| Unreviewed / stale / duplicate / ambiguous rows, unknown owner or changed identities | Stop; approval must bind an exact v2 plan hash, tenant, target, revision and <=50 row IDs |
| Concurrent edit, DDL, unexpected triggers/rules/RLS, partial batch | Serializable transaction, bounded locks, full-row/identity rechecks, all-or-nothing writes |
| Crash or lost COMMIT acknowledgement | Durable 0600 journal before commit; unresolved intent/prepared journal blocks further operations until reviewed/reconciled |
| Unsafe undo | Explicit separate approval; all post-write row and linked-partner snapshots must match |
| Schema rollback loses new labels | Automatic downgrade only in a named disposable rehearsal DB; non-NULL values block it |
| Bad artifact, build/reload/verification failure | Exact committed SHA + archive hash, no unsafe tar members, disk checks; both attempted/previous releases retained after activation starts |

These are defense in depth, not a guarantee against every incident. A privileged operator with
direct database/shell access can bypass the tools; enforce OS/database access and protected
GitHub production-environment approval separately. The filesystem evidence is private but is not
cryptographically signed or independently trustworthy against a malicious operator with the same
OS privileges. Obtain independent human approval and off-server retention through your actual
organization's controls. Use a maintenance window where needed; health checks do not replace
authenticated business-flow smoke tests and queue/provider monitoring.

## Verification of the guardrails

- Linux/WSL: 60 Node guardrail, private-journal, lock and stubbed release-flow tests passed;
  seven malicious/valid archive tests passed; the release shell passed `bash -n`.
- A separate disposable PostgreSQL 16 cluster with **synthetic data only** exercised actual
  backup/restore, changed migration/rollback/reapply, expired approvals, advisory lock conflict,
  data-preserving rollback refusal, serializable repair, replay prevention and conflict-safe undo.
  Its synthetic cluster was confirmed distinct from production and its temporary files were removed.
- The synthetic offsite receipt was a test fixture, not evidence of a real encrypted off-server copy.
- Backend full run: 752 passed assertions, three skipped, zero failed assertions, but the unrelated
  Windows image-route suite still reports EPERM during fixture cleanup. Latest focused phone,
  identity, designation and tile checks: 35 passed. CRM build passed with a large-bundle warning.
  Backend no-emit typecheck retains 397 diagnostics vs 402 on its baseline, no new diagnostics in
  the same-environment comparison. Workflow YAML/manual-branch checks and `git diff --check` passed.
- Actual privileged production cutover, operator ACL/lock provisioning, off-server storage,
  authentication smoke, provider/queue observations and full restore after current SQL are not
  verified. These remain explicit production gates.

## Prerequisites and explicit operational ownership

1. Review and commit the exact code on `fix-dev`; promote only through the agreed protected
   release process. This repository's guarded production workflow accepts **manual dispatch on
   main only**, an exact full SHA and `DEPLOY_APPLICATION_ONLY`; automatic migration is blocked.
2. Verify actual nginx targets, all PM2 owners/worker identities, Git/server revision drift,
   provider/queue status, free space, backup freshness and restore capability. A server-only
   bootstrap must be reviewed and present in the committed artifact; deployment blocks if missing.
3. Provision the documented release/shared layout and a shared `.production-change.lock` that
   both the deploy account and the separately authorized database operator can open. Check owner,
   group, symlink safety and permissions manually; no script here changes sudo or SSH policy.
4. Database operations require a separately authorized local Unix-socket PostgreSQL operator
   able to read `pg_control_system()` and create/drop **only explicitly approved disposable**
   rehearsal resources. The evidence tool requires a local PostgreSQL superuser to create and
   remove those resources; never grant the application user superuser privileges to make it pass.
   It refuses non-system SQL functions, extensions and foreign servers; review and run a
   network-isolated restore separately if those are present. It does not capture uploads or
   cluster-wide roles. Preserve and rehearse those separately for disaster recovery.
5. Create an operator-owned mode-0700 directory outside release/upload trees. Approval, plans,
   manifests, receipts and journals must be absolute paths, regular files owned by that operator,
   mode 0600, non-symlinks and not hardlinked. They contain sensitive identifiers and must never
   be committed or pasted into chat. Do not print credentials or `DATABASE_URL`.

## Read-only inspection and new backup proof

Run the installed reviewed scripts as the authorized Linux operator with an explicitly configured
`DATABASE_URL` pointing to the approved target. Use `node deploy/contact-change.cjs --help` for
the command synopsis. `inspect --backend <absolute-backend>` returns database name, cluster
system identifier, DB OID, schema fingerprint and migration-history fingerprint. Save the
operator-reviewed target object privately; compare it through an independent trusted channel.
Do not accept a target solely because a generated file says so.

`contact-evidence.cjs` takes that private target file and creates a private custom-format backup
using an exported repeatable-read snapshot, full-archive decode, a disposable restore and exact
source/restored table-count/schema comparison. In `migration` mode it additionally executes the
specified exact migration, rollback and reapply **only on the disposable DB**. Cleanup is checked.
Its output receipt intentionally has `offsite: null` until an independent authorized process
encrypts/copies the archive off-server, verifies its checksum and records a fresh receipt in a
private file. No storage destination or encryption key has been configured by this work.

Example commands use placeholders; supply concrete paths through an approved operator channel:

```bash
node deploy/contact-change.cjs inspect --backend /absolute/installed/backend
node deploy/contact-evidence.cjs \
  --backend /absolute/installed/backend --app-root /absolute/application-root \
  --directory /absolute/private-operations-directory --target /absolute/private-target.json \
  --mode migration --migration /absolute/reviewed/migration.sql \
  --rollback /absolute/reviewed/rollback.sql
```

Keep the generated archive, manifest, proof and receipt together under restrictive permissions.
The off-server copy must be independently verified as encrypted with a matching SHA-256. Its
location identifier in the receipt is an opaque non-secret label, not a URL or key.

## Migration release gate

`contact-change.cjs migration-check` is **read-only**. It validates a private approval bound to
the current cluster/DB OID, active full revision, migration SQL SHA-256, migration-history
fingerprint, fresh backup, isolated forward/rollback/reapply proof and verified offsite receipt.
It requires exactly this migration to be pending, no unfinished migration history and checksums
for every already applied migration. It refuses all other pending migrations. Candidate
deployment separately validates the entire generated Prisma model contract and applied migration
checksums; this can intentionally block if the older `fix-dev` baseline differs from production.

The migration SQL has a second in-database guard: production requires the exact cluster ID,
explicit migration identifier and approval expiry less than 15 minutes away in the **same SQL
session**, plus an advisory transaction lock. Only use the approved migration-history procedure
after a successful `migration-check`; an operator must reconcile the precise Prisma migration
history without running unrelated pending migrations. Generic `prisma migrate deploy`, SQL
console execution without the guard/check, or automatic migration during application deploy are
not approved by this runbook. No automatic schema-downgrade tool targets production.

## Reviewed partner-link repair

1. Once the application/schema release is separately approved and active, use the new
   `contact-change.cjs plan --tenant <tenant> --out <new-private-file> --app-root <root>
   --backend <backend>` in read-only mode. It records complete row and linked-identity hashes,
   exact DB/cluster/revision/schema and timestamp; it never guesses an owner.
2. Review the candidates independently. The *only* permitted automatic mutation is setting a
   specifically approved staff-valued referral-partner link to NULL when the explicit property
   owner is verified and not staff. Owner replacements are not implemented. Select at most 50
   exact IDs per approval; an empty/duplicate/unknown selection is refused.
3. Create a private JSON approval with these fields (values must be real reviewed evidence, not
   copied from this example):

```json
{
  "version": 1, "approved": true, "operation": "repair-partners",
  "operation_id": "<new UUID>", "approved_by": "<reviewer>", "reason": "<specific review reason>",
  "approved_at": "<UTC ISO timestamp>", "expires_at": "<UTC ISO timestamp within 15 minutes>",
  "target": {"database": "reality_pandit", "cluster_id": "<verified system id>", "database_oid": "<verified oid>"},
  "active_revision": "<full active Git SHA>", "subject_sha256": "<SHA-256 of exact private plan bytes>",
  "tenant": "<reviewed tenant>", "approved_row_ids": ["<reviewed inventory UUID>"]
}
```

`migration-check` uses operation `migration-check`, the migration SQL hash as `subject_sha256`
and adds `migration_history_sha256`; a rollback uses `rollback-partners`, a new operation UUID,
the original committed journal's exact byte hash as `subject_sha256`, and the exact original ID
set. Approval files are operator-controlled evidence, not cryptographic authorization tokens.

4. Run `check-repair` using `--plan`, `--approval`, `--backup-manifest`, `--proof`, `--receipt`,
   `--backend` and `--app-root`; it performs live checks but writes nothing. Approval/plan expire
   after 15 minutes, backup/offsite proof after one hour. Fresh evidence is intentionally required
   again when those windows lapse. `repair` is also read-only unless `--execute` is explicit;
   execution additionally requires `--journal-dir <private-directory>` and a healthy verified
   release/worker/DB fingerprint. It holds the shared deployment lock and a PostgreSQL transaction
   advisory lock. It writes a durable prepared journal **before** commit.
5. Preserve the private journal and its checksum off-server. If the connection drops or a journal
   remains `intent`/`prepared`, **do not retry the change or invent a new operation ID**. Stop and
   inspect it. `reconcile --journal <path> --backend <backend> --app-root <root>` is read-only;
   `--execute` only finalizes a conclusively prepared journal. Intent-only, mixed or subsequently
   modified state is manual review. While an operation holds the locks, reconciliation refuses
   to classify it. Retain completed/aborted journals for audit and approved retention.
6. Rollback is a separate `rollback` approval against the committed forward journal, with a new
   operation UUID and fresh evidence. It restores only its original referral IDs after checking
   the full post-write row, update timestamp and original partner/employee identity. Any changed
   row or identity blocks the entire batch. A full database restore is not a routine undo.

## Deployment and recovery

The guarded release packages **committed bytes only**. The artifact is SHA-256 checked and
validated before extraction; links, special files, traversal, secrets, persistent data and
oversized archives are refused. Candidate build requires disk reserves and compatible migration
history/model schema. Activation switches a symlink atomically. After activation starts, the
candidate and previous release are retained even on failure; recovery restores the prior symlink
and attempts service verification. If recovery is incomplete, stop and inspect PM2/nginx/logs.
No automatic release pruning or DB rollback is performed.

An explicitly approved application rollback targets only a previously guard-verified full SHA.
It keeps the additive schema in place. Historical releases lacking the new verification receipt
require manual, reviewed compatibility assessment and cannot use the automated rollback command.
