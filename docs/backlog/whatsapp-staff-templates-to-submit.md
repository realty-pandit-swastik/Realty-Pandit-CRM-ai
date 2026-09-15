# WhatsApp templates to submit — staff (internal) notifications

> **STATUS (2026-07-24): all 4 APPROVED by Meta.** Wired: `rp_agent_lead_reassigned` (`392ff50`),
> `rp_agent_deal_reassigned` (`ec1eb09`), **`rp_agent_task_assigned` (`e7ba8be`, 2026-07-24)**.
> **`rp_agent_daily_digest` — approved but intentionally NOT wired** (owner chose "skip for now" on
> 2026-07-24; needs a recipients decision + two metrics the current 9 AM digest doesn't compute).
> The registry/wiring recipe below still applies when we pick the digest back up.
>
> 🟡 **NEW 2026-08-09 — `rp_agent_lead_shared` (§5) is DRAFTED, NOT YET SUBMITTED.** Needs a human
> in WhatsApp Manager; nothing in code can submit it. Until it is approved the `lead_shared` event
> ships **without** a `waTemplate`, so its WhatsApp leg only lands for recipients inside their own
> 24-hour window — the bell and push notifications are unaffected and always fire.

**Why:** internal alerts are sent as free-form text, which Meta only delivers inside the 24-hour
customer-service window. That window closes 24h after **the recipient** last messaged the bot, so
staff alerts stop for anyone who doesn't chat with the bot daily. Measured 2026-07-22:
**33 of 34 staff numbers were outside the window**, and 13 of 14 staff were bouncing with `131047`.

`lead_assigned` is already fixed using the existing approved `rp_tx_lead_assigned_v3`. The templates
below cover the remaining bouncing notifications and need Meta approval (~1–2 days).

## How to wire one up once approved

1. Add it to `backend/src/config/whatsapp_templates.ts` with its `params` in `{{1}}…{{n}}` order.
2. Add a `waTemplate` block to the matching event in `backend/src/config/notification_events.ts`:

```ts
waTemplate: {
    key: 'rp_deal_reassigned_agent',
    params: (d) => ({ agent: d.to_agent || 'there', deal: d.deal_id || 'N/A', ... }),
},
```

`notify.ts` does the rest via `SessionTracker.smartSend`. **Every param must be non-empty** — Meta
rejects blank variables, so always provide an `'N/A'`-style fallback.

## Category

All **UTILITY**. They are transactional alerts to our own staff about work assigned to them — not
marketing. Do not submit these as MARKETING; that category is throttled harder and counts against
the quality rating, which is what caused the July restriction.

---

## 1. `rp_agent_lead_reassigned` — Lead reassigned to an agent

Replaces the free-form *"Lead Reassigned to You"*. Do **not** reuse `rp_executive_reassigned_v2` —
that one is customer-facing.

```
🔄 Lead reassigned to you

👤 Lead: {{1}}
📞 Phone: {{2}}
↪️ From: {{3}}
📝 Reason: {{4}}

Open the CRM to take it forward.
```
| Var | Meaning | Example |
|---|---|---|
| {{1}} | lead name | Amit Sharma |
| {{2}} | lead phone | +919876543210 |
| {{3}} | previous agent | Hardiq |
| {{4}} | reason (or `N/A`) | Workload balancing |

## 2. `rp_agent_deal_reassigned` — Deal reassigned to an agent

```
🔄 Deal reassigned to you

🤝 Deal: {{1}}
👤 Customer: {{2}}
↪️ From: {{3}}
📝 Reason: {{4}}

Open the Deal Pipeline to continue.
```
| Var | Meaning | Example |
|---|---|---|
| {{1}} | short deal id | 8021f0e3 |
| {{2}} | customer name | Umesh Sharma |
| {{3}} | previous agent | Ashwani |
| {{4}} | reason (or `N/A`) | Coordinator change |

## 3. `rp_agent_task_assigned` — Qualify-lead / call task

Covers both *"New Qualify Lead Task"* and *"Call new lead"*.

```
✅ New task assigned

📋 Task: {{1}}
👤 Regarding: {{2}}
⏰ Due: {{3}}

Complete it in the CRM before the due time.
```
| Var | Meaning | Example |
|---|---|---|
| {{1}} | task title | Qualify Lead |
| {{2}} | lead/customer | NARESH KUMAR |
| {{3}} | due date-time | 23 Jul, 10:30 AM |

## 4. `rp_agent_daily_digest` — Panditji morning / evening digest

⚠ Most likely of the four to be rejected — digests read as bulk content. Keep it strictly numeric
with no promotional language, and submit it **last**, after the others are approved, so a rejection
can't slow the rest down.

```
📊 {{1}} summary — {{2}}

📥 New leads: {{3}}
🔥 Hot leads: {{4}}
📅 Visits today: {{5}}
🤝 Deals needing action: {{6}}

Open the dashboard for the full picture.
```
| Var | Meaning | Example |
|---|---|---|
| {{1}} | Morning / Evening | Morning |
| {{2}} | date | 23 Jul 2026 |
| {{3}} | new lead count | 161 |
| {{4}} | hot lead count | 24 |
| {{5}} | visits today | 0 |
| {{6}} | deals needing action | 3,425 |

## 5. `rp_agent_lead_shared` — Lead shared with a teammate  🟡 NOT YET SUBMITTED

Added 2026-08-09 with the lead-sharing work (`13a490c` … `f98bb5d`). Sharing a lead notified
**nobody** until `13a490c`; the teammate only found out if someone phoned them.

⚠ Do **not** reuse `rp_agent_lead_reassigned`. It is UTILITY and structurally identical, but it
says *reassigned* — the opposite of what happens here. A share does **not** move ownership: the
assigned agent is unchanged and the recipient gains a second pair of hands, not the lead. Sending
"reassigned to you" would make people think they now own it.

```
🤝 Lead shared with you

👤 Lead: {{1}}
📞 Phone: {{2}}
↪️ Shared by: {{3}}

You can view and work this lead — the owner is unchanged.
Open the CRM and use "Shared with me" to find it.
```
| Var | Meaning | Example |
|---|---|---|
| {{1}} | lead name | Amit Sharma |
| {{2}} | lead phone | +919876543210 |
| {{3}} | who shared it | Savikant Sharma |

Only 3 variables — there is no "reason" field on a share, and Meta rejects blank variables, so do
not pad it with a fourth.

### Wiring once approved

Both edits are copy-paste; nothing else changes. `notify()` routes via `SessionTracker.smartSend`
automatically as soon as the `waTemplate` block exists.

**1.** `backend/src/config/whatsapp_templates.ts` — beside `rp_agent_lead_reassigned`:
```ts
rp_agent_lead_shared: {
    name: 'rp_agent_lead_shared',
    category: 'UTILITY',
    language: 'en',
    body: '🤝 Lead shared with you\n\n👤 Lead: {{1}}\n📞 Phone: {{2}}\n↪️ Shared by: {{3}}\n\nYou can view and work this lead — the owner is unchanged.\nOpen the CRM and use "Shared with me" to find it.',
    params: [
        { key: 'lead',  example: 'Amit Sharma' },
        { key: 'phone', example: '+919876543210' },
        { key: 'by',    example: 'Savikant Sharma' },
    ],
},
```

**2.** `backend/src/config/notification_events.ts` — inside the existing `lead_shared` event:
```ts
waTemplate: {
    key: 'rp_agent_lead_shared',
    params: (d) => ({
        lead:  d.lead_name   || 'A lead',
        phone: d.phone       || 'N/A',
        by:    d.sharer_name || 'A team member',
    }),
},
```
The event already passes `lead_name`, `phone` and `sharer_name`, each with a non-empty fallback at
the call site (`routes/leads.ts` `POST /:phone/share`) — `sharer_name` comes from a DB lookup
because `req.agent` is the raw JWT payload and carries no `name`.

### Verifying after wiring

Share a lead with a teammate who is **outside** their 24-hour window (that is the whole point —
before this, those recipients got nothing). Confirm the WhatsApp message arrives and that no
`131047` appears for that number in the logs. The bell row is written by `notify()` regardless, so
a delivered bell alone does **not** prove the template worked.

---

## Submission order

1. `rp_agent_lead_reassigned` + `rp_agent_deal_reassigned` (highest volume after lead_assigned)
2. `rp_agent_task_assigned`
3. `rp_agent_daily_digest` (riskiest — submit once the others are through)
4. **`rp_agent_lead_shared` — outstanding.** Low volume (35 shares total on prod as of
   2026-08-09), so it is not a throughput or `131049` concern; it just needs submitting.

Submit via **WhatsApp Manager → Message templates → Create template**, category **Utility**,
language **English**. See [`meta-template-approval.md`](../runbooks/meta-template-approval.md) for
the approval workflow and common rejection reasons.

## Interim workaround

Until these are live, a staff member simply sending **any** WhatsApp message to the bot reopens
their own 24-hour window — but it lapses again 24h later, which is exactly why the templates are
the real fix.
