# SDK patch evidence — 2026-10-16

## Applied snapshot; native and final verification pending

A narrow dependency patch was prepared in `/var/folders/3_/6gqkc5092s32y73px6l4fwf40000gn/T/rp-sdk-patch-fgh3txa1` and then applied after the native owner explicitly confirmed SAFE PAUSE (app/owned AVD/owned Metro stopped and device globals restored). Both live baseline hashes matched before mutation. Only package.json and package-lock.json were copied; live dependencies were clean-installed. Feature source/config and generated native projects were not edited by this task. Native acceptance owns the fresh core-linked rebuild/restart/smoke. No commit, push, deployment, production migration, provider send or customer communication occurred.

Scope reaches only `agents/mobile/package.json`, its lockfile, this evidence, and the subsequent native rebuild/final verification. No UI/backend/source feature change is required. The isolated copy contains package/config/app/src/assets/plugins/scripts only; environment files, credentials, dependencies, native projects, dist, Git and generated evidence were excluded when copying. Its dependencies were then installed independently.

## Primary evidence and exact dependency changes

The online SDK checker requested Expo `~58.0.12` and Router `~58.0.21`. Reviewed official sources:

- [Expo changelog](https://raw.githubusercontent.com/expo/expo/main/packages/expo/CHANGELOG.md): Expo .12 updates CLI, core and Babel preset.
- [Expo Modules Core changelog](https://raw.githubusercontent.com/expo/expo/main/packages/expo-modules-core/CHANGELOG.md): core .20 aligns its optional Worklets peer with SDK 58, resolving the old unsupported nested Worklets copy. The installed metadata accepts `>=0.13.0`. A later .21 web sideEffects entry exists in main, but npm naturally resolved .20; no override was added.
- [Router changelog](https://raw.githubusercontent.com/expo/expo/main/packages/expo-router/CHANGELOG.md): Router .21 updates glass-effect. Published package metadata also raises its optional `@expo/ui` peer from `^58.0.18` to `^58.0.19`; that absent optional package was not installed.

| Package | Before | Prepared |
| --- | --- | --- |
| expo | 58.0.11 | 58.0.12 |
| expo-router | 58.0.20 | 58.0.21 |
| expo-modules-core | 58.0.19 | 58.0.20 |
| @expo/cli | 58.1.9 | 58.1.10 |
| babel-preset-expo | 58.0.15 | 58.0.16 |
| expo-glass-effect | 58.0.3 | 58.0.4 |

These are the only six package version upgrades. npm hoisted unchanged Metro config/runtime and Radix tabs packages, and hoisted the updated core/Babel preset. It added a nested existing-version picomatch 4.0.7 resolution for Metro config and reclassified fsevents 2.3.3 from dev-only to shared. The obsolete nested Worklets 0.10.4 entry is removed. Incidental noxcturnal 0.1.1→0.1.2 optional-tool upgrades and lightningcss Linux metadata churn were restored to baseline before clean installation. Exact per-path changes are in the temporary `lock-delta.json`; `sdk-patch.diff` contains the reviewable package/lock patch.

The native ABI fix `expo.autolinking.android.buildFromSource: ["expo-crypto"]` remains byte-equivalent. Assert checks confirm unchanged React/React DOM 19.3.0, React Native 0.88.0, Reanimated 4.7.1 and root Worklets 0.13.0. No new override or direct dependency was added.

## Executed checks

Preparation commands ran in the temporary directory, with Node 22.23.2/npm 10.9.8 and a minimal environment:

```sh
env -i PATH="$PATH" HOME="$HOME" npm install --package-lock-only --ignore-scripts
# Restore the unrelated optional-tool/metadata entries described above.
env -i PATH="$PATH" HOME="$HOME" npm ci
env -i PATH="$PATH" HOME="$HOME" CI=1 EXPO_NO_TELEMETRY=1 npx expo install --check
env -i PATH="$PATH" HOME="$HOME" npm audit --json
```

Clean install passed: 1,137 packages added / 1,138 audited in 14 seconds. Online Expo compatibility passed with `Dependencies are up to date`. Package/native invariant assertions passed. The old Expo nested-Worklets peer warning disappeared; the existing Jest watch-typeahead/Jest 29 peer warning remains. Existing deprecations and install-script review notices for @parcel/watcher, fsevents and unrs-resolver remain; no script approvals were changed.

Logs: `/tmp/rp-sdk-patch-lock-update.log`, `/tmp/rp-sdk-patch-ci.log`, `/tmp/rp-sdk-patch-install-check.log`. Audit JSON: `/tmp/rp-sdk-patch-audit.json` and `/tmp/rp-sdk-patch-baseline-audit.json`. Baseline audit used only copies of the original package/lock and `npm audit --package-lock-only --json` at the same checkpoint.

Same-time baseline audit reports 62 affected package entries (49 high, 13 moderate); prepared audit reports 63 (50 high, 13 moderate), both zero critical. Both contain the same four direct advisory sources: braces, node-forge, sprintf-js and uuid. The additional propagated entry is expo-modules-core, now linked through its corrected Worklets peer to the existing RN/Metro advisory chain; no new root advisory or upgraded affected leaf is introduced by these six patches. This is a tooling/path assessment, not certification of the runtime tree. No audit fix or forced/unsupported SDK downgrade was performed. Existing advisory reachability remains a release gate.

## Hashes and coordinated application

| File | Prior baseline SHA-256 | Applied SHA-256 |
| --- | --- | --- |
| package.json | `b47259524f0dbfabd910755c3d9300ff85c2f233d0d4ee39bfc29eb3573085fd` | `f4660a79707f1a4d25f9d9dda2e0668e64fe2d08917bf30a3a8895f39bda4700` |
| package-lock.json | `2d49f0a250eabc2545aea8e2d177c841f7c902a687b6def4dbf7d4cdd6bcb4ec` | `a1560d12de6efec892ace6e695a3a4b5b6b62bec98ff68942089d0d42fc8a876` |

The baseline hash guard passed for both files, then Python shutil.copy2 copied only those two reviewed files. In live `agents/mobile`, `env -i PATH="$PATH" HOME="$HOME" npm ci` passed (1,137 added / 1,138 audited, 20 seconds); `env -i PATH="$PATH" HOME="$HOME" CI=1 EXPO_NO_TELEMETRY=1 npx expo install --check` passed with `Dependencies are up to date`. Logs are `/tmp/rp-sdk-patch-live-ci.log` and `/tmp/rp-sdk-patch-live-install-check.log`. The audit summary remains 63 (50 high / 13 moderate), with the same already-reviewed limitations.

Post-install assertions verified both live files byte-equal the prepared snapshot and the applied hashes above. Installed Expo .12, Router .21, core .20, React/React DOM 19.3.0, RN 0.88.0, Reanimated 4.7.1, root Worklets 0.13.0 and Crypto 58.0.6 match the reviewed versions. The nested Worklets 0.10.4 directory is absent; the Crypto source-build override remains intact. The native owner and independent verifier received the explicit dependency freeze and hashes. Native acceptance owns Metro/AVD and the fresh core-linked Android build. Graphify update is consolidated with the root agent final documentation pass to avoid competing with that build.

The independent verifier owns final tests, types, lint, online SDK compatibility, both Hermes exports and a clean install after the combined freeze. They were deliberately not duplicated during active emulator acceptance. Isolated install/check is not native acceptance; no new APK or iOS native build is claimed here. Native iOS remains blocked by missing full Xcode/CocoaPods. Full parity, release signing, physical-device/provider/production acceptance and advisory mitigation remain open.
