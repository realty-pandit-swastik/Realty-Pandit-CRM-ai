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
