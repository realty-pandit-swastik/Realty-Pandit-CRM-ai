# Mobile build and test guide

Local development only. No deployment, production database command, signing-key upload, store submission or customer communication is part of these procedures.

## Source and environment

The fresh app is `agents/mobile/`; `app.json`, TypeScript source and the lockfile are authoritative. Native `android/` and `ios/` projects are generated and ignored. No code from `agents/android/` is used.

Use Node 22.23.2 / npm 10.9.8. From `agents/mobile`:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npx expo install --check
npx expo-doctor
npm run bundle:android
npm run bundle:ios
```

Current source-check counts and exact snapshots belong to VERIFICATION.md; earlier 20-test results are historical. Re-run source checks and both exports after a source/dependency correction. CocoaPods/full Xcode remain unavailable. Clean lockfile installs are recorded separately. The online SDK compatibility check can change its recommended patch versions independently of a local source freeze; inspect SDK_PATCH_EVIDENCE.md for the staged/final patch state. The app deliberately reports a configuration error when `EXPO_PUBLIC_API_URL` is absent or invalid. It accepts HTTPS origins; development alone permits loopback/Android-emulator HTTP. This public value is bundled and must contain no secrets.

## Isolated API acceptance environment

Use disposable PostgreSQL at `127.0.0.1:55432/mobile_test` and Redis at `127.0.0.1:56379`. Do not substitute another database: the integration setup refuses it. The local containers created during this task are `rp-mobile-postgres` and `rp-mobile-redis`; existing repository containers were preserved.

From `agents/backend`:

```sh
DATABASE_URL=postgresql://mobile_test:local_disposable@127.0.0.1:55432/mobile_test npx prisma generate
DATABASE_URL=postgresql://mobile_test:local_disposable@127.0.0.1:55432/mobile_test npx prisma db push --skip-generate
DATABASE_URL=postgresql://mobile_test:local_disposable@127.0.0.1:55432/mobile_test npx vitest run --config vitest.mobile-integration.config.ts
npm test
```

`db push` here is test-schema setup, not a production migration procedure. The reviewed additive SQL is `agents/backend/prisma/migrations/20261016010000_mobile_sessions/migration.sql`; it was exercised only on this disposable database. The separate integration runner uses real auth/Prisma and mocks provider delivery. The ordinary unit runner's global auth/database mocks do not establish authorization.

For native acceptance, run the guarded preview entry point with a minimal environment:

```sh
env -i PATH="$PATH" NODE_ENV=test \
  JWT_SECRET=synthetic-preview-only-not-a-deployment-key \
  AGENT_JWT_SECRET=synthetic-preview-portal-only-not-a-deployment-key \
  DATABASE_URL=postgresql://mobile_test:local_disposable@127.0.0.1:55432/mobile_test \
  REDIS_HOST=127.0.0.1 REDIS_PORT=56379 \
  ./node_modules/.bin/ts-node --transpile-only src/integration/mobile_preview.ts
```

These are explicit synthetic test credentials, never deployment secrets. The preview binds only `127.0.0.1:3303`, seeds `.invalid`/synthetic records through the unextended Prisma client and never imports `server.ts` or starts workers. It refuses other databases, non-test mode and external credential/telemetry environment variables. Do not boot the full production server for these checks.

## Android development build

Verified tools: Temurin JDK 21, Android SDK under the normal user Library path, Gradle 9.4.1, compile SDK 37 / target 36 / min 24. Generate from `agents/mobile`:

```sh
npx expo prebuild --platform android --no-install
```

Then from `agents/mobile/android` (substitute installed JDK/SDK paths when different):

```sh
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home \
ANDROID_HOME=/Users/avnish/Library/Android/sdk \
./gradlew assembleDebug --console=plain --max-workers=1 \
  -PreactNativeArchitectures=arm64-v8a -Dorg.gradle.parallel=false \
  -I ../scripts/native-workers.gradle
