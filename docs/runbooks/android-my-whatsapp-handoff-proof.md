# Android My WhatsApp — handset proof

Status: standalone proof implemented on 2026-10-12; recipient-and-attachment compatibility **unverified**. CRM/helper integration and production activation remain blocked until the acceptance matrix below passes. Existing browser Share sheet and desktop extension behavior are unchanged.

The app is `agents/android/share-helper`, separate from the staff app whose declared Kotlin components are absent. It uses local test files, native `ACTION_SEND` / `ACTION_SEND_MULTIPLE`, and a read-only `FileProvider`. The WhatsApp-specific `jid` extra is an experimental compatibility dependency, not an official guarantee. Intent construction and app builds do not prove that WhatsApp honors it.

Local verification on 2026-10-12: debug APK and instrumentation test APK built successfully with JDK 17; all 9 JVM tests passed; lint reported 0 errors and 16 warnings (English-only proof strings, existing dependency versions, and an API-31-only backup attribute). APK v2 signature and package metadata verified. The 3 native intent/provider tests compile but were not executed: no handset is connected and the local emulator system-image directory is empty. Graphify was refreshed; its SQL/Gradle parsing and existing graph-field warnings limit graph coverage. No backend/CRM build was needed because their source was not changed.

Test APK SHA-256: `ed95857d1b48c2a316c53ca72d990ff88f506c69b1569debe942ca95a6dd6837`.

## Published proof and team installation

