# Android native acceptance checkpoint — 2026-10-16

This is synthetic emulator evidence, not release, provider, physical-device or iOS acceptance. Source base `fb2afd7ad5dc0375b90eb35ebf778175a1c2ee27` plus uncommitted mobile work. Existing backend/web clients preserved; no deployment, commit, push, store submission or customer communication.

## Pre-SDK-patch client

APK SHA-256 `9de8a8a88d0ae55ecdb1eca603ce902a65bb3d1b3bd805a74ad5cd4ce231b46f`, Expo58.0.11/Router58.0.20, Crypto source-build override. AOSP API34 ARM64 isolated AVD, 1080×1920/density420, Android emulator35.3.12.0. Debug client + task-owned Metro8082, loopback preview3303, disposable PostgreSQL55432/Redis56379 only.

Confirmed on native runtime: fresh synthetic staff login; loaded Home; lead encrypted write and no plaintext marker/form-key/identifier in2 app-private revision files; offline retained editing and disabled server write/refresh; reconnect plus process-death exact restore; changed server-base conflict and explicit confirmed overwrite; successful online save removes local revisions; encrypted new-task draft, offline Create disabled, reconnect/process-death restore, explicit successful task create and local clear. See [DRAFT_EVIDENCE.md](DRAFT_EVIDENCE.md) for detailed checkpoints and limits.

The lead/task proof covers only those draft surfaces. Edit-task/project fields remain component state and have no process-death guarantee. Cold offline startup snapshots remain unimplemented. Source patch for property upload retry reconciliation is frozen separately; its native acceptance remains pending.

## Application source inventory

After the prepatch checkpoint and attachment final freeze, application TypeScript source was fingerprinted in `NATIVE_SOURCE_MANIFEST.json`: 42 runtime files, canonical rows aggregate SHA-256 `d0296426b456af592bd29e5ee02e3b0c74cdaa88d7d3139501fb3879db1a804c`. Tests/package/native configuration are excluded. This is the retained application-source snapshot for the final SDK-only patch; it does not retroactively certify transient FastRefresh states.

## Remaining work

Prepatch additional checks passed: explicit task discard→zero revisions; font_scale1.3/density360/background-return followed by native document picker cancel back to Property; no unhandled-navigation warning in retained500-line log; native confirmation revoked a separate synthetic session and its protected server request returned401; logout with two pending draft revisions removed vault directory and SecureStore draft-key preference entry. Original emulator settings restored and owned emulator/Metro stopped before SDK replacement.

Remaining: resolve/retest the retained deleted-project history defect described below; independently review older33 historical captures. Final-SDK representative smoke/CRUD and the31-image opened inventory are now recorded below. Full Xcode/CocoaPods are missing, so native iOS remains blocked. No release/performance/provider claim.

## Capture manifest

Images are under `agents/mobile/.impeccable/review/`. This agent opened all18 files whose names end `-current.png` individually with `view_image`; sixteen are the accepted prepatch runtime captures below, and two are excluded diagnostics. Every accepted image is synthetic Android emulator evidence from the prepatch APK/Metro source described above. They are not final patched-client images. Gear bubble is Expo dev tooling. Offscreen scrollable content is not a missing control; no warning overlay or illegible overlap is present in this accepted set.

| File (`phone-android-` prefix) | Opened result / scope |
| --- | --- |
| `home-current.png` | Home rows/actions readable; prepatch current, ordinary scale |
| `lead-current.png` | Lead read/notes/base state; synthetic server notes |
| `lead-draft-saved-current.png` | Exact marker and device-saved notice visible |
| `lead-offline-current.png` | Offline notice, editable retained marker, disabled Save/Refresh |
| `lead-draft-restored-current.png` | Exact offline marker and restored notice |
| `lead-conflict-current.png` | Draft retained, changed server notes shown, overwrite review action, disabled Save |
| `lead-overwrite-current.png` | Explicit overwrite completed, Notes saved, disabled unchanged Save |
| `task-draft-saved-current.png` | Task title/date, saved-device notice and discard action |
| `task-draft-offline-current.png` | Offline notice, title/date retained, Create disabled |
| `task-draft-restored-current.png` | Exact title/date and restored notice |
| `task-created-current.png` | Actual created Task detail, edit/delete/complete actions visible |
| `more-current.png` | Work projects and Device sessions discoverable, Sign out visible |
| `home-large-text-current.png` | font_scale1.3/density360; Home readable, scroll continues below tab bar; no navigation warning overlay |
| `picker-large-text-current.png` | Native Android document picker at same scale/density; canceled, no upload performed |
| `sessions-current.png` | Current-device label and separate synthetic device revoke actions readable |
| `logout-current.png` | Returned login state with empty fields after explicit logout |
| `diagnostic-current.png` | **Excluded diagnostic**: Home during driver investigation; pressed/ripple button state. Not a distinct acceptance case |
| `draft-diagnostic-current.png` | **Historical diagnostic**, not resumed capture: previous 11:39 Leads loading state; cannot establish draft success |