```

An earlier ARM64 build passed before encrypted-draft native dependencies were added. The corrected pre-SDK-patch draft-enabled build passed in57s/695tasks, APK SHA-256 `9de8a8a88d0ae55ecdb1eca603ce902a65bb3d1b3bd805a74ad5cd4ce231b46f` (Expo58.0.11/Router58.0.20). Native AES/SecureStore draft write, restore and logout cleanup succeeded on that client; details are in DRAFT_EVIDENCE.md and NATIVE_ACCEPTANCE.md. This is not the forthcoming patched-SDK binary. The init script sets Ninja compile/link pools to 2/1; generated `build.ninja` and `rules.ninja` confirm those pools. `CMAKE_BUILD_PARALLEL_LEVEL` alone did not constrain AGP's Ninja invocation. Earlier four-ABI and pool-unbounded attempts were stopped for resource pressure and are not passes. Output is `agents/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. This is a debug-signed development client requiring Metro and an API; it is not a standalone release artifact.

The pinned `expo-crypto` Android prebuilt AAR exposed an old Expo Modules V2 `Promise` trampoline while the installed Expo core expected `PromiseHandle`, causing native `digestStringAsync` to fail despite a successful build. `package.json` uses [Expo's supported Android autolinking `buildFromSource`](https://docs.expo.dev/modules/autolinking/#buildfromsource) override with `["expo-crypto"]` to compile that module against the installed core. Installed `expo-modules-autolinking/src/commands/autolinkingOptions.ts` accepts the setting; its Android `SettingsManager.kt` uses the matching package name to disable the prebuilt publication. The corrected build executed `:expo-crypto:compileDebugKotlin`; `javap` on its generated classes confirms `PromiseHandle`. Keep this narrow override until a compatible prebuilt artifact is verified; no dependency version was changed to address it.

From `agents/mobile`, start Metro with the disposable preview:

```sh
NODE_OPTIONS=--dns-result-order=ipv4first EXPO_PUBLIC_API_URL=http://10.0.2.2:3303 \
  npx expo start --dev-client --localhost --port 8082 --max-workers 2
adb -s emulator-5554 install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 reverse tcp:8082 tcp:8082
adb -s emulator-5554 shell am start -a android.intent.action.VIEW \
  -d 'realtypandit-crm://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8082' \
  in.realtypandit.crm.mobile
```

Synthetic staff credentials are defined in `mobile_preview.ts`. Never use a customer account. The task's separate AOSP API 34 ARM64 AVD lives under `/tmp/rp-mobile-avds/`; it is local test tooling, not checked-in application code. Native screenshots are under `agents/mobile/.impeccable/review/`. Their gear bubble is Expo development tooling.

`npm run android` is the normal Expo build/install entry point; the bounded Gradle command above is the executed acceptance command on this host. `npm run e2e` invokes the authored Maestro flow, which has **not** run because the CLI is unavailable. ADB-driven synthetic acceptance is recorded separately and must not be described as a Maestro pass.

## iOS and release limits

Shared iOS source and Hermes export exist. Native generation was performed without installing pods. This host has Command Line Tools but no full Xcode/iOS simulator SDK and no usable CocoaPods, so `npm run ios` and `npm run build:ios:release` have not passed. On an equipped Mac, install the selected SDK's supported full Xcode/CocoaPods, generate `ios/`, then run the scripts and inspect the same scenarios on an iPhone simulator and physical device.

`npm run build:android:release` and `npm run build:ios:release` are authored build commands, not accepted distribution procedures. The generated Android release configuration defaults to a debug keystore; it must never be submitted as production signing. Production signing, AAB/iOS archive creation, privacy/store materials and physical release measurements remain open. No EAS, OTA, store or deployment publishing is configured by this work.

The PR/manual `mobile-ci.yml` runs source validation, exports, backend regressions and disposable-database integration. Its remote execution has not been observed. Local pass results do not imply CI, staging, provider or production acceptance.

## Final SDK Android build — 2026-10-17

The bounded ARM64 build against Expo58.0.12 / Router58.0.21 / core58.0.20 completed successfully in7m:695tasks,569executed/126up-to-date. APK SHA-256 `58de0f822851b966369bf552671ae97085f252c7ac865a044de06ef26f63ea97`, at `agents/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Log `/tmp/rp-mobile-sdk-gradle.log`. The same JDK21/max-worker1/Ninja compile2/link1 command in BUILD.md was used; generated app/Worklets/Reanimated pool definitions were verified. Existing dependency/Gradle deprecation warnings remain. This debug client installed and ran the scoped synthetic acceptance in NATIVE_ACCEPTANCE.md (including a retained project Back-history defect that still needs correction/retest). Build success is not release/native-iOS acceptance.
