---
name: Meta App Deleted - Realty Pandit WhatsApp
description: Meta developer app for Realty Pandit WhatsApp Business API was accidentally deleted on 2026-04-16 — needs full reconfiguration
type: project
originSessionId: ceb7ee75-6680-4d2a-af1a-2226ee96ef01
---
Meta app on developer.facebook.com was accidentally deleted on 2026-04-16.

**Why:** This breaks ALL WhatsApp Business API functionality for Realty Pandit — no templates, no inbound webhooks, no outbound messages.

**How to apply:** The app needs to be recreated and reconfigured with:
- WhatsApp Business API product added
- Phone number registered
- Webhook URL pointed back to the server
- Verify token configured
- All 38 templates resubmitted for Meta approval
- New WHATSAPP_PHONE_ID and WHATSAPP_TOKEN generated and updated in .env
