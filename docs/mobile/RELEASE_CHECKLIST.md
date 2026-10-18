# Mobile release checklist

Preparation snapshot: 2026-10-17 IST, `feat/mobile-apps` based on `fb2afd7ad5dc0375b90eb35ebf778175a1c2ee27` plus uncommitted work. **Release acceptance is open.** This document inventories gates; it does not authorize publishing, deployment, a production migration, signing-key changes, or customer communications. Native projects are generated/ignored; app config, lockfile, plugins and source are authoritative.

## Build identity and evidence boundary

| Item | Current source / observed generated value | Gate |
| --- | --- | --- |
| App / package | Realty Pandit; Android package and iOS bundle ID `in.realtypandit.crm.mobile`; scheme `realtypandit-crm` | Confirm ownership and store records before distribution; verified HTTPS app/universal links remain open |
| Version | `app.json` and package `0.1.0`; generated Android versionCode `1`, iOS CFBundleVersion `1` | Set and verify deliberate monotonically increasing distribution build numbers through reproducible config |
| Stack | Live Expo `~58.0.12`, Router `~58.0.21`, RN `0.88.0`, React `19.3.0` | [SDK_PATCH_EVIDENCE.md](SDK_PATCH_EVIDENCE.md) proves narrow patch application/install/check; final combined/native acceptance remains pending |
| Android | JDK 21 / Gradle 9.4.1; compile SDK 37, target 36, min 24 | Reinspect actual release artifact/ABI coverage; prior accepted native subset is ARM64 debug on API 34 emulator |
| iOS | Generated Podfile/Xcode deployment target **16.4**, phone-only app config; Info.plist also contains LSMinimumSystemVersion `12.0` | Treat 16.4 project/Pod target as build target; resolve/verify final archive metadata on equipped Mac; no iOS native build has passed |
| Signing | Generated Android `release` currently uses `signingConfigs.debug` | Block distribution until approved production upload/app signing is configured outside source and signature verified |
| API | `EXPO_PUBLIC_API_URL`, HTTPS origin enforced outside development; bundled public setting | Verify intended environment, TLS, scopes and no embedded secrets; do not ship loopback test origin |

Sources: `agents/mobile/app.json`, `package.json`, `plugins/withAndroidConfiguration.cjs`, generated `android/app/build.gradle`, merged debug manifest, `ios/Podfile`, `ios/RealtyPandit/Info.plist`, `ios/RealtyPandit.xcodeproj/project.pbxproj`; [BUILD.md](BUILD.md). Generated values are inspection evidence, not accepted release artifacts.

## Acceptance gates

- [x] Existing commands, generated build identity, source storage/permission behavior and explicit release limitations inventoried. [PRIVACY_INVENTORY.md](PRIVACY_INVENTORY.md) records data and native permission boundaries.
- [x] Narrow live SDK patch clean install and online compatibility recorded by its owner. Preserve `buildFromSource: ["expo-crypto"]`; the prior Crypto AAR/core ABI mismatch requires source compilation until compatible prebuilt evidence exists.
- [ ] Freeze source/lockfile/config hashes; finish final combined tests, types, lint, online Expo check, both Hermes exports and clean install. Root reports post-patch 63 tests/types/lint passed; earlier 23 attachment-focused tests remain scoped evidence. Exports/clean install and final combined-snapshot acceptance remain pending owner consolidation. Use [VERIFICATION.md](VERIFICATION.md) for final owner updates.
- [ ] Accept fresh Expo .12 / Router .21 Android runtime and repeat affected synthetic scenarios/captures. Root verified the fresh Android debug build succeeded in approximately seven minutes / 695 tasks; new APK runtime acceptance remains pending. Earlier .11 client encryption/offline/process-death/purge/picker/font evidence applies only to its stated snapshot; retain exact artifact hash and inspected capture manifest.
- [ ] Obtain full supported Xcode/iOS SDK and usable CocoaPods; native compile, simulator inspection and physical iPhone acceptance. Hermes iOS export is insufficient. Both are unavailable on this host at this checkpoint.
- [ ] Run scoped real-auth/database regressions and affected web compatibility at the final freeze. Current recorded backend evidence: 700 passed / 4 skipped unit tests and 30 separate real-auth PostgreSQL/Redis checks. Ordinary auth/Prisma mocks cannot prove isolation. Backend whole TypeScript still fails; fresh paired unchanged-baseline comparison is pending. CRM build/19 sharing contracts passed; website repeat completion remains pending.
- [ ] Close or explicitly account for all 151 [PARITY.md](PARITY.md) workflow rows and platform alternatives. Staff subset evidence does not accept partner/builder native sessions, recovery/setup/Google, full core/admin workflows, wizard staging-document privacy, encrypted assigned-record snapshots, push, maps/calls or provider workflows.
- [ ] Expand and execute synthetic end-to-end journeys. `npm run e2e` currently references one authored staff smoke flow; Maestro CLI execution has not passed. Test auth/revocation, permissions and role change, lead/contact CRUD, matching/deal progression, task/visit outcomes, upload/share, notification routing and session recovery as each becomes implemented.
- [ ] Complete Android and iOS screenshots/accessibility, large text, keyboard, Back/navigation, density/font changes, denial/cancel, slow/offline, empty/error, large pagination, process death, interrupted upload and storage-pressure acceptance. Preserve unsaved data and privacy on stale responses and identity change.
- [ ] Physical Android/iPhone and approved test-recipient provider matrix: ordinary/Business WhatsApp, saved/unsaved recipients, supported attachments/order/captions/cancel and actual FCM/APNs where implemented. OS handoff/provider acceptance is not delivery confirmation. No customer sends are authorized.
- [ ] Release-build performance: mid-range Android and iPhone, build SHA/device/OS/dataset/network/method, at least 30 samples and p50/p95. Targets remain warm <1s, cold usable <2s, navigation <100ms, cached render <300ms, near-60-FPS scroll. Crash-free >=99.5% needs a stated real population/window; none measured here.
- [ ] Resolve release-blocking security defects and advisory reachability. Applied-patch audit snapshot: 63 propagated entries (50 high, 13 moderate), four reviewed root sources (braces, node-forge, sprintf-js, uuid), observed tooling paths. This is neither runtime certification nor a reason for `audit fix --force`; see [SECURITY.md](SECURITY.md) and SDK evidence. Reassess exact final lockfile.
- [ ] Resolve background/process-death share/picker/upload temporary-file reconciliation, ambiguous-upload duplication limits and affected staging-document access before accepting those capabilities. Confirm draft/key/logout purge, expiry, backup/restore and revocation on both platforms. Broader legacy logs/providers and browser refresh limitations remain scoped open findings.
- [ ] Review final **release** merged Android permissions, FileProvider grants, cleartext/debug flags and iOS purpose strings/entitlements/privacy report. The inspected debug manifest has no `READ_MEDIA_IMAGES/VIDEO`, mic/contact/call-log/location permissions, but includes module legacy storage and development permissions; it does not prove release least privilege.
- [ ] Execute `.github/workflows/mobile-ci.yml` remotely and record revision/results. It authors mobile checks/exports and disposable DB backend tests; it does not build signed APK/AAB/iOS archives or run device tests. No remote pass observed. Add/verify explicit manual artifact jobs before relying on CI release generation; no automatic publish/OTA/deploy.
- [ ] Approve environment, signing ownership/rotation/recovery, release version and artifact provenance; generate APK/AAB and iOS archive, inspect signatures/entitlements/embedded API and hash each deliverable. Current debug APK requires Metro/API and is not a distribution build. No AAB, signed production APK or iOS archive accepted.
- [ ] Complete owner-reviewed privacy policy, retention/deletion mechanism, store privacy answers, permission explanations, review access/test account and screenshots from actual shipping behavior. Validate dependency privacy manifests/required-reason APIs in the iOS archive; do not infer compliance from config or this inventory.

