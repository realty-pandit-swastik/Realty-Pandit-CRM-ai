# Personal WhatsApp property sharing — desktop pilot

Implemented locally on 2026-10-08. On 2026-10-09, the user confirmed successful local CRM → extension → personal WhatsApp sharing. Production deployment and the full multi-user/media/interruption acceptance matrix remain pending. Android Web Share was subsequently integrated into the internal CRM on 2026-10-09; the isolated public-site prototype remains outside this release.

## Android and production installation update (2026-10-09)

The shared internal CRM picker now supports Android Web Share as well as the desktop extension. On Android Chrome over HTTPS, prepare attachments first, then tap Share to WhatsApp. Choose WhatsApp, the recipient, and Send on the phone. Every selected property has its own media step, with an optional generated brandless PDF in a separate step. The displayed CRM recipient is a reminder, not a programmatic recipient selection. Share text supplies property details; use Copy property details if WhatsApp omits the caption. The CRM cannot select WhatsApp silently, press Send, guarantee order/caption placement, or confirm delivery. Cancellation retains prepared files; changing attachments clears preparation. Each next step requires a fresh Share tap. No personal deal-share record is created on native handoff.

Video-only selections are now valid; on desktop the first video carries details if no photo is selected. Select at least one photo or video per property; PDF-only sharing remains unsupported. Existing size/count/caption limits apply to the whole prepared selection, including PDFs. Android MIME/file combinations must pass `navigator.canShare` before a share button appears.

Desktop production setup is available at `/my-whatsapp-setup` after CRM login. Publish the versioned extension ZIP as an unlisted Chrome Web Store listing; employees follow Install My WhatsApp extension, confirm Chrome installation, reload CRM, sign into WhatsApp Web in the same profile, and check connection. A website cannot silently install the extension. Until an approved ID is configured in `VITE_PERSONAL_WHATSAPP_EXTENSION_ID`, the CRM clearly shows store publication pending. Chrome is the primary browser; verify Edge installation/sending before advertising it. Store review/approval and the live 2–3-person pilot remain rollout dependencies. See `agents/whatsapp-extension/STORE-LISTING.md` for upload, permission, privacy, asset, and reviewer requirements. Privacy page: `/my-whatsapp-privacy.html`.

Version 0.2.0 probes installation/version without requiring a WhatsApp tab. The CRM checks video-first capability before preparation, so version 0.1.0 must be updated/reloaded even for photo-first sends in the new CRM. Previous CRM photo-first payloads remain supported by the new extension. Extension updates are separate from CRM code deployment. To disable personal sharing during an incident, remove/disable the extension; roll back CRM artifacts through the guarded release workflow. Do not retry interrupted shares automatically.

Production evidence in this task: latest main 17443d9 has a successful guarded deploy run, but both local SSH identities failed authentication, and existing social/scheduled queue failures remain unexplained. No new production deployment was performed. Browser approval denied store access and localhost QA, so no live-device/store-installation proof or store screenshots are claimed.

## Additional acceptance for this release

- [ ] Android Chrome HTTPS: photos, mixed photos/videos, video-only, PDF separate, multiple properties, WhatsApp and WhatsApp Business; choose/check recipient for every step.
- [ ] Actual caption placement/order checked; copy-details fallback works when WhatsApp drops text.
- [ ] Cancel retains files; edits invalidate them; no sent/timeline record created on handoff.
- [ ] Unsupported `canShare`, download failure, empty/unsupported files, size/count/caption limits block handoff.
- [ ] Desktop store install, reload, missing/outdated extension, logged-out account; video-first caption and existing account-switch/interruption/restart matrix.
- [ ] Store privacy URL reachable, reviewer account/screenshots synthetic, Chrome Web Store ID configured, Edge verified before promotion.

## What employees do

1. In the web CRM, open a property and choose **My WhatsApp**. This is also available for selected inventory, lead matches, and deal matches. Company WhatsApp remains a separate existing action.
2. Select individual photos/videos; all start unchecked. Choose the **First photo with details** radio button. Each selected property requires a photo or video. Video-only is supported; PDF-only remains unsupported.
3. Optionally check **Include property PDF** (generated without branding). The existing authenticated CRM PDF endpoint creates that property's brandless brochure. There is no manual PDF upload in this workflow.
4. Enter the recipient's WhatsApp number, or search a CRM contact. The CRM cannot read the employee's entire personal WhatsApp address book. Recipient selection occurs here before the send, rather than in WhatsApp's native contact picker.
5. Check the connection, then choose **Review and send from my WhatsApp**. Selected attachments download before any send; a missing/unsupported/oversized file blocks preparation. A separate extension review tab shows the sending number, recipient, requesting CRM origin, filenames in order, photos, and captions.
6. Confirm **Confirm and send** in that review tab. The extension sends through the employee's already-linked WhatsApp Web account in the same browser profile. There is no need to operate an Android phone for a send; WhatsApp account/device linking remains WhatsApp's normal prerequisite.
7. The first selected photo (or first video for video-only selections) carries property details and Property ID. Remaining selected photos follow in gallery order, then selected videos, then the optional PDF. With multiple properties, each property forms a separate block with its own first-photo caption. Generated captions contain no Realty Pandit/API links, branding, or owner contact fields. Captions use the existing customer-facing display-price formatter; optional PDFs use the existing brandless template.
8. The CRM reports WhatsApp acknowledgements. This means a send was acknowledged, not that the recipient received/read it. A failure stops the batch. Files not attempted are not retried automatically. Inspect the chat before sharing again to avoid duplicates.

