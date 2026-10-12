> Execution authorization: the user requested implementation and production publication as a PILOT for real-phone testing on 2026-10-13. Production pilot may precede handset acceptance; recipient targeting, captions and ordering remain unverified. No automatic sends, confirmed-send records, or database migrations.

# Complete Android My WhatsApp flow from CRM

Status: IMPLEMENTED FOR AUTHORIZED PRODUCTION PILOT; publication pending. The user authorized implementation and production testing on 2026-10-13. Real-phone acceptance gates broader rollout, not this explicitly requested pilot. No automatic sends or confirmed-send records.

## Outcome and scope

A staff member selects a CRM recipient, property, photos/videos, cover photo, and optional PDF. The Android helper receives those exact choices and opens that recipient's WhatsApp attachment preview. The recipient can be unsaved and have no previous WhatsApp conversation. The employee reviews the preview and taps Send themselves. The PDF follows in a separate preview for the same recipient.

Default requested format: chosen first photo with property details, remaining selected photos, then selected videos; optional brochure afterward. One property is one media step plus an optional PDF step. Multiple properties remain separate, ordered property-by-property. PDF-only and video-only selections are supported. No unselected attachments are added. No owner/key-holder details or internal-only prices are exposed.

Direct recipient targeting, precise attachment order, and first-photo caption placement are acceptance requirements to prove on WhatsApp. They are not promises made by Android's standard sharing API. If an intended app/device combination cannot preserve them, record the failure and review it before broader rollout. Separate property text is an alternative requiring an explicit product decision after testing; it must not silently replace the requested first-photo caption.

Initial rollout: Android Chrome and the Android CRM PWA, internal staff, WhatsApp and WhatsApp Business. The helper uses the installed personal/Business app; this is a native handoff, not the company WhatsApp API. Desktop extension and ordinary Share sheet remain independent. iPhone integration, background sending, contact-book changes, and automatic Send are outside this plan.

## End-to-end user journey

1. From inventory details/list, mobile inventory, a lead's matches, or a deal's matches, tap **My WhatsApp**.
2. The existing modal opens. When launched from a client/deal, prefill that recipient. Otherwise select an accessible CRM contact or enter a valid country-coded number. Reject missing, malformed, TEMP_, or PENDING- recipient identifiers. The recipient does not need to exist in the Android address book.
3. Explicitly select **WhatsApp** or **WhatsApp Business**. Show the chosen application; do not claim a sender number has been verified because the helper cannot read WhatsApp's logged-in account. The employee checks the sending account in WhatsApp.
4. Select only the wanted photos/videos, choose the first photo, and optionally select the PDF. Display the generated property details, attachment sequence, recipient, and sending application. Show any invalid or unsupported selection before handoff. PDF-only selection is allowed.
5. Tap **Prepare for My WhatsApp**. CRM creates a narrowly authorized temporary handoff. The modal displays preparation progress and disables duplicate preparation while it is active. It does not send to WhatsApp yet.
6. When ready, tap **Open My WhatsApp**. A direct user gesture opens the installed helper through the approved app link. A missing-helper fallback explains installation and offers a separate ordinary Share sheet action, explicitly stating that it requires manual recipient selection and may not work for unsaved/new recipients.
7. The helper retrieves the prepared request and every selected file, verifies recipient, file integrity/type/count/total size, and presents the same summary. Do not ask the employee to type the number or select media again.
8. Tap **Open media preview** (or **Open PDF preview** for PDF-only). WhatsApp must open the intended recipient's preview directly. The employee verifies recipient/content/account and taps Send, or cancels.
9. Returning to the helper does not imply a send. If a PDF was selected, the employee deliberately opens its next preview for the same recipient. With several properties, continue through explicit steps in the displayed order. Do not automatically open the next step or resend a previous one.
10. CRM/helper states say **Prepared**, **Ready**, **Preview opened / handed off**, **Cancelled**, **Expired**, or **Failed**. Native return values never produce a confirmed-send or delivery record. If a later product decision introduces staff-confirmed sending, label it as staff confirmation, not a provider receipt.

## Phase 0 — documentation and real-phone acceptance gate

Discovery for this plan is complete against application revision `139babb26ec4050d816dc7598ec2889e4eda805d`. No handset proof was performed while planning.

