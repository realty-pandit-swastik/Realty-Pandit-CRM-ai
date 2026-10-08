# Chrome Web Store submission

Upload `release/realty-pandit-my-whatsapp-0.2.0.zip` after `npm ci --ignore-scripts`, `npm test`, and `npm run package`. Use an unlisted listing. Anyone with the listing link can install it; CRM authentication still governs property access.

**Name:** Realty Pandit — My WhatsApp

**Summary:** Share selected CRM property photos, videos and brochures through your own WhatsApp Web after reviewing the sender and recipient.

**Description:** Choose individual property attachments in the Realty Pandit CRM. Review the linked WhatsApp account, recipient, property captions and attachment order in the extension, then confirm the send. Photos or videos carry the property details; an optional brandless brochure follows. WhatsApp Web must be signed in in the same browser profile. The desktop WhatsApp app is not required. This is an unofficial integration, not affiliated with WhatsApp or Meta. It can break or risk account restrictions. Acknowledgement is not delivery or read confirmation.

**Single purpose:** Employee-initiated sharing of selected CRM property files through that employee's linked WhatsApp Web.

**Permission justification:** `scripting` and WhatsApp Web host access execute the locally bundled WA-JS sender/account check. CRM content scripts carry authenticated user-selected share requests from approved origins. `alarms` removes expired preparation records. No remotely hosted executable code is loaded by this extension.

**Privacy URL after CRM deployment:** `https://admin.realtypandit.in/my-whatsapp-privacy.html`. Disclose handling of account/recipient identifiers and user-selected property content, local temporary storage, and sending to WhatsApp. Do not declare that the extension handles no user data. No advertising, sale, analytics, or separate developer collection.

**Reviewer instructions:** The flow needs an authenticated test CRM account and a reviewer-controlled WhatsApp Web account. Arrange a dedicated least-privilege synthetic CRM account through the private reviewer channel; never place passwords in this file or the public listing. Review always precedes sending. Public CRM privacy policy must be reachable before submission.

**Assets:** Packaged 16/48/128 icons. Capture store screenshots of setup, selected synthetic property attachments, and extension review using synthetic contact/account details. Do not publish staff/customer numbers or real property-owner data. Screenshots and a successful live 2–3-staff pilot remain release gates.

After approval, set `VITE_PERSONAL_WHATSAPP_EXTENSION_ID` to the assigned 32-character ID in the persistent frontend production configuration and rebuild through the guarded release workflow. Verify installation in Chrome; verify Edge before claiming Edge support. Store uploads and CRM deployments are separate releases. Submit higher extension versions for updates; preserve the old photo-first payload support.
