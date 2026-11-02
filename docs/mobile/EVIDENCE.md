# Mobile milestone evidence — 2026-10-16

Checkpoint updated 2026-10-17. Work in progress. This record distinguishes executed checks from release acceptance. No production, store, provider or real-customer operations were performed.

## Latest continuation checkpoint — 2026-10-17

This checkpoint supersedes pending export, paired-TypeScript and website gates in older tables below. Patched SDK client installed; scoped native runtime has evidence. Native testing exposed a project-history bug after edit/delete/Back. Eight task/project return calls now use `dismissTo`; two real-router regressions fail before/pass after the correction. Both Android create/edit/save/delete/Back journeys passed, with six opened captures. Latest mobile **65 tests/13 suites**, strict types/full lint and both final Hermes exports pass. Bounded two-worker website build exited0. Fresh backend TypeScript baseline401/workspace390 has **zero new /11 removed** diagnostics; whole check still fails. Source/config67-file manifest, commands and hashes are in verification-results.json. No dependency or backend source changed in this continuation. See [VERIFICATION.md](VERIFICATION.md) and [NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md).

The earlier final-SDK capture inventory/design handoff remains separate; six correction images do not certify every major screen. Native iOS, physical devices, broad roles/workflows, release/performance/advisory/provider/store/production acceptance remain open.

## Workspace and source audit

- Branch `feat/mobile-apps`; HEAD `fb2afd7ad5dc0375b90eb35ebf778175a1c2ee27`. `git ls-remote origin refs/heads/main` returned the same revision at kickoff.
- Initial dirty files: `.serena/project.yml`, root `AGENTS.md`, untracked `.agents/` and the two mobile instruction documents. These were preserved.
- Read root and nested mobile instructions, current project status, decisions DEC-001/002/003, focused precautions, CI/package scripts, auth/scope/schema and current CRM/partner/builder route families. `ROUTES.md` indexes services, database delegates and route signatures; it is navigation evidence, not proof every route is secure.
- Graphify now exists: the consolidation query succeeded against 17,231 nodes. Incremental AST updates have completed; missing SQL-parser and legacy Android Gradle extraction warnings remain. Graph coverage is navigation evidence, not full semantic review or reuse of the excluded Android implementation.
- `PARITY.md` accounts for 151 workflow rows plus native/platform alternatives and excluded consumer/legacy Android work. Most parity remains outstanding.

## Untouched-clone baseline

| Check | Observed result |
| --- | --- |
| Backend `npm ci`, Prisma generation, `npm test` | 693 passed, 4 skipped |
| CRM `npm ci`, `npm run build` | Passed; existing bundle warning |
| CRM `npm run lint` | 0 errors, 954 warnings |
| CRM `npm run test:personal-whatsapp` | 19 passed |
| Website `npm ci`, build without configuration | Failed: `NEXT_PUBLIC_API_URL` missing |
| Website build with explicit loopback API/site origins | Passed |
| Website `npm run lint` | 0 errors, 313 warnings |
| Backend TypeScript | Failed on existing diagnostics; historical paired comparison is recorded below; temporary logs are no longer retained |

Package checks used test-only configuration and never started server schedulers or provider workers. Historical handover pass counts were not treated as current results.

## Current automated and native evidence

The combined upload/SDK source checkpoint has passed final tests/types/lint/online compatibility; final patched native and Hermes acceptance remain open. [VERIFICATION.md](VERIFICATION.md) and [verification-results.json](verification-results.json) retain independently executed commands, hashes and timing. Later feature evidence supersedes older counts only for its stated scope.