Version 0.1.0 proof is distributed from the [versioned GitHub release](https://github.com/realty-pandit-swastik/Realty-Pandit-CRM-ai/releases/tag/android-share-proof-v0.1.0). Its [APK download](https://github.com/realty-pandit-swastik/Realty-Pandit-CRM-ai/releases/download/android-share-proof-v0.1.0/share-helper-debug.apk) is public and contains no CRM credentials or client data. Once the setup-page change is deployed, signed-in staff can also find these links at CRM `/my-whatsapp-setup`.

Staff on Android 8 or newer can sideload the test APK if their phone or company device policy permits unknown-app installation. Ordinary WhatsApp or WhatsApp Business must already be installed. Use this version with a small consenting pilot; it is debug-signed. Do not treat it as the team release: use a stable, secured release signing identity for rollout and keep that identity for future APK updates. Managed phones may require IT installation or approval.

Publishing the APK or setup instructions does not enable selected-client CRM sharing. The helper still accepts only local phone files, and CRM integration stays gated on the handset matrix below.

Android documents binary sharing, temporary URI grants and mixed MIME handling in [Send data to other apps](https://developer.android.com/develop/ui/compose/sharing/send) and [FileProvider](https://developer.android.com/reference/androidx/core/content/FileProvider). Mixed photo/video behavior, caption placement, ordering and recipient selection are receiver-dependent and must be verified on phones.

## Build and install

Use JDK 17 and the installed Android SDK 34. Gradle 8.4 and Android Gradle Plugin 8.1.4 reuse the existing project's versions. The independent settings file avoids configuring or compiling the incomplete staff app and its plugins.

```bash
cd agents/android
ANDROID_HOME="$HOME/Library/Android/sdk" bash ./gradlew -p share-helper assembleDebug testDebugUnitTest lintDebug assembleDebugAndroidTest --console=plain
```

APK: `agents/android/share-helper/build/outputs/apk/debug/share-helper-debug.apk`. This is a debug-signed **test APK**, not a production release. Copy it to the test phone, open it with the file manager, temporarily allow that file manager to install unknown apps if prompted, and install **My WhatsApp proof**. Turn that permission off again after installation. No phone, contacts, storage-library, accessibility or network permission is requested. Alternatively:

```bash
adb install -r share-helper/build/outputs/apk/debug/share-helper-debug.apk
# Automated native intent/provider checks only; this does not test WhatsApp compatibility:
bash ./gradlew -p share-helper connectedDebugAndroidTest
```

No CRM login or backend configuration is required. Obtain small, synthetic property photos, videos and a PDF locally. Use a consenting recipient under your control; do not use production client data. Do not publish this APK as the staff release. A stable release signing identity and staff-device pilot are later rollout work.

## Run a proof step

1. Open the proof app. Enter the recipient's already-normalized country-coded number starting with `+`, a property label, and prepared property details. The proof deliberately does not normalize numbers or search contacts; the eventual CRM integration must reuse its existing helpers and scoped contact picker.
2. Explicitly choose **WhatsApp** or **WhatsApp Business**. This choice is always required, including when both are installed.
3. Choose **Select step attachments**. Select only the local photos/videos for one property. Use **Choose first photo** to put the intended cover first. The displayed list is the intended native intent order. Video-only is allowed. Supported types match the current CRM: JPEG, PNG, WebP, GIF, AVIF; MP4, WebM, QuickTime; PDF. Limit: 100 files and 40 MiB per proof step.
4. Choose **Open client in My WhatsApp**, review the recipient, property and sending app, then **Open preview**. A correct result opens that recipient's attachment preview directly, preserves all files/order/details, and needs only a final Send tap. If WhatsApp asks you to select a recipient, mark the test **FAIL**; do not select someone manually and call it a pass.
5. Check the actual preview before sending to the consenting test recipient. The proof reports **handed to WhatsApp**, never sent/delivered. If needed, back out without sending to test cancellation.
6. Return to the proof app. Reopening the same step is blocked to discourage duplicate handoffs. Inspect the chat before deliberately retrying. **Clear step and temporary files** or select the next step. The recipient remains displayed. Repeat with the next property using the same recipient.
7. For an optional PDF, clear/select again and select **one PDF alone**. It gets its own intent and no media caption. PDFs mixed with photos/videos or multiple PDFs are rejected.

If the chosen app is unavailable, the helper reports failure and points to CRM **Share sheet**. The helper does not implement a disguised recipient chooser or replace attachments with links. Browser Share sheet remains independently usable for WhatsApp or another platform.

## Acceptance matrix — release gate

Run every row in both ordinary WhatsApp and WhatsApp Business. Also run with both installed and confirm the explicitly chosen sending app opens. Repeat recipient cases for a saved contact and an unsaved, consenting WhatsApp recipient. Record phone model, Android version, sending-app version, date and pass/fail; do not record phone numbers, private messages or launch tokens in evidence.

| Test | Required result |
| --- | --- |
| One photo and property details | Correct recipient preview; photo/details intact; only Send remains |
| Several photos; chosen cover first | Same recipient; exact file count/order and cover/details preserved |
| Video only and details | Same recipient; playable video; details preserved |
| Mixed photos/videos and details | Same recipient; every file, order and details preserved |
| Separate property PDF | Same recipient; readable original PDF; separate step |
| Two properties followed by their PDFs | Every step targets the same intended client; no recipient reselection |
| Unsaved recipient | Direct attachment preview for that number, without saving a contact |
| Both sending apps installed | Explicit app choice honored; correct account and recipient |
| Cancel confirmation, picker or WhatsApp preview | No automatic Send; no confirmed-send record; no automatic retry |
| Tap Open repeatedly after handoff | Same step blocked until deliberate clear/new selection |
| Missing selected WhatsApp app | Clear failure; CRM Share sheet works independently |
| Unsupported/empty/inaccessible/over-40-MiB file; 101 files | Preparation fails with no WhatsApp handoff; partial cached files removed |
| Ten-minute expiry | Cached URI cannot be opened again; files cleaned while app runs or next launch |
| CRM Share sheet to another platform | Current browser flow succeeds independently of this helper |

Any wrong recipient, recipient chooser, missing attachment, lost details or wrong order fails the pass condition. Do not work around it with text links or manual recipient selection. Report the exact failing app/device combination and stop before CRM integration. If preview content passes but the employee cancels, there is still no confirmed send.

The provider rejects new file opens at expiry and rejects write access. Android may keep an already-open file descriptor alive, and WhatsApp may retain its own copy; expiry cannot recall content already handed off. Cached files are removed by the running app's timer or on its next resume, and can be cleared immediately. The proof has no background cleanup service when its process is killed. Private numbers/details are not logged, backed up, or placed in a launch URL. No deep links or exported incoming-share handler exist in the proof.

## Only after the proof passes

Continue the approved plan with the shared `PersonalWhatsAppShareModal` callers (inventory, mobile inventory, lead matches and deal matches) and an authenticated Redis-backed session endpoint. Preserve existing selection/cover ordering/details/PDF redaction and 40-MiB/100-file limits across the entire queue, require normalized recipient/contact access, validate authorized property media, issue an opaque 10-minute HTTPS manifest/file capability, fail closed without Redis, and exclude numbers/URLs/credentials from launch links and logs. Add focused auth/token/media tests. No migration is needed.

The production helper must download only immutable scoped attachments, provide install instructions and an independent Share sheet action, and report handoff only. Do not add confirmed-send records. Keep integration disabled through a signed helper pilot on actual staff phones. This proof does not create that backend contract, a CRM feature flag or a release-signed fleet APK.
