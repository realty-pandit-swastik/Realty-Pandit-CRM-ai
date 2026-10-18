# Realty Pandit — Fresh Android and iOS Implementation Plan

## Purpose and agreed decisions

Build a functional, polished Android/iOS CRM from scratch in `agents/mobile/`.
The existing `agents/android/` application and its helper implementations are out of scope: do not adopt, extend, migrate, delete, or depend on them.
Retain the Express/TypeScript backend, PostgreSQL/Prisma, Redis/BullMQ, business rules, provider integrations, and existing web clients.

- Audience: staff, managers, super administrators, partners, and builders. Preserve their distinct permissions and authentication domains.
- Include all applicable business workflows. Public consumer browsing, buyer accounts, favourites, and comparisons remain on the website.
- Stack: TypeScript, React Native, Expo development builds, Expo Router, TanStack Query, and SecureStore. Use native components, not embedded web pages as feature replacements.
- Offline: encrypted assigned-record snapshots and local form drafts; authoritative writes and communications require connectivity. Do not queue automatic sends or silently replay mutations.
- Distribution: prepare Google Play and Apple App Store builds; publication requires separate authorization.
- Visual direction: Deep Navy, Emerald Teal, Soft White, Slate Gray. Retain Realty Pandit identity and logo; do not inherit old clay/glass/oversized-card prescriptions.

## Workspace prepared — 2026-10-16

This repository is already initialized at `/Users/avnish/realty-pandit-mobile` on `feat/mobile-apps`, based on verified `origin/main` at `fb2afd7ad5dc0375b90eb35ebf778175a1c2ee27`. Milestone 1 inventory and baseline are recorded. Fresh Expo source/dependencies, native staff session/security prerequisites and tested Android daily-work increments now exist. Continue the open milestones below; do not repeat cloning/bootstrap. Native iOS, broad role/workflow parity and release acceptance remain open. The original checkout is separate and untouched. Pre-checkout tooling files were preserved under `plan/setup-preserved/serena-before-checkout/`; these are local setup artifacts, not app source and should not be committed.

## Execution checkpoint — 2026-10-17

| Milestone | State and evidence |
| --- | --- |
| 1 | Current-source inventory and reproducible baseline recorded in `../../docs/mobile/PARITY.md`, `ROUTES.md` and `EVIDENCE.md`. Source coverage is not runtime certification. |
| 2 | In progress: staff Android development slice and 30 real-auth DB checks; canonical calendar-property/task-project response privacy and scoped media/session fixes have focused evidence. Corrected pre-patch Crypto source-build APK ran; new-SDK build passed in 7m (695 tasks), with new APK installation/runtime acceptance pending. Native iOS, successful camera, large-data native pagination, verified app links and staging-document privacy remain open. |
| 3 | Staff foundation, session race regressions and Android synthetic checks exist; partner/builder identities, recovery/setup/Google, pre-patch font1.3/density360/lifecycle/picker/logout/purge/revoke checks and 16 inspected captures exist. Final patched-client/accessibility/design review and native iOS remain open. |
| 4 | Incremental staff lead notes, inventory reads/attachments/PDF, task filters/detail/basic edits/delete and Work project list/detail/basic create/edit/delete have scoped tests. Lead/task drafts have pre-patch Android encryption/offline/process-death/conflict/create subset proof. Assignment/member/tag/link/bulk/summary, full taxonomy/workflow/matching/deal/contact and other role parity remain open; no aggregate completion claim. |
| 5 | Not started in native UI; every administration workflow remains in the 151-row matrix. |
| 6 | Android picker/denial/PDF and loaded-form offline/draft subset evidence exists. Encrypted assigned-record snapshots remain not started. Ambiguous upload manual check/review gate and identity-safe share handoff have focused tests; durable/background reconciliation, push, maps/calling, real WhatsApp/Business and final patched-client inspection remain open; pre-patch native owner accepted 16 captures and excluded two diagnostics. |
| 7 | Release/physical-device measurements not run; all budgets remain targets. |
| 8 | Final upload/SDK snapshot passed 63 tests/12 suites, strict types, full lint and online compatibility on unchanged 66-file manifest; applied Expo .12/Router .21/core .20 clean installs passed (isolated 14s/live 20s). Backend 700/4 and 30 real-auth checks remain current; historical 57-test/both-export snapshot is not new-SDK acceptance. New native Gradle build passed in 7m (695 tasks: 569 executed, 126 up-to-date); installation, both new-SDK exports, patched-client smoke/captures, paired backend TypeScript comparison, bounded website retry, reviewer and documenter/design handoff remain owed. CI/Maestro/signing/iOS archives/provider/staging/store/privacy materials and release acceptance remain open. No publishing is authorized. |

