# Realty Pandit Mobile — Engineering Playbook

## Status, scope, and instruction hierarchy

This file belongs at `agents/mobile/AGENTS.md` in a fresh clone of Realty-Pandit-CRM-ai. It governs this directory and descendants. Preserve and read the repository root `AGENTS.md`, `.codex/AGENTS.md`, and any nearer instructions before working. Backend edits remain governed by backend/root instructions; this file does not authorize changes outside its scope on its own.

Current status (2026-10-17): milestone 1 inventory/baseline is recorded; fresh Expo 58 / React Native 0.88 staff workflows, task/Work project actions and encrypted lead-note/new-task drafts exist. Expo .12 / Router .21 / core .20 clean installs and online compatibility passed; final ARM64 debug build passed and was installed. Scoped patched-client login/draft/picker/task/project checks ran. Native testing found duplicate task/project history after edits/deletion; eight return calls now unwind with `dismissTo`, with two real-router regressions and both Android Back journeys verified. Latest mobile checks pass 65 tests/13 suites, strict types, full lint and both Hermes exports. Website bounded build exited0; fresh backend compiler comparison is baseline401/current390, zero new/11 removed diagnostics (whole typecheck still fails). Six correction captures were opened/accepted; earlier final-SDK capture inventory/design handoff remains separate. Native iOS is blocked by missing full Xcode/CocoaPods. Milestones 2–8 and full role/workflow/release acceptance remain open. See `../../docs/mobile/VERIFICATION.md`, `../../docs/mobile/NATIVE_ACCEPTANCE.md`, `../../docs/mobile/PARITY.md` and `MOBILE_PLAN.md`.

Build fresh Android/iOS applications. Ignore the old `agents/android/` app and helpers: no dependency, extension, migration, or deletion as part of this work. Preserve existing web functionality. Serve staff, managers, super administrators, partners, and builders; public consumer journeys remain on the website.

## Start every task with evidence

- Check repository root, current branch/revision, `git status --short`, package scripts, and applicable instructions. Preserve unrelated changes; never reset, clean, stash, or overwrite them implicitly.
- Verify current `origin/main` before major implementation. Use a dedicated feature branch; reconcile upstream changes deliberately, never with a blind pull into dirty work.
- Read `docs/PROJECT_STATUS.md`, focused architecture/decision/runbook/precaution documents, and actual source. Old complete/production-ready claims are historical evidence only.
- When `graphify-out/graph.json` exists, use `graphify query` first for codebase questions, then verify source. Prefer the wiki index for broad navigation when present. Dirty graph output is expected. Follow root graph instructions; update Graphify after source edits.
- Trace each changed flow through callers, API, auth/scope, service/workflow, schema, tests, and every web/mobile consumer affected. Fix the narrow shared cause.
- Before designing or implementing UI, follow the installed design skills and the required design pass below. Do not skip directly to UI code.
- Keep ongoing work in the available project work-state tool. If unavailable in this workspace, maintain concise checked-in mobile status with remaining work and evidence; do not silently lose handoff state.

## Installed design skills and required design pass

- Read `.agents/skills/impeccable/SKILL.md` from the repository root for every new UI task; use its Operate/native guidance for this CRM. Run its context step once per session as instructed, with the documented fallback if unavailable.
- Read `.agents/skills/emil-design-eng/SKILL.md` before UI implementation; apply relevant hierarchy, interaction, accessibility, and motion principles to React Native.
- `.agents/skills/gpt-tasteskill/SKILL.md` is installed as skill name `gpt-taste`. Use it only where its visual direction fits the requested surface. Its AIDA, GSAP/DOM, bento, editorial-layout, randomization, and marketing-page prescriptions are not requirements for native CRM screens.
- Before UI code, establish the screen purpose, role/actions, information hierarchy, components, loading/empty/error/offline states, and platform interaction behavior. Record the chosen direction concisely in the relevant feature/design notes, then implement and inspect actual native screenshots.
- The user's navy/teal/soft-white/slate palette, functional parity, native behavior, accessibility, and performance requirements take precedence over conflicting skill defaults. Adapt web-specific guidance to native APIs; do not introduce web animation libraries into native UI to satisfy a skill.

## Architecture and structure