Use the existing standalone proof APK and its runbook before connecting CRM. Record phone model, Android version, browser/PWA, WhatsApp package/version, recipient history, selected files, and observed outcome. Use synthetic files and consenting test recipients.

Required matrix:

| Case | Required result |
| --- | --- |
| Unsaved recipient, never messaged | Correct recipient's attachment preview opens without saving, sending an introductory message, or reselecting recipient |
| Saved recipient and existing conversation | Same direct behavior |
| Single photo + details | Original photo and exact property details preserved; desired caption placement recorded |
| Several photos + chosen cover | Exact count, cover first, remaining order, details on first photo |
| Video-only | Correct recipient, playable originals, details retained |
| Mixed photos/videos | Correct recipient, every selected file, intended sequence and details preserved |
| PDF-only and media followed by PDF | Original readable PDF, separate preview, same recipient for every step |
| WhatsApp / Business / both installed | Explicit selected app honored; sending account reviewed in WhatsApp |
| Cancel, unavailable app, repeated taps | No automatic send/retry; no misleading success or duplicate handoff |

Go/no-go: an unsaved/new recipient chooser, wrong recipient, dropped file/details, or changed required order fails that app/device combination. Do not substitute wa.me links, saved contacts, sending a first text, contact automation, or accessibility automation and call the requirement met. The user reviews evidence and any alternate format before integration starts. A single passing device is a pilot result, not universal Android compatibility.

References: `docs/runbooks/android-my-whatsapp-handoff-proof.md:40-81`; `ShareIntents.java:9-26`; `ShareRules.java:9-57`; official Android sharing and FileProvider documentation below.

## Phase 1 — secure temporary handoff contract

Copy the current authenticated `client.post`/CSRF pattern and existing inventory visibility/redaction/PDF generation patterns. Add a small dedicated handoff route/service; no database migration, new framework, or new queue worker is needed by default.

Proposed APIs (new, not currently implemented):

- `POST /api/personal-whatsapp/handoffs`: authenticated staff creates a handoff from normalized recipient, selected app, inventory IDs, exact selected media references/order/cover, and PDF choices. Return an opaque launch capability and expiry only after preparation succeeds.
- `POST /api/personal-whatsapp/handoffs/claim`: helper exchanges the launch capability once for a bounded download session and immutable manifest. Duplicate claims fail; a successfully claimed session can resume its own interrupted downloads until original expiry.
- Manifest/file reads use that narrow session in an authorization header. Do not consume a new one-time token for every file. Do not pass staff cookies, CRM access/refresh JWTs, phone numbers, attachment URLs, or details through the launch URL.
- Authenticated cancellation/status endpoints may report preparation and handoff state; a successful claim/download is not WhatsApp send confirmation.

Security and data requirements:

- Explicitly scope every inventory/contact to the requesting staff tenant and applicable role/team/marketplace visibility. Every requested ID must exist and be accessible; do not silently prepare an accessible subset. Super-boss ownership bypass never becomes cross-tenant access.
- Resolve selections against stored authorized inventory media. Reject arbitrary user-provided URLs/paths, path traversal, unselected files, unsupported MIME, empty files, and missing media. Use filesystem containment checks; do not expose the current broad PDF media-path resolver as a capability file server.
- Generate redacted customer-facing details/PDF server-side, preserving the existing property's presentation and price rules. Reuse `generateInventoryPdfStream(..., { variant: 'brandless', ... })`; do not add another brochure renderer or call an Express route through fabricated requests.
- Snapshot selected bytes and generated PDF in a small private handoff directory outside public `/uploads`, shared across backend workers/releases. Stream to disk rather than collecting 40 MiB per job in Node memory. Store opaque metadata in Redis. Reuse originals by copying, without uploading browser base64 payloads or modifying inventory files.
- Use installed `ioredis` with bounded, fail-closed operations and atomic claim. Existing optional-cache helpers swallow failures and are unsuitable for this authorization contract. Do not reuse the reusable public PDF token or its development-secret fallback.
- Ten-minute lifetime, 40 MiB and 100 attachments across the entire property queue, not per-file/per-property resets. Preserve the current 1,024-character detail limit pending measured compatibility. Apply preparation rate/concurrency limits and cleanup on failed preparation, cancellation and expiry; cleanup must cover abandoned jobs, not just active app sessions.
- Store only selected share data, opaque IDs and minimum request state. Redact capabilities/recipient/content from request logs and error telemetry. Serve private files with no-store headers. Do not let redirects or external media introduce unrestricted server fetching; unsupported storage origins fail before handoff and are handled explicitly during implementation discovery.