Continuation update (2026-10-17; supersedes pending gates in the table above): patched SDK client installed and scoped login/draft/picker/task/project checks ran. Duplicate task/project history after edits/deletion was reproduced, corrected with eight `dismissTo` return calls and confirmed with real-router regressions plus both native Android Back journeys; six captures opened. Latest mobile65 tests/13 suites, strict types/full lint, both Hermes exports and bounded two-worker website build pass. Fresh paired backend TypeScript is401 baseline/390 current, zero new/11 removed diagnostics, while whole typecheck still fails. See VERIFICATION.md and NATIVE_ACCEPTANCE.md. Final broad design/capture handoff, native iOS and remaining role/workflow/release milestones remain open.

Keep this checkpoint, parity rows and the evidence log aligned after each increment. Missing iOS tooling blocks its compilation/inspection only; continue independently implementable work.

## Workspace setup

Use a NEW, EMPTY destination anywhere on the development machine. A fresh full clone is preferred over copying an app folder or creating an unrelated mobile-only repository, because backend fixes and web regression tests belong alongside the mobile work.

```sh
git clone https://github.com/realty-pandit-swastik/Realty-Pandit-CRM-ai.git /absolute/path/realty-pandit-mobile
cd /absolute/path/realty-pandit-mobile
git switch -c feat/mobile-apps
mkdir -p agents/mobile
```

Copy this file to `agents/mobile/MOBILE_PLAN.md` and the accompanying playbook to `agents/mobile/AGENTS.md`. Keep the existing root `AGENTS.md` and `.codex/AGENTS.md` intact. Open the new repository root in the coding agent so it can inspect both mobile and backend sources. Start the mobile generator in a temporary empty directory and merge its output without overwriting these two documents.

Do not copy `.env`, production data, uploads, signing keys, `node_modules`, or build caches from the old workspace. Do not copy uncommitted changes wholesale. A needed local-only feature must be identified, reviewed, tested, and deliberately ported as a separate change.

Do not merge to main, push a release tag, publish, or deploy as part of workspace setup. Existing main-branch automation can deploy merged changes.

## Milestones and acceptance

### 1. Current audit and feature inventory

Read root/nested instructions, current status, architecture/decision documents, precaution notes, package scripts, CI, schema, and tests. Use Graphify first when its graph exists; verify findings against current source. Record HEAD, latest origin/main, dependency/toolchain availability, and dirty state. Audit CRM routing plus active partner/builder interfaces; classify retired routes rather than reviving them.

Trace UI action -> API -> authorization -> service/workflow -> database/provider for every feature family. Create `docs/mobile/PARITY.md` with one row per workflow, not just per screen. Columns: role, existing source/API, expected behavior, Android status, iOS status, automated test, device evidence, blocker/limitation. Use explicit states: not started, implemented/unverified, automated verified, device verified, blocked, platform alternative, not applicable with reason.

Include authentication/setup/reset/Google linking where active; dashboards/analytics/reports; leads/contacts/conversations; inventory/taxonomy/media/documents/matching; deals/commissions; tasks/projects/reminders/calendar/visits; team/partner/builder management; assignments/approvals; campaigns/email/workflow configuration; sourcing; AI/agent controls; call review/transcription; notifications/profile/settings. Verify exact applicability through source and permissions.

Run existing package checks against this clone using test-only configuration. Record pre-existing failures separately. Do not start schedulers/provider workers with production configuration. Acceptance: evidence-backed inventory and reproducible baseline, with no claim that legacy documented functionality is verified.

### 2. Architecture proof and security prerequisites

Record an architecture decision comparing Expo/React Native with Capacitor using the real contracts and measured representative flows. Selected direction is Expo/React Native: fresh native UI and targeted pure-code reuse. Capacitor's web reuse does not justify bringing the existing full DOM bundle into the new app. Do not claim either framework meets launch budgets without release measurements.

