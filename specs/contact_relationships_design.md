# Contact identity, designations and relationships

Baseline: `fix-dev` at a663130. Work is isolated from the user's dirty UI checkout.
Production backup was completed before implementation; database repairs remain separately gated.

## Implementation

1. Introduce a dependency-free catalog in backend source, imported by the CRM and backend.
   Preserve existing workflow/role/source identifiers. Keep person role, property relationship,
   intake channel and staff assignment distinct. Other requires a separately stored short label.
2. Resolve inventory property contacts using explicit linked parties, never uploader snapshots.
   Batch staff identity lookups; a staff-valued legacy partner cannot override an owner. Reject
   internal staff in external partner registration. Unknown property identity gets an empty state.
3. Add nullable, additive per-property contact/key-holder role fields and Other labels, plus
   optional contact/source labels. Resolve same-person key holders using existing phone helpers.
   No guessed designation, no automatic global ContactType reclassification or directory recount.
4. Extend the existing relationship service with permission-scoped key-holder/partner/handler
   links. Both C and Contacts drawer render one shared relationship component. Fetch only on
   opening; paginate/cap displayed relationship lists and preserve directory grouping/counts.
5. Produce a default-dry-run repair tool. Candidate matches are not automatic corrections;
   output old values, proposed changes and review status with rollback/concurrency information.

## Security and verification

Retain tenant/team scope, contact visibility, protected phone redaction, existing authentication
and CSRF handling. Do not return staff credentials or unrelated partner records. Validate all
new role/source inputs server-side and render Other text as React text, never HTML.

Use synthetic regression identities, including the shape of 21125 (owner + staff referral +
separate staff assignment). Test roles, Other validation, missing identity, same-phone key
holders, shared relationship results and permission filters. Run focused and full tests,
typecheck/build/lint and local browser checks. Report baseline failures separately.

## Rollout and rollback

No production migrations, writes or deployment are part of local implementation approval.
Review additive SQL before applying it. Restore old code only while schema remains compatible;
drop new fields only after explicitly accepting loss of any new designation/label data.