Verification: missing auth/CSRF; wrong role/tenant/contact; partial IDs; tampered selection/path; token guessing/expiry/replay/concurrent claim; Redis outage; failed/oversize downloads; global limits; private path not publicly served; PDF/detail redaction; cleanup and restart behavior. Verify no job is advertised ready after a Redis write or file preparation failure.

## Phase 2 — signed Android receiver and app-link launch

Extend the existing helper module, `ShareRules`, bounded copying, `ExpiringFileProvider`, and `ShareIntents`. Add HTTPS download capability using platform networking; no extra networking dependency is required for this flow.

- Set a stable production application ID/signing identity distinct from the debug proof distribution, so pilot installation and future signed updates are predictable. Publish an appropriately labeled release-signed helper, not the proof debug APK.
- Add only the required INTERNET permission and a narrow VIEW/DEFAULT/BROWSABLE verified HTTPS app-link filter. Publish matching `/.well-known/assetlinks.json` with the production package and release certificate fingerprint. App Links route requests; they do not authenticate them.
- Launch with an opaque high-entropy capability only. Choose a fragment-based capability where supported and prove it survives app-link/Chrome intent transport; fragments stay out of ordinary server access logs. Do not fall back to logging a bearer secret in a query/path. The helper validates expected HTTPS origin/path and ignores arbitrary exported intents.
- Copy the safe private-cache/read-only content URI pattern. Download all request files before opening the first WhatsApp preview; validate global limits, MIME, declared integrity/order and expiry. On corruption/network failure, preserve no partial ready state. Bounded retries do not extend the session lifetime.
- Require explicit WhatsApp vs Business choice; allow only those packages. Reuse native single/multiple intents and URI grants proven in Phase 0. Do not invent a per-image caption API or treat the undocumented `jid` extra as guaranteed.
- Keep an explicit step index, prevent duplicate taps while a preview is open, and require deliberate next-step or retry actions. Revocation/expiry prevents new reads; it cannot recall copies already consumed by WhatsApp.

Verification: real Android device launch from Chrome and installed CRM PWA; app installed/missing/disabled; both WhatsApp packages; offline/expired/tampered link; app/process restart; request replay; ordered complete download; provider read-only/expiry; release signature and app-link verification. Re-run the unsaved/new-recipient matrix through the downloaded-file path.

## Phase 3 — connect the shared CRM modal

Use `PersonalWhatsAppShareModal` as the single integration point. Preserve its existing contact picker, property selection, chosen cover, detail preview, global limits, and keyboard/focus behavior.

- Android helper mode makes a valid recipient mandatory and replaces the current reminder-only text with the actual selected recipient handoff.
- Reuse current normalization helpers; reject placeholder contact keys before normalization. Contextual client/deal selection prefills the same field as inventory/contact selection.
- Prepare the authenticated job first, then present an actual user-tapped launch link/button. Do not assume asynchronous preparation followed by automatic app launch retains browser user activation.
- Support PDF-only without running media-order code that throws on an empty media list. Support video-only without requiring a first-photo selection.
- Clearly separate **Open My WhatsApp** from ordinary **Share sheet**. Missing helper, expired job, API failure, or incompatibility must show a truthful actionable state; do not silently redirect to recipient selection or show Sent.
- Preserve pending selections on recoverable failure. Selection/recipient/app changes invalidate prepared requests. Closing cancels outstanding preparation where possible. An unknown handoff outcome requires checking WhatsApp before deliberate retry.

Caller verification: inventory list/detail, mobile list and batch share, lead matches, deal matches; contextual phone prefilling; multiple properties; PDF-only; no wrong-client drift; mobile accessibility; existing desktop/other-platform sharing. Existing Android `onSent` callbacks remain unused for handoff-only outcomes.

## Phase 4 — integrated acceptance and small staff pilot

Use synthetic media and consenting test recipients from CRM through the release-signed helper. Run the entire Phase 0 matrix on the intended staff phone/app combinations. Verify recipient, preview, caption, attachment order/count, PDF, explicit next steps, cancellation, bad network, job expiry, and missing app. Record the supported combinations and any unsupported ones without real client data in evidence.

