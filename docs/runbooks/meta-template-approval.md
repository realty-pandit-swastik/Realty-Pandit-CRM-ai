# Meta WhatsApp Template Approval Runbook

## When to use

Any time you add a new WhatsApp template, change wording on an existing one, or need to monitor Meta approval status.

## WABA details (Realty Pandit)

| Field | Value |
|---|---|
| WABA ID | `2124684824933246` |
| Business ID | `782804307620931` |
| Business Verification | ✅ Verified |
| API Version | v17.0 |
| Token env var | `WHATSAPP_TOKEN` |

Update procedure when WHATSAPP_TOKEN expires: see [`whatsapp-token-rotation.md`](whatsapp-token-rotation.md).

## Adding a new template

1. **Define in code:** add the template entry in `backend/src/services/whatsapp_templates.ts` with a unique `name` (kebab_case_v<version>) and language code (`en`).
2. **Submit via Meta Business Manager UI** (or Graph API) — set the right category: `UTILITY` for transactional, `MARKETING` for promotional. Wrong category locks the template for 4 weeks.
3. **Wait for status:** templates show `PENDING` for minutes to days. Re-fetch via `GET /v17.0/<WABA_ID>/message_templates`.
4. **Update registry key when approved:** if you had to bump a `_v2`/`_v3` suffix to bypass the category lock, update the `name:` field in `whatsapp_templates.ts` to match the new Meta name.

## Graph-API submission gotchas (observed 2026-06-18)

When submitting via `POST /<WABA>/message_templates` (Graph API, not the UI):

