# Contact roles, key holders and contact relationships

## Delivery state

- **Guardrails added after the rehearsal:** release/migration/repair checks now fail closed on
  wrong targets, stale evidence, missing verified off-server copy, schema/history drift, changed
  records and ambiguous commit/rollback outcomes. See
  [contact-change-guardrails.md](../runbooks/contact-change-guardrails.md).
- The migration/rollback SQL has changed since the previous production-backup rehearsal; its old
  proof remains historical. A fresh target-bound v2 backup, current-SQL rehearsal and independently
  verified encrypted off-server copy are required before any guarded production operation.
- **Migration rehearsal now passed (2026-10-26):** full archive restore, forward SQL, rolled-back
  write probes, rollback and reapply succeeded in an isolated database. All table counts and
  target data fingerprints stayed unchanged. Scratch database/owner cleanup and unchanged
  production column metadata were independently verified. See
  [contact-migration-rehearsal.md](contact-migration-rehearsal.md) for retained evidence.
- User approved implementation after the read-only diagnosis and requested a production
  backup first. The later branch instruction is authoritative: **fix-dev only**.
- Changes are uncommitted in the `fix-dev` worktree at
  `%LOCALAPPDATA%\Temp\opencode\rp-contact-roles`, based on `a663130`.
- The original working directory remains on `fix/deal-board-contact-scope`; its unrelated
  UI edits were preserved. No commit, push, merge into main, deployment, production migration,
  or business-data repair was performed.
- Installed dependencies were reused without installing/upgrading packages. After validation,
  the original checkout's Prisma Client was regenerated from its unchanged schema, restoring
  its development environment. Regenerate from the fix-dev schema before running this worktree's
  backend. The temporary UI verification server/pages were closed.

## Task 1 — verified root cause

Read-only production queries found that RP-GZB-RES-21125 has:

| Relation | Resolution |
|---|---|
| Inventory ID | `c83827e9-22e1-456e-b7bf-72091a449b5c` |
| `owner_phone → contacts` | Ram Singh, LANDLORD; phone key masked, ending 7171 |
| `owner_id → owners → contacts` | Same contact; Owner ID `0fc70895-e9f2-46e2-aeb5-c3acf531e27f` |
| `owner_contact_id` / `key_holder_contact_id` | Both NULL |
| Key holder | EXTERNAL snapshot, Ram Singh; normalized phone matches property contact |
| Assigned/uploading employee | Vinod Rajput, Agent ID `e4f3a867-302a-4752-890f-39927f3d6d0c` |
| Referral partner | Vinod's PartnerAgent profile `7b3150f2-c403-4bea-a764-f258e47a3df0`; its phone matches that employee |
| Ownership | Explicit OWNER |

The bad external-partner relationship combines with `inventorySourceKind()` giving a referral
precedence over explicit OWNER. The list serializer then selected the partner's name and forced
the Agent designation. This is a data inconsistency plus a display bug, not an Agent UUID
accidentally joined to Contact. A second independent defect used uploader snapshots as a contact
fallback. The creation event confirms the admin inventory_v3 workflow but does not record the
source-partner input, so the authoring action behind the bad link is not established.

The inspected production files differ from this Git baseline and the screenshot's newer tile
layout. No claim is made that a particular currently loaded production revision was identified.

### Fix

- Explicit OWNER now wins over referral attribution; staff-valued partners cannot become the
  displayed property contact. Assignment/upload attribution remains separate.
- `services/inventory_parties.ts` resolves names, roles and normalized identity for both list
  and detail contact responses. Missing real contacts return empty source data and the CRM shows
  **No contact linked**. Unnamed but linked contacts have a distinct state.
- Staff identities require an explicit Employee designation, validated against an actual staff
  phone; external partner registration rejects staff before its existing-profile early return.
- Shared write guards cover inventory create/createMany/upsert/update and reject bulk identity
  rewrites. Both upsert branches are checked. Route/workflow validation precedes Contact/Owner
  side effects. Existing coded OWNER_IS_TEAM_MEMBER errors are preserved.
- New guards reject foreign-tenant contact/key-holder references and mismatched key-holder links.
  New private designation fields are included in redaction rules.