The integration stays disabled outside the pilot until those requirements pass. A pilot capability/configuration gate is sufficient; do not build a general feature-flag platform. A CRM page must not claim automatic targeting on an untested device/app combination.

## Phase 5 — guarded production release and rollback

After review/approval and passing pilot evidence, run focused authorization/token/media tests, the full relevant backend checks, CRM lint/build and helper unit/instrumentation checks. Update Graphify after source changes. Publish the signed helper plus installation/update instructions and narrow app-link association.

Follow the existing guarded GitHub deployment workflow. Before activation verify live revision/services/queues/migrations, disk/private-cache capacity, current database/uploads backups and restore proof. No migrations or real provider sends are part of this change. Verify deployed revision/hashes, authenticated CRM sharing, signed-helper launch, private-file authorization/expiry, stable services and all entrypoints. Rollback restores the previous application revision and its explicitly labeled Share sheet flow; invalidate pending handoffs. Retain the previous signed helper/release and application revision.

## Source-backed APIs and implementation map

Discovery source: `/tmp/rp-pr38-dashboard`, application equivalent to main `139babb`; original workspace local edits were not used as production truth.

| Reuse or extend | Evidence |
| --- | --- |
| Shared modal, five callers and contact prefilling | `agents/frontend/src/components/PersonalWhatsAppShareModal.tsx:29`; `InventoryList.tsx:3069`; `InventoryDetailView.tsx:286`; `mobile/MobileInventoryList.tsx:654`; `leads/MatchedPropertiesSection.tsx:266`; `deal/MatchShareTab.tsx:648` |
| Selection/order, bounded download and MIME validation | `agents/frontend/src/lib/personalWhatsAppFiles.ts:47-100` |
| Property detail text | `agents/frontend/src/lib/buildWhatsAppShareText.ts:27`; modal caption at `PersonalWhatsAppShareModal.tsx:69` |
| Authenticated cookie/CSRF client, phone helpers | `agents/frontend/src/api/client.ts:21`; `agents/frontend/src/lib/phone.ts`; `agents/backend/src/utils/phone.ts:32` |
| Inventory/PDF visibility patterns and required stronger job scope | `agents/backend/src/routes/inventory.ts:950`, `:1479`; `services/sanitization_service.ts:136`; `utils/team_scope.ts:10` |
| Existing PDF renderer | `agents/backend/src/services/pdf_generator.ts:353`, `generateInventoryPdfStream(inventories, options)` |
| Reliable Redis configuration, not optional cache authorization | `agents/backend/src/queues/connection.ts:9`; `utils/redis.ts:79` demonstrates why silent cache writes must not be reused |
| Native share intent | `agents/android/share-helper/src/main/java/com/realtypandit/shareproof/ShareIntents.java:9`, `create(String app, String phone, String details, String mime, ArrayList<Uri> files)` |
| File limits/cache/provider/expiry | `ShareRules.java:9-57`; `ShareProofActivity.java:168-251`; `ExpiringFileProvider.java:10-16`; `src/main/res/xml/share_paths.xml:3` |
| Required manifest changes and signed association | `agents/android/share-helper/src/main/AndroidManifest.xml:3-20`; `share-helper/build.gradle:4-24` |
| Existing phone gate and allowed integration contract | `docs/runbooks/android-my-whatsapp-handoff-proof.md:40-81` |

Official references consulted during discovery:

- [Android sharing and multiple files](https://developer.android.com/develop/ui/compose/sharing/send): `ACTION_SEND`, `ACTION_SEND_MULTIPLE`, `EXTRA_STREAM`, `EXTRA_TEXT`, temporary URI grants; receiver controls mixed MIME handling.
- [FileProvider](https://developer.android.com/reference/androidx/core/content/FileProvider): `getUriForFile(Context, String, File)` and narrow content URI access.
- [Android App Link filters](https://developer.android.com/training/app-links/add-applinks) and [website associations](https://developer.android.com/training/app-links/configure-assetlinks): verified HTTPS association with the production signing fingerprint.
- [Chrome Android intents](https://developer.chrome.com/docs/android/intents): browsable package-targeted launch, safe browser fallback, and direct user-gesture restrictions.

Known uncertainty: WhatsApp recipient/caption/album behavior is not controlled by the CRM, backend, or documented Android file-sharing APIs. The first deliverable is recorded phone evidence. Building the transport does not by itself satisfy the complete flow.