| Check | Latest observation and boundary |
| --- | --- |
| Backend regression suite | 700 passed / 4 skipped. The ordinary runner globally mocks auth/Prisma and cannot prove isolation. |
| Real PostgreSQL/auth integration | 30 passed: tasks 10, objects 9, sessions 11; independent resumed run uses real middleware/Prisma and disposable PostgreSQL/Redis without global auth/database mocks. |
| Backend TypeScript | Current 390 diagnostics; whole check fails. Historical retained-log comparison was baseline 401/current 390 with zero new occurrences. Those temporary logs are gone; a fresh paired comparison is pending native idle and is not inferred from the matching count. |
| Mobile tests / typecheck / lint | Final combined upload/SDK freeze: 63 passed in 12 suites, strict typecheck and full lint passed, including the last cached-refresh Notice/assertion; 66-file source/config manifest unchanged. The earlier final attachment-focused run passed 23 tests. Both new-SDK Hermes exports remain deferred. |
| Prior mobile/export snapshot | 57 tests, typecheck/lint and both Android/iOS Hermes exports passed before the final offline notices/upload increment. Historical snapshot only; export is not native iOS acceptance. |
| Live online SDK compatibility | Passed online after applied Expo 58.0.12 / Router 58.0.21 patch. The preceding .11/.20 online failure and unreliable offline success are historical. |
| Applied narrow SDK patch | Expo .12 / Router .21 / core .20 plus three related packages applied; isolated npm ci passed in 14s, live npm ci in 20s, online compatibility passed. Package/lock byte-equal to isolated snapshot; new core-linked Gradle build passed in 7m (695 tasks: 569 executed, 126 up-to-date); installation/runtime acceptance pending. See [SDK_PATCH_EVIDENCE.md](SDK_PATCH_EVIDENCE.md). |
| Session schema/migration | Prisma validation and additive session SQL rehearsal passed only in disposable loopback PostgreSQL; no production migration. |
| Android debug APK | Corrected Crypto source-build ARM64 development client succeeded; SHA-256 `9de8a8a88d0ae55ecdb1eca603ce902a65bb3d1b3bd805a74ad5cd4ce231b46f`, Expo .11 / Router .20. Fresh post-patch Gradle build passed in 7m (695 tasks: 569 executed, 126 up-to-date), per the root-verified `/tmp/rp-mobile-sdk-gradle.log`; new APK installation and patched-client acceptance remain pending. |
| Android synthetic runtime | Corrected pre-patch client passed login, encrypted/no-plaintext lead/task drafts, offline/reconnect/process-death restore, conflict/confirmed overwrite, task create/clear/discard, logout vault/key purge, other-session revocation→401, font1.3/density360/background-return and document-picker cancel. Native owner opened 18 current PNGs: 16 accepted pre-patch captures, 2 excluded diagnostics; see [DRAFT_EVIDENCE.md](DRAFT_EVIDENCE.md) and [NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md). |
| CRM compatibility | Independent production build and 19 personal-sharing contracts passed; no provider execution or full web UI acceptance. |
| Website compatibility | Earlier loopback baseline build passed. Current independent repeat emitted compilation/typecheck/prerenders/route table but was interrupted, exit 143; completion is unverified and bounded retry is pending native idle. |
| iOS native compilation | Blocked: full Xcode/iOS SDK and usable CocoaPods absent. Shared source/Hermes export does not close this gate. |
| Maestro / physical devices / WhatsApp / FCM / APNs | Maestro CLI unavailable; authored flow unexecuted. Physical-device/provider acceptance unverified. |
| Release performance / crash-free rate | Unmeasured; all plan budgets remain targets. |

## Reviewed increments and remaining phase work