The other33 earlier PNGs are historical artifacts pending the separate final design reviewer’s explicit opened inventory. In particular `phone-android-home-large-text.png` and `phone-android-missing-record.png` are previously reported warning-overlay captures and cannot be substituted for current passed states. iOS has no native captures because its toolchain is unavailable.

## Final SDK Android build — 2026-10-17

The bounded ARM64 build against Expo58.0.12 / Router58.0.21 / core58.0.20 completed successfully in7m:695tasks,569executed/126up-to-date. APK SHA-256 `58de0f822851b966369bf552671ae97085f252c7ac865a044de06ef26f63ea97`, at `agents/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Log `/tmp/rp-mobile-sdk-gradle.log`. The same JDK21/max-worker1/Ninja compile2/link1 command in BUILD.md was used; generated app/Worklets/Reanimated pool definitions were verified. Existing dependency/Gradle deprecation warnings remain. This is a debug client; the scoped native results below are separate from build success.

## Final-SDK runtime results

On 2026-10-17 the matching APK installed successfully on the retained isolated API34 ARM64 AVD (1080×1920,density420,font_scale1.0). Owned Metro served the unchanged42-file application source inventory above; package/core versions are the final SDK patch. Existing loopback preview/disposable DB/Redis were verified before use. No feature source was edited by this agent.

- Cold launch showed blank login; synthetic staff login loaded Home. Lead first-write `FinalSDKDraft` produced two encrypted revisions; debug inspection found no marker/baseNotes/phone plaintext. Force-stop/cold-launch restored the exact marker and **Draft restored from this device**. Explicit discard completed.
- Android document picker opened from Property and canceled back to Attachments. No upload or share/provider operation was performed in this final-SDK smoke. The upload retry reconciliation implementation has separate component checks; its ambiguous-upload native path was not injected/tested here.
- Task status/priority filters changed the visible list (Todo/Medium). Edited the earlier synthetic DraftProof task title to NativeTaskEdited, status In progress, priority High; Save showed the updated detail. Completed/reopened, canceled Delete and observed the retained record, then explicitly confirmed Delete and returned to Tasks. Disposable DB boolean confirmed the created task no longer exists. Linked-record/tag/assignee editing and large-data pagination are outside this UI slice.
- Created a basic self-owned Work project with no team members. Edited its name to Edited/status On hold; Save showed the new values. Delete cancellation retained it; explicit confirmation returned to the empty list. Disposable DB boolean confirmed the created work_project no longer exists. No owner/member management or native task-association UI is claimed; no linked tasks existed for this particular native project test.
- More/Sessions are readable and current-device identity is visible; Deals correctly shows the synthetic empty result. A direct synthetic missing Task route returned **Task not found** and **Try again**, with no warning overlay. No unhandled-navigation warning was found in the retained500-line ReactNativeJS/AndroidRuntime window. This does not establish all navigation behavior: the retained-history defect below is independently reproduced.

## Native defect requiring follow-up

After project create→edit→save→delete, **one Android Back from the empty project list reopened cached deleted detail with Edit/Delete buttons**. Database absence was verified. `router.replace('/projects')` after deletion leaves the previous detail route below it; edit-save also uses replacement and leaves the earlier detail. Captured as `phone-android-deleted-project-back-diagnostic-sdk-final.png`. The parent was notified for a narrow shared navigation correction; this agent changed no feature source. This is a reproducible UI history defect, not a demonstrated server authorization bypass. Native acceptance of the project Back flow remains failed until correction/retest. A later Back traversal also returned to an older Lead route; this observation is retained as a diagnostic, not accepted as an isolated second root cause.

Input-driver correction: a partially visible form button/unfinished IME input did not establish a successful project save. The project-save diagnostic is excluded. The successful test used a short exact marker and brought **Save project** fully into view before tapping, then checked the returned detail. No application fix was needed for that driver failure.

## Final-SDK capture manifest

This agent opened **all31** `*-sdk-final.png` images individually using `view_image`:28 accepted scoped states and3 excluded diagnostics. Files use the `phone-android-` prefix below. All are synthetic Android emulator captures against APK `58de0f…`; scroll crops are stated and no accepted image contains a navigation-warning overlay. The task Status modal has low-contrast OS status-bar icons on the light backdrop; its app choices remain readable. This minor system-bar presentation detail is passed to final design review and is not full accessibility acceptance.

| File suffix | Opened result / scope |
| --- | --- |
| `login-sdk-final.png` | Empty fresh login before synthetic authentication |
| `home-sdk-final.png` | Loaded Home and tab navigation |
| `lead-draft-sdk-final.png` | Exact marker and saved-device notice |
| `lead-restored-sdk-final.png` | Exact marker and restored-device notice after process death |
| `picker-sdk-final.png` | Native empty document picker; canceled |
| `property-sdk-final.png` | Returned Property/Attachments controls |
| `tasks-sdk-final.png` | Task list/default filters |
| `task-status-filter-sdk-final.png` | Status modal choices; OS status-bar contrast note above |
| `tasks-filtered-sdk-final.png` | Todo/Medium selection and resulting task list |
| `task-sdk-final.png` | Earlier synthetic created Task detail |
| `task-edit-sdk-final.png` | Task edit form before changes; scroll continues below viewport |
| `task-edit-changes-sdk-final.png` | New title/status/priority and visible Save/Cancel; top label scroll-cropped |
| `task-edited-sdk-final.png` | Saved changed title/In progress/High |
| `task-completed-sdk-final.png` | Done state and Reopen action |
| `task-delete-confirm-sdk-final.png` | Explicit destructive confirmation with retention explanation |
| `task-deleted-sdk-final.png` | Returned Task list after confirmed deletion; DB absence checked separately |
| `more-sdk-final.png` | Work projects/Device sessions discoverable |
| `sessions-sdk-final.png` | Current-device label and scoped session actions |
| `projects-sdk-final.png` | Empty project list |
| `project-new-sdk-final.png` | Basic self-owned creation form; scroll continues |
| `project-created-sdk-final.png` | Actual newly created project detail, no linked tasks |
| `project-edit-sdk-final.png` | Existing project edit form, ownership/membership retention copy |
| `project-edit-changes-sdk-final.png` | Edited/On hold and fully visible Save/Cancel; name label scroll-cropped |
| `project-edited-sdk-final.png` | Saved Edited/On hold detail |
| `project-delete-confirm-sdk-final.png` | Explicit project deletion confirmation/task-retention explanation |
| `project-deleted-sdk-final.png` | Empty project list after confirmed deletion; does not prove Back correctness |
| `deals-sdk-final.png` | Accurate synthetic empty result, search/retry guidance |
| `missing-record-sdk-final.png` | Task not found/Retry; clean error state |
| `deleted-project-back-diagnostic-sdk-final.png` | **Failed flow diagnostic:** cached deleted project reappeared after Android Back |
| `project-save-diagnostic-sdk-final.png` | **Excluded driver diagnostic:** IME/partial control state, not a successful save |
| `navigation-diagnostic-sdk-final.png` | **Excluded diagnostic:** old Lead route after Back traversal; no second root cause established |

## Runtime cleanup and limits

Restored window/transition scales1, deleted animator-duration override (originalnull), restored font_scale1.0/density reset, force-stopped app and stopped only the owned emulator and Metro. PreviewPID34925 and disposable containers were left running for coordinated verification. The verifier/root were told native was idle before exports/heavy TypeScript/website work. The final42 runtime-source hashes still matched the saved manifest at shutdown.

Earlier prepatch evidence remains versioned separately: native offline editing/reconnect, new-task encrypted restore/create/clear, logout vault+SecureStore key-entry purge, other-session revocation→server401 and font_scale1.3/density360/lifecycle/picker. Those detailed cases were not all repeated on final SDK; final smoke above verifies the changed native core with lead encryption and process death. Native iOS, physical devices, release signing/performance, full workflow/role parity and provider/production acceptance remain unverified.

## Navigation correction confirmation — 2026-10-17

A separate continuation corrected the retained-history defect above with `dismissTo` in the existing task/project return paths. On the same patched SDK APK (`58de0f…63ea97`), corrected application JS was served through a fresh task-owned Metro on port8082. No native dependency/configuration or APK rebuild was needed for these JS-only calls. AOSP API34 ARM64, 1080×1920/density420, disposable preview3303 only.

Both projects and tasks passed: create a dedicated synthetic record, edit its name/title, save, explicitly confirm deletion, observe the list, then Android system Back returns Home without the deleted detail or mutation controls. No seeded/customer record was deleted. All six captures below were opened with `view_image` and accepted: readable current content, normal controls and no error overlay. The gear bubble is Expo tooling.

| Opened capture (`phone-android-` prefix) | Scope |
| --- | --- |
| `project-history-fixed-detail.png` | Saved edited project and normal actions |
| `project-history-fixed-deleted.png` | Empty projects list after confirmed deletion |
| `project-history-fixed-back.png` | Home after Android Back |
| `task-history-fixed-detail.png` | Saved edited task and normal actions |
| `task-history-fixed-deleted.png` | Tasks list after confirmed deletion |
| `task-history-fixed-back.png` | Home after Android Back |

`history-debug.png` and `task-history-debug.png` are intermediate driver diagnostics, excluded from acceptance. The earlier `deleted-project-back-diagnostic-sdk-final.png` remains the pre-fix failure record. Capture/source hashes and automated history regressions are in `verification-results.json` and `VERIFICATION.md`. This confirmation does not certify all earlier final-SDK captures or broad role/workflow/iOS/release acceptance. Task-owned emulator/Metro stopped after the check; no global settings were changed.
