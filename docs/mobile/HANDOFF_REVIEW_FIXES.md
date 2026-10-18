# Mobile handoff review fixes — 2026-10-16

Scope: narrow post-phase review fixes in the existing Operate/native CRM. Preserve the current palette, controls, backend contracts and all unrelated workspace changes. Branch `feat/mobile-apps`, HEAD `fb2afd7ad5dc0375b90eb35ebf778175a1c2ee27`; the mobile source remains uncommitted with the wider implementation.

## Appointment write reconciliation

`agents/mobile/app/visits/[id].tsx` now treats a successful PATCH whose appointment payload cannot be parsed as an ambiguous write. The request may already have saved notes/status, so the screen retains entered notes and disables notes/status mutations. Only an explicit successful **Refresh appointment** clears that gate; background query updates do not clear it. Transport/server errors keep the existing ApiClient behavior. No retry or new backend operation was added.

`src/features/crm/Appointment.test.tsx` exercises both an interrupted request and a malformed successful response. It confirms the status dialog does not write before confirmation, notes survive, notes/status buttons block a second PATCH, and an explicit successful refresh permits further changes.

## Private attachment handoff

Both `sharePropertyPdf` and `sharePrivateDocument` now require a current-identity callback from their only native caller, `Attachments.tsx`. The callback compares the session ID, agent ID, tenant and role with `SessionController.current`; credential rotation within the same identity is permitted. Attachment operations abort on component removal or scope/property change. Their existing Cancel transfer action uses the same AbortSignal.

Each share captures a purge generation before any asynchronous preparation. `cleanShareFiles(true)` invalidates pending operations even when the cache directory does not exist. A shared guard checks cancellation, purge generation and the current identity before creating plaintext files and immediately before native `Sharing.shareAsync`. A guard after file writing prevents an interrupted asynchronous write from recreating a usable file after logout cleanup. Failed/cancelled operations delete their temporary file; abort also deletes a file while its sheet is pending. Errors surface without automatic retry.

Existing backend authorization remains authoritative: generated PDF POST scopes the chosen inventory and private download GET checks document access and membership. No backend, provider or API transport files changed. `app/inventory/[id].tsx` needed no change because it renders the shared Attachments caller.

`src/features/inventory/attachmentFiles.test.ts` uses synthetic bytes and mocked native modules. For both PDF generation and private download, it defers download and file writing independently, then cancels, resets identity, or purges. Deferred writes create their file only after the interruption, proving the post-write guard removes recreated files. Every interrupted case asserts no share-sheet invocation and no retained file. Successful synthetic handoffs verify the PDF sharing options and subsequent purge.

## Validation and coordination

From `agents/mobile/`:

- `npm test -- --runTestsByPath src/features/crm/Appointment.test.tsx src/features/inventory/attachmentFiles.test.ts` — 2 suites, 19 tests passed.
- `npm run typecheck` — passed.
- `npx eslint 'app/visits/[id].tsx' src/features/crm/Appointment.test.tsx src/features/inventory/attachmentFiles.ts src/features/inventory/attachmentFiles.test.ts src/features/inventory/Attachments.tsx` — passed. The revised deferred-write test was also checked separately with ESLint and rerun in both focused suites.
- Root `graphify update .` — passed; existing SQL-parser, legacy Android Gradle parsing, and community-label warnings remain. No semantic/API extraction was requested.

Source edits were coordinated with the native acceptance agent: acceptance paused before edits and that agent was notified of the source freeze after validation. No ADB control, APK rebuild, dependency installation, native configuration change, commit, push, deployment, production action or provider/customer communication was performed by this implementation agent.

## Limits

These regressions are component/unit evidence, not physical-device privacy or provider acceptance. A share sheet already handed to the OS cannot be retracted, and files copied by a chosen recipient app are outside this cache's control. Successful handoffs retain the existing ten-minute feature-entry cleanup policy; background/process-death cache reconciliation remains a release gap. Native Android screenshots and iOS/toolchain acceptance belong to the separate combined verification record.
