---
name: reference-new-lead-alerts
description: New-lead WhatsApp + push alerts — Sunny (Savikant Sharma) gets every new lead; assigned agent gets a "this is yours" copy. Wired via Prisma $extends so all 14 ingestion paths are covered.
metadata:
  type: reference
---

# New-lead alert pipeline (live 2026-05-14)

Every time a fresh demand-side contact (`BUYER`/`TENANT`/`UNKNOWN`) enters the CRM from any source, two notifications fire:

1. **WhatsApp text to Sunny (Savikant Sharma, +91 9999992400)** — always, with full lead details.
2. **WhatsApp text to the assigned agent** (if different from Sunny) — same details, but framed as "this lead is assigned to you".
3. **Push + in-app notification** to both via the existing `notify('new_lead_arrived', ...)` event.

## Code map

| File | Purpose |
|---|---|
| `agents/backend/src/services/new_lead_alerts.ts` | `fireNewLeadAlerts()` + `resolveSunnyAgentId()` + `shouldAutoAssignToSunny()` helpers |
| `agents/backend/src/db.ts` | Prisma `$extends.query.contact.create` middleware — catches EVERY contact create and triggers alerts/auto-assign |
| `agents/backend/src/config/notification_events.ts` | `new_lead_arrived` event entry (push channel, prefKey `new_lead_arrived`) |

## Auto-assignment rule

| Source | Auto-assigned to |
|---|---|
| `whatsapp` / `whatsapp_inbound` / `voice` / `panditji_voice` | **Sunny (Savikant Sharma)** when caller didn't set `assigned_agent_id` |
| `99acres` / `magicbricks` / `housing` / `website` / etc. | Whatever the upstream code already chose — NOT overridden |

The auto-assign list is the `AUTO_ASSIGN_SOURCES` Set in `new_lead_alerts.ts`. Edit there to expand.

## Who is "Sunny" — resolution order

1. `SUNNY_AGENT_ID` env var (explicit override, currently unset)
2. Agent named "Savikant Sharma" with role `super_boss` — currently matches `503ebb67-9005-4d71-b167-36e900c1423b`
3. First active super_boss by `created_at` (fallback)

Cached for 5 min to avoid hammering the agents table on every contact create.

## Why Prisma $extends instead of editing 14 call sites

`prisma.contact.create()` is called from 14+ places: webhook_processor, magicbricks integration, 99acres poller, housing poller, voice service, chat handler, email service, OTP signup, partner auto-create, public routes, etc. Patching each one would mean missing edge cases and creating drift. The `$extends.query.contact.create` middleware sits in `db.ts` and runs for ALL of them, including any future ingestion path.

## Smoke test

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 '
cd /var/www/realty-pandit/backend
timeout 30 node -e "
require(\"dotenv\").config();
require(\"ts-node/register/transpile-only\");
const prisma = require(\"./src/db\").default;
(async () => {
  const tenant = await prisma.tenant.findFirst();
  const testPhone = \"+919999999\" + Math.floor(Math.random()*900+100);
  const c = await prisma.contact.create({
    data: {
      phone_number: testPhone, tenant_id: tenant.id,
      source: \"whatsapp\", contact_type: \"BUYER\", lead_status: \"warm\",
      name: \"Smoke Test\", intent: \"buy\",
      preferred_location: \"Vaishali Ghaziabad\",
      demand_bhk: 3, budget_min: 5000000, budget_max: 12000000,
    }
  });
  console.log(\"assigned_agent_id=\", c.assigned_agent_id);  // expect Savikant Sharma id
  await new Promise(r => setTimeout(r, 4000));
  await prisma.contact.delete({ where: { phone_number: testPhone } });
})();"
'
```

Then grep the log:
```
grep -iE "NewLeadAlert|Sending to 919999992400" /var/www/realty-pandit/backend/logs/combined-$(date +%Y-%m-%d).log | tail -5
```

Expect to see `[NewLeadAlert] Fired alerts for new lead ... (source=whatsapp, assigned=Savikant Sharma)`.

## Gotchas

- **Prisma `$extends` and import paths:** in `db.ts`, dynamic imports of services live at `'./services/...'` (sibling dir), NOT `'../services/...'`. Got bitten in v1 of this code — alerts silently failed because import resolved to nothing. The try/catch swallowed it.
- **24-hour WhatsApp session window:** plain text only works if Sunny or the agent has messaged the bot within 24h. If not, WhatsApp will silently drop the message. For reliability beyond 24h, swap to a Meta-approved UTILITY template later.
- **Fire-and-forget by design:** the create write returns immediately; alerts run async. If WhatsApp API is down, the contact is still created — alert just logs a warning and moves on.

## Disable the alerts temporarily

Set `SUNNY_AGENT_ID` to a non-existent UUID in `.env`. The lookup will return null, the WhatsApp send will be skipped, and a warning will log instead of an alert firing. (No need to redeploy code.)
