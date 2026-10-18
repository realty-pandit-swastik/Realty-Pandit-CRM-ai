# Independent mobile phase verification — 2026-10-16

Branch `feat/mobile-apps`, source base `fb2afd7ad5dc0375b90eb35ebf778175a1c2ee27` plus the existing uncommitted mobile/backend work. This verifier changes only this evidence file. Other agents own source fixes and native acceptance. No commit, push, deployment, production migration, server bootstrap, provider send or customer operation occurred.

Source-check checkpoint after combined upload/SDK freeze: independent final mobile **63/63 tests in 12 suites**, strict typecheck, complete lint and **online** Expo compatibility all pass. A 66-file source/config manifest remained unchanged through these checks. Applied package/lock match the SDK owner's isolated clean-install proof byte for byte. Both final Hermes exports, fresh paired backend TypeScript comparison and bounded website retry remain pending the native owner's idle resource window; no final native acceptance is implied.

Read root/mobile instructions and the task/project, draft, security, build and milestone evidence. `graphify query "How are mobile tests exports and real-auth integration configured?"` succeeded against the current graph. Package scripts and test configurations were inspected before execution. Checks run sequentially, with backend workers capped at two.

## Executed results

| Check | Independent observation |
| --- | --- |
| Backend unit/regression suite | Passed: 100 files / 700 tests; 2 files / 4 tests skipped. Existing global auth/Prisma mocks mean this is not authorization evidence. |
| Separate mobile real-auth integration | Fresh resumed run passed: 3 files / **30 tests** (tasks 10, sessions 11, objects 9), 3.92s; real middleware/Prisma/disposable PostgreSQL/Redis, including latest privacy regressions. |
| Backend TypeScript retained-log comparison | Historical retained-log comparison: baseline 401/current 390, zero new occurrences and 11 removed after normalization/`Counter`. This precedes latest privacy source. Latest 390 count alone is insufficient; fresh paired comparison pending. Full typecheck fails. |
| Isolated mobile `npm ci`, applied SDK configuration | SDK owner's isolated clean install passed: 1,137 added / 1,138 audited in 14s; live clean install passed in 20s. This verifier inspected logs and independently verified both files byte-equal to that isolated installed snapshot; no redundant reinstall. Earlier pre-patch install evidence remains historical below. |
| CRM production build | Passed; existing large-chunk warning, main JS 2,550.92 kB / gzip 678.01 kB. |
| CRM personal WhatsApp contracts | Passed: 19/19. No provider execution. |
| Website loopback production build | **Interrupted / unverified**: successful compilation, TypeScript, 44/44 prerenders and route table were emitted, but the process remained active for over six minutes. Only task-owned npm/Next/PostCSS processes were terminated; exit 143. This is not a build pass. |
| Final mobile Jest suite | After final Notice/SDK freeze: **12 suites / 63 tests passed**, 12.057 seconds. |
| Final mobile typecheck / lint | Both independently passed after final Notice/SDK freeze. |
| Online Expo compatibility | Independently passed after SDK patch: `Dependencies are up to date`. Earlier online failure/offline warning remain historical evidence below. |
| Android / iOS Hermes exports | Historical pre-patch 2.9 MB exports passed with two Metro workers. Final SDK/source exports pending native idle; exports are not native iOS acceptance. |

## Commands and artifacts

Backend, from `agents/backend/`:

```sh
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test npm test -- --maxWorkers=2
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test DATABASE_URL=postgresql://mobile_test:local_disposable@127.0.0.1:55432/mobile_test ./node_modules/.bin/vitest run --config vitest.mobile-integration.config.ts --maxWorkers=2 --silent
```

Logs: `/tmp/rp-mobile-verification-backend-unit.log` and `/tmp/rp-mobile-verification-backend-integration.log`. The integration setup rejects all databases except disposable `127.0.0.1:55432/mobile_test`, fixes Redis to `127.0.0.1:56379`, and has no global auth/Prisma mocks. Provider seams are stubbed. Fixtures use IDs distinct from the running native preview and clean up their own records. No container, preview, Metro or emulator operation was performed by this verifier. Existing Vite CommonJS config/native-loader warning did not affect test results.