Personal sends do not create a company chatbot send, scheduled campaign, or server-side personal session. They currently do not write the deal's Shared tab/timeline: the previous link-opening action recorded a share before a real send; this implementation removes that premature record. Results remain visible in the open CRM modal and extension review tab until closed/expired.

## Local setup

Use Node 22.18+ (focused CRM tests use Node's TypeScript stripping), Chrome or Chromium Edge on a desktop. Keep the existing local backend/database and CRM login setup; this change adds no backend service, migration, secrets, or Redis dependency.

Build the extension:

```bash
cd agents/whatsapp-extension
npm ci --ignore-scripts
npm test
npm run build
```

Open `chrome://extensions` (Edge: `edge://extensions`), enable Developer mode, choose **Load unpacked**, and select the repository's `agents/whatsapp-extension/dist` directory. Do not select `src` or the package root. After any extension rebuild, click Reload for the extension and reload the CRM. `dist` is generated and ignored by Git.

Run the CRM in a separate terminal:

```bash
cd agents/frontend
npm run test:personal-whatsapp
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://localhost:5173`, sign in with a local test employee, and open `https://web.whatsapp.com/` in the same browser profile. Use a test property with photos/videos accessible from your configured `VITE_API_BASE_URL`; ensure the existing local API and cookie/CORS configuration works first. Do not point test fixtures at production records.

Use `localhost` consistently for the CRM and local API. The default backend CORS allowlist does not include `http://127.0.0.1:5173`; opening the CRM there while its API uses `localhost` blocks login and also mixes cookie hostnames. The extension allowlist alone does not configure backend CORS.

The trusted origin allowlist is exact: localhost/127.0.0.1 on ports 5173 and 7575, and HTTPS `admin.realtypandit.in`, `www.realtypandit.in`, `agents.realtypandit.in`. A different hostname/port requires an explicit reviewed change to `src/protocol.js` and matching manifest origins. Only the internal CRM currently mounts the new picker; public website origins are permitted for the existing site family, not evidence of a public-site integration.

## Pilot acceptance before the 30-person rollout

Use 2–3 consenting staff and recipient chats they control. Do not use customer chats for a casual test. Each staff member installs the extension and links their own account in a separate browser profile; never share a profile/session between employees.

- [ ] Single photo: selected photo receives accurate property details/ID, no RP/API link or owner information.
- [ ] Select a later photo as cover: it arrives first; unselected photos never arrive.
- [ ] Mixed photos/videos and optional PDF: correct order; PDF absent when unchecked and brandless when selected.
- [ ] Multiple properties: each property's caption appears with its own cover.
- [ ] Choose a recipient different from the deal's default: final extension review and resulting chat match the chosen number.
- [ ] Two employees: each send originates from their own account.
- [ ] Missing extension, logged-out account, failed download, unsupported media, >40 MB: clear error, no send during preparation.
- [ ] Switch account between prepare and confirm: refuse the send.
- [ ] Double-click, another CRM tab, close pending review, interrupt WhatsApp/browser mid-send: no automatic retry; inspect actual chat and partial results.
- [ ] Existing company WhatsApp/PDF/link actions still work independently.

Current automated verification covers payload validation, origin/tab ownership, trusted confirmation, duplicate preparation, account changes, sequential caption/media sends, partial acknowledgements, cancellation/restart/expiry, individual selection, bounded downloads, and bridge response provenance. It does not verify WhatsApp's current live UI/media conversion, browser installation, persistence across real browser restarts, or 30-user operation.

## Limits and operation

- Total selected bytes: 40 MB, up to 100 files; caption: 1,024 characters. Chrome's JSON messaging carries base64, so the limit is intentionally below its transport maximum. Large files require smaller selections/compression; this version does not transcode videos.
- Allowed MIME types: image JPEG/PNG/WebP/GIF/AVIF, video MP4/WebM/QuickTime, and PDF. WhatsApp itself may reject/convert a format: use JPEG/PNG and MP4 for the pilot. Errors stop sending.
- Send once from the final extension confirmation. Keep CRM, review, and WhatsApp Web tabs open until the result. Closing a pending review cancels it. Closing a sending tab/browser can leave an uncertain outcome; check the chat before another attempt. Long transfers may outlive browser worker limits and also become uncertain.
- The extension temporarily stores only the prepared attachments, recipient/account identifiers, and outcomes in its local IndexedDB. Attachments are removed on completion/cancellation; expired records are purged after ten minutes by periodic cleanup while the browser is running and when a request starts. If the browser is closed, cleanup resumes on reopening. No session cookies/credentials are uploaded to CRM servers or stored by this bridge. Existing CRM-hosted property files remain in their normal backend storage.
- Permissions: execute the packaged adapter in WhatsApp Web, a periodic expiry alarm, and content scripts on the listed CRM/site origins. No all-websites access, remote executable downloads, account synchronization, or company chatbot API calls. The WA-JS dependency is pinned to 4.6.1 and its Apache 2.0 license is bundled. Review dependency changes and pilot them before distributing a new build.
- WA-JS is an unofficial WhatsApp Web integration. WhatsApp updates can break it, and unofficial automation can risk account restrictions. A free repository does not remove that risk. This remains a supervised pilot, not a promise of production reliability or a replacement for an official API when that becomes acceptable.

For 30 employees, distribute one reviewed extension version through the team's normal managed-browser process (store/unlisted/enterprise distribution as applicable); loading unpacked is a local pilot method. Validate browser policy/support and extension update ownership before rollout. No fleet installation, store submission, server deployment, real account connection, or actual sending was performed as part of this implementation.
