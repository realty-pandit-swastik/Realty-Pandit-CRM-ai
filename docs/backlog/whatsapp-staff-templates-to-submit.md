# WhatsApp templates to submit — staff (internal) notifications

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

---

## Submission order

1. `rp_agent_lead_reassigned` + `rp_agent_deal_reassigned` (highest volume after lead_assigned)
2. `rp_agent_task_assigned`
3. `rp_agent_daily_digest` (riskiest — submit once the others are through)

Submit via **WhatsApp Manager → Message templates → Create template**, category **Utility**,
language **English**. See [`meta-template-approval.md`](../runbooks/meta-template-approval.md) for
the approval workflow and common rejection reasons.

## Interim workaround

Until these are live, a staff member simply sending **any** WhatsApp message to the bot reopens
their own 24-hour window — but it lapses again 24h later, which is exactly why the templates are
the real fix.
