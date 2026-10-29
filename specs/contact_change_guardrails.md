# Contact release and repair guardrails

## Goal and scope

Implement on fix-dev. Protect the prepared contact release against wrong targets, stale evidence,
unreviewed repairs, lost commit acknowledgements, concurrent edits, destructive rollback and failed
activation. This work creates guardrails and tests; it does not approve production execution.

## Confirmed gaps

- The deployment cleanup trap can remove a release after the current symlink was switched if
  process reload fails before the trap is cleared. Artifact extraction is not path/type checked.
- A boolean invokes unrestricted pending Prisma migrations; evidence is not checked by that path.
- Health verification has no time limit or revision assertion. Symlink replacement is not atomic.
- The data plan is read-only (good) but does not bind complete row snapshots or a target cluster.
- The schema rollback SQL can discard newly entered labels without checking whether they exist.

## Implementation

1. Shared dependency-free validators for target identity, evidence age/checksums/rehearsal,
   explicit approvals, bounded reviewed repair plans and complete row fingerprints.
2. A purpose-specific operational CLI: inspection/checks are read-only by default. Only reviewed
   referral-partner unlink / exact journal-based undo is executable. No arbitrary owner repair,
   arbitrary SQL or automatic schema downgrade. Keep the original planner's --apply refusal.
3. Mutations take a shared deployment filesystem lock and a database advisory transaction lock,
   lock/recheck every row before writing, and use one transaction. A private fsynced journal is
   durable before COMMIT; ambiguous outcomes require read-only reconciliation, never blind retry.
4. Schema SQL permits only the named application DB with explicit session approval and matching
   cluster identity, or a precisely named disposable rehearsal DB. Advisory/lock/statement limits
   apply. Schema downgrade is rehearsal-only and refuses non-NULL new-column data.
5. Release script: strict Git revision/artifact hash and safe archive members, shared lock, schema
   compatibility before activation, atomic symlink switch, failure recovery that preserves live
   releases, bounded dependency/revision health checks, no automatic database migration/pruning.
6. CI runs guardrail and navigation regressions and tests fix-dev without deploying it. Production
   branch/environment controls stay in force.

## Verification

Use synthetic fixtures and stateful transaction adapters for wrong DB/cluster, stale or corrupt
backups/proofs, changed SQL, expired approvals, duplicate/unreviewed/ambiguous rows, concurrency,
mid-batch failure, commit ambiguity, repeated execution, journal failure and unsafe rollback.
Test shell release recovery with stub services on an isolated filesystem. Rehearse changed SQL
only in a disposable database, including refusal when new data would be lost. Record limits:
privileged operators can bypass tools; these checks cannot guarantee safety against all outages
or malicious root access. Existing production pending migrations/runtime drift remain release gates.

## Rollback

Application rollback retains nullable columns and both release directories. Data undo changes only
the original referral link when the full post-operation row still matches. Any uncertainty stops
the operation. Filesystem journals are sensitive and must be privately retained with backups.