## Manual build commands — authored, not executed here

Run package source checks described in [BUILD.md](BUILD.md) first. Existing package commands below are **local release-configuration build entry points only**, not signing, AAB/archive or store-upload acceptance:

```sh
cd agents/mobile
npm run build:android:release
npm run build:ios:release
```

After reproducible native generation and approved Android signing configuration, manual artifact generation can use the generated project. These commands are proposed procedures; no release artifacts or signatures were produced by this documentation task. They must not be mistaken for the already-executed debug command:

```sh
cd agents/mobile/android
./gradlew assembleRelease bundleRelease --console=plain --max-workers=1 -Dorg.gradle.parallel=false -I ../scripts/native-workers.gradle
```

Expected Gradle locations, subject to final variant/config verification: `app/build/outputs/apk/release/` and `app/build/outputs/bundle/release/`. Verify the actual certificate with installed Android signing tools, test a standalone install, and record artifact SHA-256/source revision/ABI coverage. Keep credentials outside the repository and logs. The current debug signing configuration fails this gate.

On an equipped Mac after `npx expo prebuild --platform ios --no-install` and supported pod installation, inspect generated workspace/schemes using Xcode. Then archive `RealtyPandit` for a generic iOS device through Xcode's Product → Archive, with the authorized team/profile and intended Release configuration. Verify bundle/build number, deployment target, embedded configuration, entitlements, privacy report and signing in Organizer before any separately authorized export/upload. Workspace/pods, signing identity and archive acceptance are unavailable here; no guessed `xcodebuild` signing flags or store credentials are provided.

## Production and publication stop gates

- [ ] Obtain explicit user authorization **for the specific** deployment, production migration, store submission, OTA publishing or customer/provider communication. Preparation and local tests grant none of these permissions.
- [ ] Before any production backend change: prove live revision/process/nginx/migration state, DB/Redis/queues/provider health, capacity and current guarded deployment path; preserve environment/uploads/logs/backups/server-only config. Do not execute legacy direct-copy scripts.
- [ ] Review additive `agents/backend/prisma/migrations/20261016010000_mobile_sessions/migration.sql` and compatibility with existing clients. Its rehearsal used disposable DB only. Require fresh verified DB **and uploads** backup, restore rehearsal, reviewed SQL, explicit migration approval and migration rollback/data compatibility assessment.
- [ ] Rehearse compatible application rollback and health/web/worker smoke checks. Database rollback is a separate manual decision; a previous app artifact alone does not establish DB compatibility. Production backups/restore/deployment/store state have not been verified.

Policy references checked 2026-10-16: [Apple app privacy details](https://developer.apple.com/app-store/app-privacy-details/), [Apple required-reason APIs](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api), [Expo privacy manifests](https://docs.expo.dev/guides/apple-privacy/), [Google Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en), [Google sensitive permissions](https://support.google.com/googleplay/android-developer/answer/16558241?hl=en). Apple/Google require accurate app and third-party data practices; Apple requires applicable API reasons. Final disclosure decisions and store acceptance remain open, not legally certified by this checklist.