- Target TypeScript + React Native + Expo development builds, Expo Router, TanStack Query, SecureStore. Verify current compatible versions through official documentation, install only necessary modules, and lock dependencies. No Expo Go-only acceptance claims.
- `app/`: route/layout declarations. `src/features/`: domain screens and feature behavior. `src/components/`: genuinely reused controls. `src/api/`: transport/contracts. `src/theme/`: tokens. `src/storage/`: secure snapshots/drafts. Do not pre-create empty abstractions or feature layers.
- Express is the business authority. PostgreSQL/Prisma remains durable storage; Redis/BullMQ retains queues, scheduling, and coordination. No duplicate mobile backend, database access from clients, or provider-secret embedding.
- Derive contracts from current backend routes, validators, schema, and services. Browser Axios code is a contract reference, not a safe native drop-in. Reuse pure utilities only when they have no DOM/server dependencies and retain tests.
- TanStack Query owns server state; component state owns UI/forms. No second global state library without a demonstrated need. Keep query keys account/tenant/role scoped and clear sensitive caches on logout or identity change.
- Prefer native stacks and familiar controls. Tabs: Home, Leads, Inventory, Tasks, More; expose all additional permitted business functions in More. Role-specific homes and destinations must preserve discoverability and server restrictions.
- New native behavior must use supported Expo modules/plugins or small documented native modules. Record why custom code is needed; do not introduce a dependency for trivial logic.

## Code and API rules

- Strict TypeScript for new code. Use descriptive names, domain modules, small clear functions, and explicit boundary types. No blanket `any`, disabled lint, or unchecked casts to bypass contracts.
- Reuse existing patterns and platform APIs. Choose the smallest complete change; no speculative wrappers, options, fallback data, or abstractions.
- Centralize API configuration, bearer attachment, error mapping, cancellation, and bounded timeouts. Single-flight refresh; retry authentication at most once. Do not retry login errors or create refresh loops.
- Treat network timeouts as ambiguous for writes. Automatically retry mutations only with a proven idempotency/reconciliation contract. Never automatically retry provider sends.
- Surface actionable errors and preserve unsaved input. Do not convert failed loading into empty data or success. Buttons must perform real authorized actions; unfinished features remain explicit parity gaps.
- Never change canonical phone normalization, rupee/lakh conversions, property taxonomy, lifecycle rules, pricing visibility, ownership, assignments, or workflow writes independently in the client.
- Add backward-compatible backend changes only when current APIs cannot safely serve a required capability; test affected existing clients. No wholesale framework, schema, or root workspace rewrite.

## Native product design

- Palette: Deep Navy `#10243A`, Emerald Teal `#087F75`, Soft White `#F7F9FB`, Slate Gray `#526174`. These are starting tokens; validate contrast for each actual use. Keep Realty Pandit name/logo. Semantic status colours must be consistent and cannot carry meaning alone.
- Use system fonts, a consistent type/spacing scale, restrained borders/radii, scannable rows, clear primary actions, and useful density. Avoid gradients, glows, oversized rounded cards, decorative illustrations, invented metrics, and repetitive dashboard tiles.
- Implement safe areas, keyboard avoidance, Android Back, platform navigation, text scaling, screen-reader labels/focus, and minimum 44pt iOS/48dp Android touch targets.
- Every async surface needs accurate initial/loading/empty/error/retry/offline states. Preserve visible content during refresh when safe. Destructive actions require clear confirmation or a safe undo.
- Animations convey state, remain brief, respect reduced motion, and never gate an action or delay usable UI. No decorative startup choreography.
- Inspect actual Android and iOS screenshots for each major screen and important error/keyboard state. Batch material fixes and confirm; do not substitute browser viewport captures for native evidence.

## Performance and offline behavior

- Targets, measured in release builds: warm launch <1s, cold launch to usable UI <2s, navigation feedback <100ms, cached render <300ms, scrolling near 60 FPS, crash-free sessions >=99.5%. Never label a target achieved without evidence.
- Record device model/OS, build SHA, dataset, network, sample count, cold/warm definition, p50/p95, and profiling method. Crash-free claims require an actual population and observation window.
- Paginate large lists, virtualize rows, bound image dimensions/downloads/cache, use thumbnails, cancel stale requests, deduplicate work, and avoid loading every CRM dataset during boot.
- Restore credentials asynchronously and initialize nonessential services after usable UI. Prefetch only likely next data; avoid redundant focus/remount requests. Measure before adding memoization or dependencies.
- Offline v1 is bounded encrypted assigned-record snapshots and local drafts. Do not persist unrestricted API/query caches, documents, or media by default. Store encryption keys in OS secure storage, not app config or the same plaintext file.
- Partition snapshots/drafts by account and tenant; purge on logout, expiry policy, account change, or detected revocation. Show stale/offline status. Recheck session, permission, and current server state before online submission. No offline sends or automatic mutation queue.
- Query optimizations must preserve scope, pagination correctness, and consistency. Add database indexes only with query evidence and reviewed migration SQL.