TypeScript logs compared: `/tmp/rp-mobile-backend-baseline-tsc.log` and `/tmp/rp-mobile-backend-security-tsc.log`. Normalization removes `/private/tmp/rp-mobile-baseline/` versus repository path prefixes and diagnostic line/column positions; diagnostic text/file/code and duplicate counts are preserved.

Clean install used only copied `package.json` / `package-lock.json`, with `env -i PATH="$PATH" HOME="$HOME" npm ci`, in `/var/folders/3_/6gqkc5092s32y73px6l4fwf40000gn/T/rp-mobile-clean-install-r_ojpm6a`; live `node_modules` was not changed. Node 22.23.2 / npm 10.9.8. Initial package SHA-256 `7322dace3f35c7e6c315e57b5d1bfc5e94b921669199ac41b0c34f09713562b4`; lock SHA-256 `2d49f0a250eabc2545aea8e2d177c841f7c902a687b6def4dbf7d4cdd6bcb4ec`. Log: `/tmp/rp-mobile-verification-clean-install.log`.

The install reports the already acknowledged 62 advisories (13 moderate, 49 high), nested Expo Worklets / RN and Jest watch-typeahead peer warnings, dependency deprecations, and pending install-script coverage for `@parcel/watcher`, `fsevents`, `unrs-resolver`. No forced fixes, dependency edits or script approvals were performed.

After combined source refreeze, the final package snapshot was installed in `/var/folders/3_/6gqkc5092s32y73px6l4fwf40000gn/T/rp-mobile-final-clean-install-bqsll4_u` using the same minimal `npm ci` command. The final package SHA-256 is `b47259524f0dbfabd910755c3d9300ff85c2f233d0d4ee39bfc29eb3573085fd`; the lock SHA-256 remains `2d49f0a250eabc2545aea8e2d177c841f7c902a687b6def4dbf7d4cdd6bcb4ec`. Both final source files remain byte-equal to this installed snapshot. Final log: `/tmp/rp-mobile-verification-final-clean-install.log`.

Mobile, from `agents/mobile/`, after combined native/response-parser refreeze:

```sh
env -i PATH="$PATH" HOME="$HOME" npm test
env -i PATH="$PATH" HOME="$HOME" npm run typecheck
env -i PATH="$PATH" HOME="$HOME" npm run lint
env -i PATH="$PATH" HOME="$HOME" CI=1 EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_URL=https://mobile-verification.invalid npm run bundle:android -- --max-workers 2
env -i PATH="$PATH" HOME="$HOME" CI=1 EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_API_URL=https://mobile-verification.invalid npm run bundle:ios -- --max-workers 2
```

Logs: `/tmp/rp-mobile-verification-mobile-tests.log`, `/tmp/rp-mobile-verification-mobile-typecheck.log`, `/tmp/rp-mobile-verification-mobile-lint.log`, `/tmp/rp-mobile-verification-android-export.log`, `/tmp/rp-mobile-verification-ios-export.log`. Exports are generated under ignored `agents/mobile/dist/`. The `.invalid` origin is an explicit nonsecret build configuration; no API runtime request is part of these exports. A SHA-256 manifest of 56 app/source/config files in `/tmp/rp-mobile-verification-source-manifest.json` was unchanged after both exports.

CRM, from `agents/frontend/`:

```sh
env -i PATH="$PATH" HOME="$HOME" VITE_API_URL=http://127.0.0.1:7071 VITE_GLITCHTIP_DSN= VITE_SENTRY_DSN= npm run build
env -i PATH="$PATH" HOME="$HOME" npm run test:personal-whatsapp
```

Logs: `/tmp/rp-mobile-verification-crm-build.log`, `/tmp/rp-mobile-verification-crm-sharing.log`. `VITE_API_URL` is not the client's actual `VITE_API_BASE_URL` setting; this build-only check did not make browser/API requests or establish runtime API configuration. No local environment file existed beyond `.env.example`.

