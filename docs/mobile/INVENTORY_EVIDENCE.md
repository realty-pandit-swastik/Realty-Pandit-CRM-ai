# Inventory implementation and verification — 2026-10-18

Implementation coverage is mapped in [INVENTORY_PARITY.md](INVENTORY_PARITY.md). This is not complete product or store acceptance. Existing unrelated work in this dirty workspace was preserved; no commit, deployment, migration, release or customer/provider send was performed.

## Checks

| Check | Result |
|---|---|
| Mobile Jest | 89 passed, 17 suites; full run after final mobile logic |
| Mobile strict TypeScript and ESLint | Pass, no warnings/errors |
| Backend Vitest | 714 passed, 4 skipped; 104 passing files, 2 skipped |
| Real-auth PostgreSQL/Redis integration | 32 passed, including staff tenant/recipient boundaries and normalized/authorized visit creation |
| CRM production build | Pass; existing bundle-size warning remains |
| Android / iOS Hermes exports | Both pass; iOS export is not an iOS native build |
| Android development APK | Gradle assembleDebug passes: 6m22s, 499 tasks, 62 executed. Installed in AOSP API34 ARM64 emulator. Includes expo-video and InventoryShare module |
| Backend TypeScript | Whole compiler still fails. Pre-task recorded snapshot:390 diagnostics; current:384. Line-normalized diagnostic comparison reports no additions. See backend-types-comparison.json. This is a noisy existing baseline, not a clean compiler pass |
| Impeccable native source detector | Empty result (`[]`); actual Android captures separately inspected |
| Graphify | AST update succeeded after implementation; no semantic/API processing |

Logs: [mobile](inventory-evidence/mobile-tests.txt), [backend](inventory-evidence/backend-tests.txt), [real-auth integration](inventory-evidence/real-auth-tests.txt). The installed APK is `agents/mobile/android/app/build/outputs/apk/debug/app-debug.apk`; final JavaScript exports are under mobile `dist/android-inventory` and `dist/ios-inventory`. The APK uses Metro for these final JS changes; the APK was built after all native module changes.

## Android evidence

Test device: RP_Mobile_Test AOSP API34 ARM64 emulator; 1080×1920, density420. Backend is the disposable loopback preview server with isolated PostgreSQL55432 / Redis56379, synthetic `.invalid` staff/contact/property records and generated test-only photo/video. No production data was used. The gear bubble is Expo development tooling.

Observed: staff sign-in/session restoration; browse-all catalogue, loaded property detail, authorized edit form, review/save returning to the property; native photo/video navigation and video controls loading a one-second local MP4; server-guided creation first step; authorized CRM contact search; company recipient/sender/customer-text preview; My WhatsApp selected photo+video+first-photo+brochure preparation into separate media and PDF steps. An expired/cancelled prepared share fails closed and preserves the package. The native multi-file module was invoked after verified private downloads and reported that the selected WhatsApp app is not installed; no sending was claimed. Both target WhatsApp packages are absent in this AOSP image, so successful app handoff, recipient confirmation and Send cannot be verified here.

Captures in `inventory-evidence/` include initial inspection captures and current detail/edit/create/video/share-preparation/error captures. `list-initial.png`, `detail-initial.png` and `company-preview-initial.png` deliberately preserve findings before corrections (toolbar density, dual-price units and guessed caption defaults); they are not final acceptance goldens. The first edit probe typed literal `%20` in a synthetic city via adb; this is test input, not application URL decoding. Customer text and brochures use display price; internal asking-price fields stay separate.

Native upload denial/reconciliation and attachment privacy retain the prior dedicated evidence; the new source tests cover the revised detail/gallery contract, canonical action endpoints, confirmation, assignment chooser, ambiguity locking, offline gating and cancellation. This session does not claim a fresh full device pass for every destructive/bulk/role workflow.

## Sharing guarantees and limits

Explicit company packages are per-property selected media and optional signed-photo-selection brochures. Omitted selection retains existing web behavior. Explicit packages do not substitute attachments, enqueue retries, replay ambiguous sends or use the legacy provider retry loop. Per-item acceptance/blocked/failed/uncertain results, PDF result, sanitized reasons/provider codes and available message identifiers are retained. Provider acceptance is not delivery. A failed response keeps the package; uncertain company sends require activity review before a personal handoff and remain locked against company replay.

My WhatsApp uses server-prepared customer-safe snapshots, SHA256/size verification, Android ACTION_SEND_MULTIPLE, a cache-only non-exported FileProvider and temporary read grants. The agent still chooses/confirms the recipient and taps Send in WhatsApp. Brochures have their own PDF step. Expiry, cancellation, app foreground/restart and logout/account changes clean temporary files; server capabilities expire independently. Private deeds/registries/NOCs retain explicit sharing and protected download routes.

Visit creation additionally validates contact visibility, property tenant and active authorized assignee before persistence or reminders. Successful-but-malformed creation/upload responses are treated as ambiguous, preserving input and requiring reconciliation.

## Remaining acceptance

- Actual WhatsApp and WhatsApp Business receiving mixed files/captions/PDFs on a configured physical test handset, without customer messages.
- Complete device journeys for every field/action, all staff roles, multi-page representative data, denied permissions, upload interruption, font scaling and keyboard states. Automated coverage and the recorded synthetic subset do not certify these.
- Native iOS build/inspection and physical-device performance/release/privacy/store gates from MOBILE_PLAN.md.
- Final production/provider operation remains outside authorization.