Build a functional vertical slice on both platforms: test-account login, session restoration, paginated inventory, protected media, camera/file upload, generated PDF sharing, deep-link routing. Use development builds with native modules; Expo Go is insufficient evidence. Missing iOS tooling is a recorded verification blocker, not a passed proof.

Recheck authentication/authorization, task/project scoping, public/private uploads, logs, and backup findings. Write regression tests with REAL auth middleware and isolated PostgreSQL/Redis; globally mocked auth cannot demonstrate security. Fix confirmed defects at the shared backend boundary before integrating affected features.

Add mobile sessions with independently revocable identifiers, hashed rotating refresh credentials, replay handling, expiry, active-account checks, and device-session revocation. Preserve browser cookies, CSRF, and existing identity separation. Add authenticated native push registration and scoped private-media access only where needed. Preserve intentional public listing media and web compatibility.

Acceptance: working slice, bounded API changes, negative authorization tests, and a documented Android/iOS capability assessment. Stop only the affected capability on a platform failure; continue independent implementation.

### 3. Mobile foundation, design system, authentication

Maintain the supplied playbook from the start. Organize `app/` routes, `src/features/`, `src/components/`, `src/api/`, `src/theme/`, and `src/storage/` without empty speculative layers. Choose currently compatible Expo-managed dependency versions, lock them, and record minimum OS/toolchain versions from the chosen SDK. No broad root workspace conversion.

Use Expo Router native stacks and permission-aware tabs: Home, Leads, Inventory, Tasks, More; role-specific destinations remain accessible through More. TanStack Query owns remote state. Local state owns form drafts and UI. Use a single typed API transport with cancellation, bounded timeouts, one concurrent refresh, no refresh loops, and safe error mapping. Preserve staff, partner, builder token types and corresponding backend routes.

Design tokens start at navy `#10243A`, teal `#087F75`, soft white `#F7F9FB`, slate `#526174`; validate contrast. Use system typography, consistent spacing, restrained surfaces, readable data, 44pt iOS/48dp Android targets, safe areas, keyboard handling, accessible labels, and reduced motion. Design error/empty/offline states as functional parts of each screen. No fabricated KPIs, gradients, glows, decorative illustrations, or choreographed dashboard loading.

Acceptance: real login/logout/recovery and role navigation, reusable controls, tested app restart/session expiry, design inspected on both platforms where tooling permits.

### 4. Core CRM parity

Implement leads, contacts, conversations, inventory create/edit/search/filter/media, matching, property sharing, deals, tasks/projects, reminders, appointments, calendars, visits, and outcomes in reviewable feature increments. Reuse canonical taxonomy/workflow validation, phone normalization contracts, currency units, lifecycle rules, and price/owner redaction. Avoid new client-side business-rule implementations.

Acceptance per increment: real backend reads/writes, relevant role/tenant tests, error/offline recovery, both-platform UI inspection, and parity evidence. A screen that only renders is not complete.

### 5. Remaining business and administration parity

Implement team management and transfer, partner teams, builder projects/appointments and applicable subscription workflows, approvals, commissions, reports/charts/exports, campaigns/email, sourcing, taxonomy/workflow tools, AI dashboards/controls, and remaining active settings. Do not route CRM features to website links as a substitute. External provider authorization/payment flows may use the system browser where required, returning securely to the app.

Acceptance: all applicable parity rows implemented or explicitly blocked with technical justification. Missing backend functionality is recorded and implemented where authorized; never substitute fake APIs or counts.

### 6. Native integrations and communications

Add camera/system pickers, bounded/compressed uploads, progress/cancellation, downloads/PDF sharing, foreground location/maps, network/lifecycle handling, optional local biometric unlock, deep links, and notification preferences/history. Use OS-protected storage and encrypted bounded snapshots/drafts with a per-install secret; account/tenant partitioning and logout purge are mandatory. Do not persist full query caches or provider secrets by default.

Use `expo-notifications` with direct FCM/APNs delivery from backend workers; keep existing web push. Store authenticated device registrations, process invalid-token responses, minimize notification payloads, and authorize the destination again after opening a notification.