Website, from `agents/website/`:

```sh
env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_API_URL=http://127.0.0.1:7071 NEXT_PUBLIC_SITE_URL=http://127.0.0.1:7575 npm run build
```

Log: `/tmp/rp-mobile-verification-website-build.log`. No local environment files were present; telemetry/provider credentials were absent. The script used Next's default seven prerender workers, so the desired two-worker bound was not achieved. A retry is deferred until native acceptance completes, without changing tracked website configuration. Installed Next source at `node_modules/next/dist/server/config-shared.js:218` computes default CPUs from `CIRCLE_NODE_TOTAL` minus one; `node_modules/next/dist/build/index.js:379` uses this as its worker count. Thus a future isolated run can use `CIRCLE_NODE_TOTAL=3` for two page workers without tracked config edits. The previous baseline website pass is separate historical evidence, not this run's result.

## Final SDK/source light-check checkpoint; resource-heavy gates pending

Fresh checks used Node 22.23.2 / npm 10.9.8 and the same minimal environments and synthetic local services as above. [`verification-results.json`](verification-results.json) retains all resumed result counts, exact commands, log SHA-256 values, final 66-file source/config hashes and historical source-timing distinctions. Temporary logs may disappear.

After final attachment Notice/assertion and live SDK freeze, from `agents/mobile/`:

```sh
env -i PATH="$PATH" HOME="$HOME" npm test
env -i PATH="$PATH" HOME="$HOME" npm run typecheck
env -i PATH="$PATH" HOME="$HOME" npm run lint
env -i PATH="$PATH" HOME="$HOME" CI=1 EXPO_NO_TELEMETRY=1 npx expo install --check
```

All exited 0: **63 tests / 12 suites** in 12.057s, strict types, complete package lint and online compatibility. Final logs are `/tmp/rp-mobile-post-sdk-{tests,typecheck,lint,check}.log`. Source/config hashes remained unchanged after the checks. Jest and typecheck briefly overlapped while the native owner explicitly permitted light checks; the ordinary Jest runner remained in-band. No timing is a performance benchmark.

Applied package SHA-256 is `f4660a79707f1a4d25f9d9dda2e0668e64fe2d08917bf30a3a8895f39bda4700`; lock is `a1560d12de6efec892ace6e695a3a4b5b6b62bec98ff68942089d0d42fc8a876`. This verifier directly compared each file with `/var/folders/3_/6gqkc5092s32y73px6l4fwf40000gn/T/rp-sdk-patch-fgh3txa1` and inspected the SDK owner's staged/live clean-install logs: 1,137 packages added / 1,138 audited, 14s isolated and 20s live. They match the reviewed applied hashes and [SDK patch evidence](SDK_PATCH_EVIDENCE.md); no third identical install was needed. The current audit summary is 63 affected package entries (50 high/13 moderate), with the SDK owner's same-source/path interpretation and existing mitigation gates; no forced fixes or script approvals occurred.

The first resumed mobile run passed 63 tests/types/lint before the final cached-refresh Notice/assertion. Its original online SDK check failed on Expo 58.0.11 / Router 58.0.20; an offline check warned that validation was unreliable and did not clear that gate. Both are historical observations now superseded by the final patched online pass, rather than hidden failures.

Fresh real-auth integration independently passed **30/30**, 3 files, 3.92s. Calendar GET/PATCH regressions exercise canonical owner/location omission and own/uploaded/shared/super-boss exceptions. Task regression confirms project endpoint denial and exact nested ID/name projection for the delegated task. This verifier read the current attachment component/caller/regressions: ambiguous upload requires explicit successful check, review and confirmation before another POST; failed/offline/background refresh cannot unlock it, selected input remains, and appended photos are reviewable.