- **Body must NOT end on a variable placeholder.** A body ending `…here:\n{{4}}` is rejected with `code=100 subcode=2388299 "Invalid parameter"` (no detail). Fix: always put a static trailing line after the last `{{N}}`. Submitting `rp_team_new_inventory` failed this way; appending `\n\nOpen Realty Pandit to see full details. 🙏` after `{{4}}` passed. (All approved templates with a link var — e.g. v5 cards' `{{7}}` — have text after the var.)
- **Meta classifies by CONTENT, not the category you submit.** A promotional CTA + a property link auto-flips the template to **MARKETING** even when you submit `category: 'UTILITY'`. `rp_team_new_inventory` ("Share it with your matching clients" + listing link) approved as MARKETING despite a UTILITY submission. For UTILITY, keep copy strictly transactional/system-notification — no "share", "check out", or marketing CTA. (MARKETING then silently drops to STOP-opted recipients per the trap below — for an internal staff broadcast that meant the WhatsApp leg was dropped entirely; see PROJECT_STATUS "Inventory epic D".)
- Submit script pattern: `backend/src/scripts/submit_*_template.js` (standalone `node`, reads `.env`, `require('dotenv')`). For TEXT-body templates no header handle is needed; for DOCUMENT/IMAGE headers you must first resumable-upload a sample to get a `header_handle` (see the brochure script's `getDocumentHandle`).

## Category lock — 4-week trap

When you submit a template under category X and Meta later flags it as the wrong category (or you submitted wrong), Meta locks that exact template name from re-categorization for **4 weeks**. The only way around is to delete + recreate with a new versioned name (`_v2`, `_v3`, …).

Active locks (as of 2026-04-29):
- `rp_whatsapp_link_v2` — stuck MARKETING, should be UTILITY → reclassify after ~2026-05-17
- `rp_partner_registered_v2` — same
- `rp_partner_welcome_v2` — same

Action when the lock expires: open Meta Business Manager → reclassify each from MARKETING to UTILITY. Saves ~₹0.44/message vs MARKETING rate.

## Versioned name map (registry key → Meta name)

When templates were deleted + recreated to bypass the category lock, the code refers to them by registry key but Meta knows them by the versioned name. The mapping lives in `whatsapp_templates.ts`. Spot-check entries:

| Registry key | Meta name |
|---|---|
| `rp_whatsapp_link` | `rp_whatsapp_link_v2` |
| `rp_team_welcome` | `rp_team_welcome_v4` |
| `rp_daily_report` | `rp_daily_report_v3` |
| `rp_welcome_buyer` | `rp_welcome_buyer_v3` |
| (full table in `whatsapp_templates.ts` registry) | |

## Verifying a template is wired

| Template | Trigger | Code path |
|---|---|---|
| `rp_partner_upload_nudge` | 24h after partner join, 0 inventory | `scheduled_worker.ts` job: partner-upload-nudge |
| `rp_team_welcome` | new team member created | `routes/team.ts` → `sendWelcomeWhatsApp()` |
| `rp_partner_login_otp` | partner portal login | `services/agent_auth.ts` → `sendPartnerOTP()` |
| `rp_daily_report` | 9 PM IST daily | `scheduled_worker.ts` job: daily-report |
| `rp_welcome_buyer` | new buyer lead | `lead_auto_engage.ts` |
| `rp_reopen_session` | 21–23h session keepalive | `scheduled_worker.ts` job: session-keepalive |

For a full triggers list, see `backend/src/services/whatsapp_templates.ts`.

## ✅ RESOLVED 2026-05-17: buyer welcome templates moved MARKETING → UTILITY

**Done:** `rp_buyer_lead_received_v4` + `rp_welcome_buyer_v5` created via Graph
API (`POST /v21.0/<WABA>/message_templates`, category `UTILITY`, bodies
identical to v3/v4) → Meta-APPROVED → registry `name:` repointed in
`whatsapp_templates.ts` (logical keys `rp_buyer_lead_received` /
`rp_welcome_buyer`) → backend deployed → verified live (logs send the v4/v5
names; Graph confirms `APPROVED / UTILITY`). New-lead welcome now delivers
(UTILITY is exempt from the marketing opt-out). The procedure below is kept as
the reusable runbook for the next time this happens.

---

**Symptom (original):** new leads report they never receive the welcome
WhatsApp, yet backend logs show `[LeadNotify] Buyer confirmation template
sent` / `[LeadAutoEngage] Template C sent`. Code is correct and the Cloud API
accepts the send — the messages are **silently not delivered**.

**Cause:** `rp_buyer_lead_received_v3` and `rp_welcome_buyer_v4` are category
**MARKETING** in Meta. WhatsApp does not deliver MARKETING templates to
recipients who have *marketing messages* disabled (common default in India).
A brand-new lead has never opted in, so they get nothing. Verified APPROVED
but MARKETING via `GET /v21.0/<WABA_ID>/message_templates?fields=name,status,category`.
These are transactional acknowledgements → they belong in **UTILITY**, which
is exempt from the marketing opt-out and delivers reliably.

**Fix procedure (Meta-admin only — code is already done):**

1. In Meta WhatsApp Manager → Message Templates, you usually cannot
   recategorize in place (the **4-week category-lock trap** above). So
   **create new templates** with a bumped version name and category
   **UTILITY**:
   - `rp_buyer_lead_received_v4` (UTILITY) — same body/params as v3
     (`name`, `link`).
   - `rp_welcome_buyer_v5` (UTILITY) — same body/params as v4.
   Keep the body strictly transactional (no promo language) or Meta re-flags
   it MARKETING.
2. Wait for `APPROVED` (minutes–days):
   `GET /v21.0/<WABA_ID>/message_templates?fields=name,status,category&access_token=$WHATSAPP_TOKEN`
   — confirm `category=UTILITY status=APPROVED` for the new names.
3. **Repoint the registry** in `backend/src/services/whatsapp_templates.ts`:
   set the `name:` of logical keys `rp_buyer_lead_received` →
   `rp_buyer_lead_received_v4` and `rp_welcome_buyer` → `rp_welcome_buyer_v5`.
   Callers already pass the **logical keys** — never the `_vN` literal (that
   drift was fixed 2026-05-17; do not reintroduce versioned names at call
   sites).
4. Deploy backend (`node deployment/deploy-agent.js backend`).
5. **Verify delivery for real:** add a test lead with a phone you control →
   confirm the WhatsApp actually arrives (not just "sent" in logs). Watch the
   new templates' quality rating stays GREEN after volume.

Until 1–4 are done, new-lead welcome delivery stays broken regardless of code.
Tracked: memory `project_pending_meta_template_utility.md`; root analysis
`docs/plans/2026-05-17-deal-sync-and-welcome-investigation.md`.

## ⚠ Recurring risk: Meta app deletion

The Meta developer app at developer.facebook.com is the parent of the WABA + webhook config. If it's accidentally deleted (happened once on 2026-04-16), ALL WhatsApp functionality stops: templates, inbound webhooks, outbound messages.

Recovery requires:
- Recreate the app
- Add WhatsApp Business API product
- Re-register phone number
- Re-point webhook URL at our server
- Configure verify token
- Resubmit all templates
- Generate new `WHATSAPP_PHONE_ID` + `WHATSAPP_TOKEN`

**Detection:** if inbound WhatsApp goes silent + outbound returns 401 from Graph API, check the Meta developer console first. Don't waste time debugging code.
