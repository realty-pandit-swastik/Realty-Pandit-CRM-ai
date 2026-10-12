# Android CRM My WhatsApp pilot

Status: implementation verified locally; production publication pending. The user authorized this production pilot before handset acceptance. Test with synthetic property media and your own second number or a consenting recipient.

## Install the correct helper

On Android, open CRM's `/my-whatsapp-setup` and install the signed **My WhatsApp pilot 0.2.0-pilot**. Planned download: [my-whatsapp-pilot.apk](https://github.com/realty-pandit-swastik/Realty-Pandit-CRM-ai/releases/download/android-crm-pilot-v0.2.0/my-whatsapp-pilot.apk). Package: `com.realtypandit.mywhatsapp`. The old **My WhatsApp proof** APK is a separate app and cannot receive CRM handoffs. Disable the browser's unknown-app installation permission after installing.

APK SHA-256: `40b43547cf515d0b04ea0c09b2216e12dc81e4c4fcc6083b6b93ea35b8a01c77`.

## Test from CRM

1. Open Android Chrome or the CRM PWA. Use **My WhatsApp** from inventory list, property details, mobile inventory, lead matches or deal matches.
2. Select the client or enter their full country-coded phone number. For the decisive test, use an unsaved number with no existing WhatsApp conversation. Confirm the displayed number. Select WhatsApp or WhatsApp Business explicitly; check the sending account in WhatsApp later.
3. Choose photos/videos, the first photo and optionally the PDF. Review property details. PDF-only and video-only are supported; several properties remain separate ordered steps. Maximum handoff: 100 files and 40 MiB including generated PDFs.
4. Prepare the Android pilot, then tap **Open My WhatsApp**. The installed helper downloads and verifies the exact prepared files and presents the recipient, chosen app and steps. It must not require retyping the number or selecting files again. Handoffs expire after 10 minutes; an expired or already-claimed request needs fresh preparation.
5. Open the media preview. Verify the recipient, attachment count/order, selected first photo, caption/details and sending account. Tap **Send** yourself, or cancel. Returning to the helper does not confirm sending.
6. If selected, deliberately open the next PDF preview for the same recipient and manually Send. PDF-only starts with this step. Continue each additional property's explicit steps; nothing is sent automatically.

**Pass:** the correct recipient's preview opens directly, including an unsaved/never-messaged number, with every selected original file and the intended details/caption/order. **Fail:** a recipient chooser appears, the wrong chat opens, files/details disappear, the first-photo caption or order changes, or the chosen WhatsApp app is ignored. Do not choose a person manually and count direct targeting as passed.

Repeat single photo, multiple photos, video-only, mixed photo/video, PDF-only and media followed by PDF. Repeat on ordinary WhatsApp and Business, saved/existing and unsaved/new recipients, Chrome and PWA. Check cancel, repeat taps, offline download, expiry and missing app. Record phone/Android/WhatsApp versions and observed caption placement without private recipient data.

The ordinary **Share sheet** action is independent: it asks you to pick a WhatsApp recipient and may not offer unsaved/new recipients. It is not proof that direct CRM targeting works. This pilot uses the installed WhatsApp application, not the company WhatsApp API, and records no confirmed personal sends or deliveries.

## Release and rollback

Publish the verified signed APK and verify its public digest before activating CRM links. Pass all candidate CI checks, then use the existing guarded deployment with `RUN_MIGRATIONS=0`. Verify the deployed revision, source hashes, website/admin, static `/my-whatsapp/open.html`, asset association and APK links, DB/Redis, PM2, nginx and queues. No production client fixtures or provider sends are part of deployment verification.

Real-handset targeting, app-link launch, caption placement and ordering remain unverified until this checklist passes. If unsupported, keep the failure visible and review the product behavior before broader rollout. Application rollback restores the prior release without database changes; temporary handoffs expire. Signing material and private staged media must never be committed or published.