A new unique detached baseline at the base commit is prepared with current backend dependencies symlinked; its temporary path is in the structured report. No fresh compiler has run. Native acceptance requested that 8GiB TypeScript and website builds wait until its rebuild/runtime window ends. Latest 390-diagnostic count alone does not establish zero new diagnostics; the prior retained-log comparison remains a separate historical observation. The bounded website retry (`CIRCLE_NODE_TOTAL=3`, safe loopback URLs, no provider environment) and final two-worker Hermes exports remain pending. This verifier has not operated native processes, containers, ADB, Metro or preview, and has not mutated source/dependencies.

## Limits and outstanding work

Native Android acceptance is owned by the implementation agent. Its runtime Crypto first-use failure triggered the native source-build configuration fix present in the final automated snapshot. Native iOS compilation/inspection remains blocked by missing full Xcode/CocoaPods. Hermes export alone cannot prove native runtime or release acceptance.

No physical-device, release signing/performance, Maestro, remote CI, live provider, production, or full web UI acceptance is claimed. Existing broad parity gaps and npm advisory risk remain. Website completion remains unverified in this independent run.

## Continuation verification and navigation correction — 2026-10-17

This checkpoint supersedes the pending-export/paired-TypeScript/website gates above. `origin/main` was rechecked through `git ls-remote` and remains `fb2afd7ad5dc0375b90eb35ebf778175a1c2ee27`. The original 66 frozen hashes matched before work. No dependency or backend source changed in this continuation.

Native acceptance found create → edit → save → delete → Back reopening the cached deleted project. Eight return calls in the existing project form/detail and task edit/detail now use Expo Router `dismissTo`, preserving confirmation, cache removal, API scope and the existing layout. The new `Navigation.test.tsx` uses the real Expo Router stack and actual forms/details: both journeys failed before the correction and pass afterward. Its controlled synthetic API is test-only.

| Latest executed check | Result |
| --- | --- |
| Focused history + existing task/project component regressions | 6 passed / 2 suites |
| Full mobile Jest | **65 passed / 13 suites**, 7.783s |
| Mobile strict TypeScript / full lint | Both exited 0 |
| Final Android / iOS Hermes exports after navigation correction | Both exited 0, two Metro workers, `.invalid` nonsecret API configuration; 2.9MB Android / 3MB iOS |
| Website production build retry | Exited **0** with `CIRCLE_NODE_TOTAL=3` (two page workers), loopback API/site URLs and no provider environment; prior interrupted run remains historical |
| Fresh unchanged-baseline / workspace backend TypeScript | Both fail overall, exit 2: **401 / 390 diagnostics**, **zero new / 11 removed** occurrences after exact checkout-root aliases and line/column normalization; duplicate counts preserved |
| Android history confirmation | Both synthetic create/edit/save/delete/Android Back journeys passed on the patched SDK debug client with corrected JS delivered by Metro; six captures opened and accepted |

Exact commands, log hashes, the fresh diagnostic comparison, six capture hashes and current **67-file** source/config manifest are retained in `verification-results.json`. Logs use `/tmp/rp-mobile-continue-*` and `/tmp/rp-mobile-navigation-*`. The website retry used `CI=1 NEXT_TELEMETRY_DISABLED=1 CIRCLE_NODE_TOTAL=3 NEXT_PUBLIC_API_URL=http://127.0.0.1:7071 NEXT_PUBLIC_SITE_URL=http://127.0.0.1:7575 npm run build` in a minimal environment. Both backend compiler runs used the installed TypeScript with `NODE_OPTIONS=--max-old-space-size=6144`, the prepared unchanged detached baseline and current workspace sequentially. No failing check was weakened.

Existing backend 700/4 and real-auth 30-test evidence, CRM build/19 sharing tests and clean SDK install/online compatibility were not needlessly repeated: their source/contracts/dependencies did not change. The six Android images establish this correction only. Native iOS, physical devices, release signing/performance, full parity, provider/store/production acceptance and dependency-advisory mitigation remain open. The continuation stopped its own emulator and Metro; the existing disposable API/services were preserved.