## Security and preserved business rules

- Preserve tenant, ownership, manager hierarchy, assignment, sharing, role, and partner default-deny boundaries at the server. Client permission checks are UX only. Builder/partner/staff identities are distinct; never accept one token type as another.
- Implement multi-device mobile sessions with hashed rotating refresh credentials, replay protection, expiry, account-status validation, and per-session revocation. Retain browser cookie/CSRF behavior. Test that revocation becomes effective server-side; client token deletion alone is insufficient.
- Store refresh credentials in SecureStore; access credentials in memory where practical. Never use AsyncStorage/plain files for tokens, sensitive drafts, or customer snapshots. Biometrics are optional local unlock, not replacement server authentication.
- Never place API/provider secrets, signing keys, private records, auth headers, tokens, full URLs with identifiers, or customer payloads in source, logs, screenshots, telemetry, or fixtures. Redact crash/error reporting. Public Expo environment variables are bundled and are not secret storage.
- Validate upload size, MIME/content, safe filenames, authorization, and temporary-file lifetime. Protect private recordings/documents; maintain intentional public listing media. Do not expose a file merely because its URL is hard to guess.
- Deep links and notifications are untrusted inputs. Validate destinations, authenticate, then authorize records. No credentials in links or notification payloads. Use verified app/universal links where available.
- Preserve phone identity, demand/inventory taxonomy, price redaction, approval gates, workflows, and transaction boundaries. Add regression coverage whenever changing these concerns.
- Use synthetic test data and local/test-only databases. Never use production customer records, uploads, or provider sends for casual development.

## Android/iOS and provider behavior

- Implement system camera/photo/file pickers, downloads, PDFs, maps, foreground location, lifecycle/network handling, and optional biometrics with least permissions and useful denial/cancel flows.
- Choose minimum supported OS and build toolchain from the selected current Expo SDK; record exact verified versions. Do not copy obsolete target SDKs from the existing Android app.
- Use native notification registration plus backend FCM/APNs delivery. Keep web push working. Bind registration/removal to the authenticated account, handle token changes/invalidations, and authorize every opened record.
- Company WhatsApp uses existing backend authorization and approved provider flows. Personal WhatsApp uses explicit user-initiated sharing and actual selected attachments. Test ordinary/Business, saved/unsaved recipients, photos/video/mixed media/PDF, caption/order/cancel behavior per OS.
- Do not promise exact personal recipient targeting, automatic sending, or confirmed delivery without a supported proven contract. No undocumented `jid` workaround, AccessibilityService automation, contact-book modification, or hidden sends.
- Calling uses supported dialler actions, CRM outcomes, permitted recording import, and existing verified provider processing. Never assume cellular call recording, call-log permissions, or background capture is available or store compliant. Record platform alternatives and unmet requirements explicitly.
- OAuth and required external authorization/payment flows may use the system browser with secure state/return validation. CRM feature screens must not be replaced by website links.
- Handle cancellation, interrupted uploads, app termination, low storage, unavailable apps/providers, permission denial, and session expiry. Clean temporary share files and grant only necessary file access.

## Tests and executable commands

Executed package commands: `npm test`, `npm run typecheck`, `npm run lint`, `npx expo install --check`, and Android/iOS Hermes exports through `npm run bundle:android` / `npm run bundle:ios`. After the navigation correction: 65 tests in13 suites, strict types, full lint and both exports pass. Applied Expo .12 / Router .21 / core .20 has live/isolated clean-install and online compatibility evidence. Backend prior unit evidence is700 passed/4 skipped and30 separate real-auth DB checks; fresh paired TypeScript is401 baseline/390 current with zero new and11 removed diagnostic occurrences, while whole typecheck fails. Bounded two-worker website build now exited0. Android ARM64 build/installation and scoped synthetic runtime have evidence; source-only navigation correction was confirmed via Metro on that patched debug client. Build uses the command in `../../docs/mobile/BUILD.md` and narrow `expo-crypto` source-build override. Earlier `expo-doctor`19/20 with CocoaPods unavailable is historical. Release scripts/Maestro are authored, unaccepted. Native iOS, release and provider acceptance remain open. See `../../docs/mobile/VERIFICATION.md`.

Existing repository commands below were inspected in package manifests; their presence is not a current pass result. Run from the stated package and verify scripts again after updates:

| Package | Existing commands |
| --- | --- |
| `agents/backend` | `npm test` (Vitest; focused paths supported) |
| `agents/frontend` | `npm run build`, `npm run lint`, `npm run test:personal-whatsapp` |
| `agents/website` | `npm run build`, `npm run lint` |
| `agents/call-gateway` | `npm test` (requires compatible Node TypeScript-strip support) |

- Add React Native unit/component checks and Maestro journeys for login, lead/contact CRUD, matching/deal progression, task/visit completion, upload/share, notifications, and session recovery. Fixtures may be synthetic; production runtime paths may not use fake APIs.
- Security tests must exercise real auth and scopes. Global auth/Prisma mocks cannot prove isolation. Add cross-tenant/cross-role/object-ownership failures and inactive/revoked/replayed-session cases.
- Use disposable PostgreSQL/Redis for integration, transaction, migration, and concurrency behavior. Keep test/provider credentials and processes isolated. Mocked unit races alone do not prove database concurrency.
- Run focused checks after meaningful changes, then affected package/build/regression checks. Do not disable validation or loosen security to pass CI. Attribute baseline failures using an unchanged baseline comparison.
- Test slow/offline networks, large lists, interrupted uploads, expired sessions, restart/process death, permission denial, stale responses, empty data, and provider errors. Inspect accessibility and real device behavior where available.
- Update `docs/mobile/PARITY.md` with separate Android/iOS status, commands, evidence, and blockers. Emulator/simulator, physical-device, provider, and production verification are distinct.

## Workflow, release gates, and definition of done

- Implement tested milestones from the plan. Do not stop at documentation or an empty shell when implementation is authorized. External blockers apply only to dependent work; continue independent capabilities.
- Report what changed, what passed, what failed, and what remains. Update this file when architecture, commands, platform constraints, or verification truth changes.
- Review dependencies, error paths, security/data effects, all callers, and meaningful tests before declaring a feature complete. No fake APIs, dead buttons, placeholder metrics, silent exclusions, or unverified success claims.
- CI should run mobile validation and affected backend/web checks; release generation remains an explicit job. Do not automatically publish OTA updates, upload to stores, deploy, or change production configuration.
- No production migrations without explicit authorization, reviewed compatible SQL, fresh verified database/uploads backup, restore rehearsal, and rollback assessment. Never copy old secrets or run legacy deploy scripts blindly.
- Prepare Android APK/AAB, iOS archive, privacy disclosures/manifests, permission explanations, signing/environment instructions, and store-review materials where tooling permits. Signing credentials stay outside source control. Builds alone do not prove runtime correctness or store acceptance.
- Release completion requires applicable parity accounted for, relevant tests and supported device acceptance evidence, measured performance, resolved release-blocking security defects, web compatibility, verified build procedures, and an honest blocker/limitation inventory.

## Current limitations

Staff native sessions, shared record scopes, finalized-document access, calendar nested-property/task nested-project privacy and a daily-work/task-project slice have scoped regression evidence; this does not certify untouched workflows. Partner/builder native sessions, recovery/setup/Google, full core/admin parity, wizard staging-document privacy, encrypted assigned-record snapshots, push, physical-device/provider checks, release signing and measured performance remain open. Lead-note/new-task encrypted drafts have automated and pre-patch Android encryption/offline/reconnect/process-death/conflict/create subset evidence; task/project edit forms have no persisted draft guarantee. Native owner opened 18 current pre-patch screenshots: 16 accepted and two diagnostics excluded; pre-patch discard, font-scale/density/lifecycle/picker, logout vault/key purge and other-session revoke→401 passed. Separate final design review and broad final-SDK capture inventory remain pending; six navigation-correction captures were opened/accepted and both Android Back regressions passed. Browser refresh remains a separate legacy contract. Appointment creation/rescheduling is not exposed in native UI; its legacy creation/provider path needs its own security/acceptance pass. Ambiguous upload now requires explicit successful server check plus user review/confirmation before another POST; this is manual review, not deduplication or a durable process-death ledger. Private/PDF share handoff has identity/abort/purge guards, but an OS sheet already invoked cannot be retracted and background/process-death temporary-file reconciliation remains open. Existing CRM build/19 sharing checks passed; bounded website retry now exited0. Latest mobile65 tests/types/lint/both exports pass; applied SDK clean installs/online check and scoped patched-client runtime have evidence. Prior source review resolved its three original findings; full independent phase closure and documenter/design handoff remain open. No production backup/restore, deployment or store state was verified. Full Xcode/CocoaPods are unavailable on this Mac.
