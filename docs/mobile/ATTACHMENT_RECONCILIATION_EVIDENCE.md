# Attachment upload reconciliation — 2026-10-16

Narrow closure of the attachment retry finding in `CODE_QUALITY_REVIEW.md`, on `feat/mobile-apps` at `fb2afd7ad5dc0375b90eb35ebf778175a1c2ee27` plus existing uncommitted implementation. Existing unrelated work was preserved.

## Scope and direction

Graphify query ran before inspecting the source. `Attachments.tsx` has one application caller, `app/inventory/[id].tsx`. The existing `uploadAttachment` helper validates the selected file, submits one multipart POST, retains the temporary file on rejection, and deletes it only after a resolved request. The photo POST appends media; the document POST creates a UUID file/document. Neither backend endpoint exposes idempotency. The upload response is not schema-parsed by this component/helper; unreadable success JSON is already an ambiguous write in `ApiClient`.

The installed Impeccable/Emil native guidance and craft floor were read. Session context had already run and was not repeated. This remains an Operate/native refinement using existing palette, 52-unit accessible buttons, live notices and native confirmation alerts. The screen keeps selected input and the original upload error, then separates a current server check from deliberate user review and an actual new upload. There is no automatic resend or inferred successful upload from a failed response.

| Before | After | Why |
| --- | --- | --- |
| Timeout/5xx enabled retry immediately | Ambiguous upload sets a check gate; retry is disabled | A first POST may have committed |
| Advice to refresh had no enforced check | **Check current attachments** awaits a successful explicit refetch, then **Enable retry after review** opens a duplicate-risk confirmation | A background refresh or failed check cannot grant retry |
| Refetch error replaced the detail tree | Cached detail and selection stay mounted; a prefixed refresh error remains visible | Failed refresh must preserve the selected input and gate |
| Only eight photos could be inspected | A count and **Show more property photos** reveal eight more at a time | An appended ninth photo must be reviewable without rendering an unbounded list initially |

Changed source is limited to `agents/mobile/src/features/inventory/Attachments.tsx`, its sole caller `agents/mobile/app/inventory/[id].tsx`, and new `Attachments.test.tsx`. No helper/session/storage/config/backend/dependency files were changed by this agent. Existing identity, abort and purge guards remain unchanged.

## Behavior

- Only ambiguous failures from the actual upload create the gate; a definite rejection retains normal manual retry. The permission GET still runs before each permitted upload.
- A successful explicit attachment check preserves the original error and selected file and exposes review. The user must confirm **Allow retry**, then separately press **Retry selected attachment**. Neither check nor confirmation submits a POST. Cancellation leaves retry blocked.
- Failed checks return to the check gate; offline disables check, review and retry. The callback uses `refetch({ throwOnError: true })` and additionally requires success with an idle fetch state, avoiding TanStack's default resolved error result. Ordinary **Refresh property** does not clear the gate.
- A definite successful POST clears `pending` before query invalidation. A subsequent refresh failure shows an error and cannot make that already-uploaded selection repeatable.
- Discard keeps its existing native confirmation and temporary-file cleanup, and clears the gate with the selection.

## Verification executed

From `agents/mobile/`, after the final source edit:

- `npm test -- --runTestsByPath src/features/inventory/Attachments.test.tsx src/features/inventory/attachmentFiles.test.ts` — **2 suites, 23 tests passed**. Six new component regressions exercise the real API transport and upload helper with synthetic server state and mocked native filesystem/pickers. They cover committed document writes followed by timeout, 503 or unreadable success JSON; blocked second POST; ordinary refresh not unlocking; failed refresh and offline checks preserving selection/gate/error; successful current-server review plus explicit new retry; an appended ninth photo; definite 400 retry; and confirmed upload followed by failed refresh. The 17 existing helper tests preserve the share identity/abort/purge race coverage.
- `npm run typecheck` — passed.
- `npx eslint 'app/inventory/[id].tsx' src/features/inventory/Attachments.tsx src/features/inventory/Attachments.test.tsx` — passed.
- Root `graphify update .` — passed. Existing missing SQL parser, excluded legacy Android Gradle parse and community-label warnings remain; no semantic/API extraction was requested.

The first focused run exposed a test selector collision between the retained upload error and the same refresh error. Refresh failure now has explicit contextual copy; the final run above passed. Tests were not weakened and source checks passed after the final Notice/assertion batch.

Source freeze was sent directly to the native acceptance and independent final verification agents. The native agent was notified before the final source mutation and asked to cold-launch after final freeze, excluding FastRefresh navigation from acceptance proof. Full mobile tests/exports, final dependency compatibility and native screenshots belong to their separately recorded final snapshot. This agent did not control ADB, Metro or the local API.

## Limits

This is explicit manual review, not server-side deduplication or proof that the first write never committed. A user who knowingly permits another upload can still create a duplicate, and a server write could finish after the check. The component's pending selection/gate is not a durable process-death upload ledger. Native visual/physical-device, iOS and production acceptance are not established by these component tests. No commit, push, deployment, migration, store action, production/provider call or live communication was performed.