- [TASKS_PROJECTS_EVIDENCE.md](TASKS_PROJECTS_EVIDENCE.md): staff paginated/filtered task and Work project reads plus basic edit/create/delete actions; component/real-auth checks. Native route captures remain pending. Bulk import, summaries, assignment/member/tag/link management and full workflow parity remain open.
- [DRAFT_EVIDENCE.md](DRAFT_EVIDENCE.md): bounded AES-GCM lead-note/new-task drafts, partition/expiry/purge/race tests and the Android subset above. Assigned-record offline snapshots remain not started; task/project edit forms do not have process-death draft guarantees.
- [CALENDAR_PRIVACY_EVIDENCE.md](CALENDAR_PRIVACY_EVIDENCE.md): reproduced calendar nested-property owner/location disclosure, reused canonical inventory redaction, and reduced nested task project to ID/name. Real-auth regressions preserve safe context and authorized exceptions. Appointment creation/provider acceptance and unrelated privacy paths remain open.
- [HANDOFF_REVIEW_FIXES.md](HANDOFF_REVIEW_FIXES.md): ambiguous appointment response gate and identity/abort/purge fencing before private/PDF share handoff. An OS share sheet already invoked cannot be retracted; background/process-death file reconciliation remains open.
- [ATTACHMENT_RECONCILIATION_EVIDENCE.md](ATTACHMENT_RECONCILIATION_EVIDENCE.md): ambiguous uploads require explicit successful current-server check, user review and confirmation before another POST; failed/offline/background refresh cannot unlock retry. Six component regressions supplement the 17 helper checks. This is manual review, not server deduplication or a durable upload ledger.
- [CODE_QUALITY_REVIEW.md](CODE_QUALITY_REVIEW.md) is the prior finding snapshot; the focused records above document subsequent fixes. Independent closure review, final verification, the documenter/design handoff and `.impeccable/design.json` update remain owed; no phase-complete claim is made.

## Toolchain and reproducibility

Node 22.23.2; npm 10.9.8; applied Expo 58.0.12 / Router 58.0.21 / core 58.0.20; React Native 0.88.0; React 19.3.0; TypeScript 6.0.3; TanStack Query 5.104.3. Retained accepted APK remains Expo .11 / Router .20 until the rebuilt client is installed and accepted. Full versions are locked in `agents/mobile/package-lock.json`. React DOM is pinned to React's version for Router peer resolution; the app has no DOM feature screens. Jest resolves Expo's nested `expo-modules-core` through its test config rather than forcing conflicting peer dependencies. No forced dependency upgrade was used.

Verified Android build: Temurin 21, Gradle 9.4.1, compile SDK 37, target 36, minimum 24; generated iOS project targets 16.4. The original four-ABI debug build was stopped to reduce resource pressure; it is not a pass. A one-worker ARM64 build then passed. No old Android application/helper code was used.

The pre-existing emulator registration pointed to missing files and its image directory was empty. A separate temporary AVD was created using Google's AOSP API 34 ARM64 image, verified against the official repository checksum. The emulator runs synthetic records only. Metro required IPv4-first localhost resolution on this host; it and the preview API bind to loopback. The API preview imports real routes and uses a minimal environment without external credentials or workers.

## Runtime screenshots and acceptance

Screenshots live under `agents/mobile/.impeccable/review/` and must be opened/inspected before being counted. They contain synthetic records only. They are Android debug/emulator evidence, not iOS, physical-device, release-performance or provider acceptance.

The native owner individually opened all 18 current PNGs and accepted 16 pre-patch runtime captures; two diagnostics are excluded. Pre-patch font-scale/density/lifecycle/picker, discard, logout/key purge and other-session revocation checks passed. The remaining 33 earlier PNGs are historical pending separate final design review. Task/project route captures and fresh patched-client smoke/captures remain pending. Native captures do not replace the independent design/documenter pass. No full-plan or production-ready claim is made.

## Outstanding release gates

Partner/builder independently revocable native sessions; recovery/setup/Google flows; full lead/contact and inventory wizard parity; deal/visit outcomes and matching/sharing acceptance; remaining administration/reporting/provider workflows; native push; encrypted assigned-record snapshots and broader draft coverage; native iOS and real-device captures; broader Maestro journeys; release builds/signing/privacy materials; measured performance; staging/provider and web runtime acceptance. Confirmed legacy browser-session limitations, wizard staging-document privacy and background share/upload reconciliation require further work before their affected capabilities are accepted. See SECURITY.md and PARITY.md.


## Inventory parity increment, 2026-10-18

New source, complete field/action mapping and bounded verification are recorded in [INVENTORY_PARITY.md](INVENTORY_PARITY.md) and [INVENTORY_EVIDENCE.md](INVENTORY_EVIDENCE.md). Android APK/module build and synthetic captures exist; actual WhatsApp/Business handoff and full role/device acceptance remain open. Earlier mobile checkpoints above are retained as historical snapshots.