Company WhatsApp continues through existing authorized backend services. Personal sharing prepares the chosen files and invokes a supported user-initiated share flow; test ordinary WhatsApp and Business on each OS. Recipient selection, mixed-media/PDF steps, captions, ordering, and inability to confirm delivery must be explicit. Do not use undocumented recipient extras, UI automation, or claim automatic sending. If exact targeting is unavailable, keep it an unmet requirement/platform limitation rather than silently claiming parity.

Calling uses the OS dialler, explicit CRM outcomes, permitted recording import, and verified backend/provider transcription/review. Do not assume access to cellular audio, device call logs, background capture, or cross-platform call interception. Request permissions only when the associated action needs them; denial must preserve other workflows.

Acceptance: permission denied/cancel/retry tests; real-device capability matrix; no messages or calls to customers without explicit authorization. Provider acceptance and personal handoff are never reported as confirmed delivery.

### 7. Performance and reliability

Measure production/release builds with synthetic representative data on a mid-range Android and an iPhone. Capture model, OS, build SHA, dataset, network, sample count, and p50/p95 for launch, dashboard, lead lists, inventory/media, API latency, memory, and interaction feedback. Use at least 30 repeat samples for latency comparisons and describe cold/warm conditions.

Targets: warm launch <1s; cold usable UI <2s; navigation feedback <100ms; cached screen <300ms; scrolling near 60 FPS; crash-free sessions >=99.5%. Treat these as targets until measured. Crash-free rate needs a stated session population and observation window, not a local test estimate.

Use server pagination/indexes where measured, list virtualization, stable rendering, thumbnails/image caching, bounded requests, selective prefetch, stale-request cancellation, and non-blocking initialization. Offline snapshots are visibly stale and never authorize writes. Draft submission revalidates permissions, input, and current server state online. Do not retry a mutation after an ambiguous timeout unless the server supports safe idempotency or state reconciliation.

Acceptance: saved benchmark artifacts, measured bottleneck fixes, no fabricated results, and regression budgets applied in CI where repeatability permits.

### 8. Release preparation and handoff

Create actual mobile scripts for typecheck, lint, tests, Android/iOS development and release builds; document them after executing. Add React Native component tests and Maestro end-to-end journeys with synthetic accounts; run backend contracts/integration tests and affected web regressions. Test slow networks, large datasets, expired/revoked sessions, role changes, process death, interrupted uploads, denied permissions, empty/error states, and provider failures.

Capture and inspect every major screen on both OS families, including accessibility/text scaling. Separate emulator/simulator evidence from physical-device evidence. Prepare CI and manual release jobs without automatic production deployment, store upload, production migration, or over-the-air publishing.

Deliver source, playbook, parity matrix, API change log, environment/build guide, test reports, security findings, performance measurements, verified screenshots, release checklist, remaining gaps, and APK/AAB/iOS archive where signing/tooling permit. No production migration without reviewed SQL, fresh restore-tested DB/uploads backup, compatibility/rollback assessment, and explicit authorization.

Acceptance: every applicable feature accounted for, relevant checks pass, critical defects resolved, remaining blockers disclosed, and no unverified production-ready claim.

## Historical handoff evidence — recheck in the new clone

On 2026-10-16, GitHub main was `fb2afd7ad5dc0375b90eb35ebf778175a1c2ee27`. The original dirty branch was 71 commits behind. Its CRM build and 10 focused personal-sharing tests passed; the main JS chunk was about 2.66 MB. These are NOT clean-main, mobile, security, or device acceptance results.

Inspected main used one stored staff refresh token, task/project queries without explicit tenant filtering, and broad static upload serving. Global Prisma extensions and route guards still require analysis before concluding exploitability. Existing auth-mocked tests cannot establish isolation. Recent status documents reported broken nightly backups; current production backup status was not checked. The original Mac had command-line tools but no usable full Xcode; assess the new environment afresh.

## Agent kickoff

Read root AGENTS.md, .codex/AGENTS.md, agents/mobile/AGENTS.md, and this plan. Work only in this new clone. Build Android and iOS from scratch; ignore the old Android implementation. Complete the current-source audit, then proceed through tested implementation milestones without stopping at another plan or empty shell. Preserve all applicable business workflows and existing web behavior. Keep parity, security, performance, commands, and blockers current. No production deployment, migration, store submission, or live customer communications without explicit authorization. When a credential/device/tool is unavailable, continue independent work and state exactly what remains unverified.