## Backup and read-only repair plan

Production backup, completed 2026-10-26 09:22 UTC:

```
/root/backups/contact-roles-prechange-20261026T092202Z/reality_pandit.dump
```

- Full single-database custom archive: 24,388,861 bytes, 104 table definitions/data entries.
- SHA-256: `115b91f7eb32195225faf186f67573a72516dc5a98c4a4d1ea3ff7562e17bf4c`.
- pg_dump, pg_restore TOC inspection and full SQL decoding succeeded; independent checksum
  reread matched. Directory 0700; archive/metadata 0600. The subsequent isolated restore and
  migration rehearsal passed; no off-server copy was created.
- Database backup does not include media/uploads or cluster-wide role definitions.

`agents/backend/scripts/contact-party-repair-dry-run.ts` was executed against production in
explicit read-only transactions. Its complete private plan is retained next to the backup:

```
/root/backups/contact-roles-prechange-20261026T092202Z/contact-party-repair-dry-run.json
```

| Result, tenant default | Count |
|---|---:|
| Inventory scanned | 1,057 |
| Staff-valued referral partner | 155 |
| Staff-valued owner | 9 |
| Distinct candidate rows | 164 |
| Active candidate rows | 156 |
| Proposed referral unlinks, all requiring review | 155 |
| Owner identities requiring a verified replacement | 9 |

The planner lists record IDs, old/proposed values, expected updated_at, preserved employee/owner
IDs, and rollback values. It has **no apply mode**; `--apply` fails. A reviewed executor and any
repair/rollback execution require separate approval. Never substitute the key holder or use
fuzzy name matching to invent a missing owner.

## Tasks 2–3 — designations and shared options

One dependency-free catalog, `agents/backend/src/data/contact_catalog.ts`, now supplies API
validation, workflow choices, CRM options, labels and colors. The CRM build imports that pure
module, so build it from a repository checkout containing the backend data directory.

Approved inventory choices: Owner, Agent / Dealer, Financer, Chowkidar, Caretaker,
Builder / Developer, Tenant, Family member / Relative, Employee, Other.

- Existing identifiers PROPERTY_OWNER, AGENT_DEALER, FINANCER, BUILDER, CHOKIDAR, CLIENT and
  existing source identifiers are preserved. CHOKIDAR remains the stored spelling.
- Lead channels: Client (direct), Partner Agent, Walk-in, Referral, Website, 99acres,
  MagicBricks, Housing.com, Social media, Cold call, Other. Existing WhatsApp/Facebook/Instagram/
  voice and legacy intake choices remain available. DIRECT_OWNER/PARTNER_REFERRAL remain the
  flow identifiers; channel is separate from the referral relationship.
- Other requires a trimmed label of 2–60 characters, validated in the UI and server.
- Person designation is separate from ContactType. Existing Contact classifications and the
  directory's counting/grouping query are not rewritten when selecting a property role.
- The key-holder badge resolves an explicit per-property designation or known linked-person
  designation. When the holder and property contact are the same normalized person, their
  recorded property role wins. Otherwise unknown roles show **Role not set**, with a Set role
  action for permitted editors. Call/WhatsApp actions remain.
- Add and desktop/mobile Edit flows support designations. Changing key-holder identity clears
  stale links/overrides. Explicit internal Employee selection is not external-agent registration.
- For 21115, the normalized Kanchan identity matches, while global ContactType is PARTNER_AGENT
  and client_role is NULL. The property OWNER relationship is used instead of global type.
- No new designation was persisted for Ram Singh; his real-world designation still needs
  confirmation. Current database ownership metadata is not proof of a person's real-world role.

### Additive migration

`20261026093000_property_contact_designations/migration.sql` adds seven nullable text columns:
Contact.client_role_label/source_label, Inventory.property_contact_role/property_contact_role_label/
key_holder_role/key_holder_role_label, Transaction.source_label.

The migration is transactional with bounded lock/statement timeouts. No guessed data backfill
is included: same-person badges resolve existing property metadata at read time. Manual schema
rollback SQL is in `docs/agent/contact-roles-rollback.sql` and loses newly captured column data;
export it before any approved rollback. Applying the migration is a separate production step.

