---
name: RESOLVED — buyer welcome WhatsApp templates moved MARKETING→UTILITY
description: Closed 2026-05-17. New UTILITY templates created+approved, registry repointed, deployed, verified. Kept for the rule + history.
metadata:
  type: project
---

**Status: ✅ RESOLVED 2026-05-17.** `rp_buyer_lead_received_v4` +
`rp_welcome_buyer_v5` created via Graph API as **UTILITY** (identical bodies
to v3/v4), Meta-APPROVED, registry `name:` repointed in
`whatsapp_templates.ts`, backend deployed, verified live (logs send the v4/v5
names; Graph confirms APPROVED/UTILITY). New-lead welcomes now deliver
(UTILITY is exempt from the marketing opt-out). The rule below stays as
durable knowledge / recurrence guard.

---
**Original issue (kept for recurrence detection):** Code side was fully fixed
(template-registry drift resolved; sends succeed at API level); the blocker
was **Meta-side category**.

`rp_buyer_lead_received_v3` and `rp_welcome_buyer_v4` (the new-lead welcome /
confirmation templates) are category **MARKETING** in Meta WhatsApp Manager.
WhatsApp **silently does not deliver** MARKETING templates to recipients who
have marketing messages disabled (common default in India) — the Cloud API
still returns success, so backend logs show `Buyer confirmation template
sent` even though the buyer receives nothing. This is the real reason "AI is
not sending welcome WhatsApp" was reported.

**Why:** they are transactional acknowledgements, not marketing — UTILITY
templates are exempt from the marketing opt-out and deliver reliably.

**How to apply / close this:** in Meta WhatsApp Manager, re-create
`rp_buyer_lead_received` and `rp_welcome_buyer` as **UTILITY** category
(same body), get them approved, then update `config/whatsapp_templates.ts`
to point those logical keys at the new UTILITY template names. Procedure:
`docs/runbooks/meta-template-approval.md`. Verify done:
`GET /{WABA}/message_templates` (env `WHATSAPP_BUSINESS_ACCOUNT_ID` +
`WHATSAPP_TOKEN`, Graph v21) → category should read `UTILITY`, status
`APPROVED`. Then a brand-new lead should actually receive the WhatsApp.

If anyone re-reports "no welcome message" but logs say "sent" → check
template CATEGORY first (see [[feedback_lead_deal_sync_traps]] trap #4).
Detail: `docs/plans/2026-05-17-deal-sync-and-welcome-investigation.md`.