## Task 4 — one relationship implementation

- Contacts Overview embeds `ContactRelationshipPage`, exactly the component used by C.
  The redundant owner-only inventory fetch is removed; C is also available on contact rows.
- The shared `contact_relationship.ts` service returns accessible enquiry Transactions,
  provided inventory/Owner links, key-holder properties, partner/enquired-property links,
  active pipeline deals, visible assigned employee, and the existing merged activity timeline.
- Non-empty sections have counts and record actions. Property actions open InventoryDetailView;
  enquiries open the exact deal; employee links open the existing staff profile. Navigation from
  C waits for browser popstate so Back cannot overwrite the target view.
- Both entry points fetch details only when opened. Response lists are paged in batches of 50
  with Show more and total counts; no relationship request is issued for each directory row.
  The existing timeline aggregation still reads its history before pagination; optimizing very
  large historical timelines remains outside this change.
- Tenant/team scopes apply to every inventory branch, including enquiry references. Private
  identity fields are not reattached to relationship items. Directory classifications/count
  aggregation are unchanged; screenshot totals were not claimed as freshly verified counts.
- The Contacts drawer is a native dialog with Escape/focus restoration, and failures have Retry.

## Verification actually performed

| Check | Result |
|---|---|
| Prisma validate / client generation | Passed, using a dummy local URL; no migration executed |
| Offline Prisma schema diff | Exactly seven nullable additions, no destructive SQL |
| Backend full Vitest run | **747 passed, 3 skipped, 0 failed assertions**; suite remains non-green because unchanged wa_image_route.test.ts afterAll hits Windows EPERM deleting its fixture directory |
| Image test isolated rerun | All 3 assertions passed; the same cleanup EPERM persisted |
| Frontend node navigation regressions | 2 passed |
| CRM TypeScript + Vite production build | Passed; large-bundle warning remains |
| Full CRM lint run | 0 errors, 954 warnings at that run; changed-file comparison showed no added messages |
| Backend no-emit typecheck | Not green: 397 diagnostics vs 402 on the baseline using the same installed types; no introduced diagnostics in the comparison |
| Git whitespace check | Passed before final documentation; rerun at handoff |
| Graphify AST update | Succeeded; SQL parser absent, three existing Gradle parse warnings and no-symbol files limit coverage |

Browser verification used actual local components with a clearly labelled, isolated synthetic
HTTP adapter; no production session/token or provider was used. Observed:

- zero relationship requests while rendering the directory; one when opening a contact;
- identical five relationship sections through drawer and C;
- clear empty-contact state, native dialog focus/Escape restoration;
- 390px viewport, document width 390px, no overflowing relationship elements;
- full role list, Caretaker creation payload carrying CARETAKER without changing ContactType
  into an external agent; empty Other label blocked with an announced error;
- expanded source select in Add Lead, Other validation and continuation after a valid label;
- no browser console errors or external resource requests during the inspected fixture flow.

Screenshot capture timed out; a full visual audit, real screen reader pass and authenticated
end-to-end production smoke were not completed. Docker's local daemon was unavailable; the
subsequent PostgreSQL restore/migration rehearsal instead passed in an isolated VPS database.

## Remaining gates / rollback

1. The earlier isolated rehearsal passed for the earlier SQL bytes. Rehearse the current guarded
   SQL against a fresh target-bound backup, verify an encrypted off-server copy, then obtain
   separate production migration and guarded release approval. Regenerate Prisma Client for this
   schema when setting up the worktree.
2. Review the 155 proposed unlinks individually; confirm intentional Employee relationships and
   the nine unknown owner identities. No reviewed apply/rollback executor has been run.
3. Confirm Ram Singh's designation rather than assigning Chowkidar/Caretaker from a screenshot.
4. Obtain a separately approved deployment/live smoke; the current production version drift
   remains an operational concern, not a reason to run legacy deployment scripts.

Application rollback can retain these nullable columns. Data repair rollback must restore only
reviewed original field values with post-write concurrency checks; a full database restore is
not a casual rollback and can discard newer production activity.
