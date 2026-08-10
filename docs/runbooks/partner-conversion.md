# Runbook — lead ↔ partner agent conversion

Converting a lead to a **Partner Agent** and undoing it. Shipped 2026-08-10 —
`b62cfdd`, `a364611`, `f2277d8`.

---

## What converting actually does

`POST /api/leads/:phone/convert-to-partner` (`routes/leads.ts`), permission `act_on_deals`:

1. Creates a `PartnerAgent` row (ACTIVE) via `ensurePartnerAgent`
2. Flips `contact_type` → `PARTNER_AGENT` — **unless** the contact is a live BUYER/TENANT
3. Sets `verification_status = CONVERTED_PARTNER`
4. Re-tags every open deal → `PARTNER_INTERNAL` / `demand_handler_type = PARTNER`
5. **Sends the customer a partner welcome WhatsApp** ← cannot be recalled
6. Records `previous_contact_type` + `deal_prev_owners` in the interaction, for the revert

Entry points: the lead detail panel (`ExternalLeads.tsx`) and the Deal Workspace
(`DealWorkspace.tsx`), both via `ConvertToPartnerModal`.

## 🔴 The trap that caused the incident

The idempotency guard used to be `contact.contact_type === 'PARTNER_AGENT'`. The
**`_keepDemand` guard** (`partner_auto_create.ts:51`, added 2026-07-28) *deliberately refuses* to
move a live BUYER/TENANT contact to that type — it was hiding real leads from the Leads list.

Result: for exactly the leads people convert by accident, the guard never fired, so a second click
re-ran the whole conversion **and re-sent the welcome WhatsApp**. Proven on prod: `+919555562204`
(a HOT buyer) had one partner row but **two** `converted_to_partner` logs, 09:12 on 4 Aug, from two
different agents.

**The guard now keys on the `PartnerAgent` row.** Never re-key it on `contact_type` —
`_keepDemand` makes that unreliable by design. Regression test:
`backend/src/__tests__/convert_partner_idempotency.test.ts`.

## Reverting

`POST /api/partners/:id/revert-to-customer` (`routes/api.ts`), permission `manage_agents` — the
same gate as Suspend / Verify / Reassign. UI: **↩ Revert** on the Partner Agents page.

- Sets `status = SUSPENDED` + `reverted_at` + `reverted_by`
- Restores `contact_type` and clears `verification_status`
- Un-tags the deals the conversion changed, restoring the original `owning_manager_id`
- Logs `reverted_to_customer`
- The partner disappears from the Partner Agents list

**409 — refuses rather than half-reverting** when the partner has referred inventory, commission
entries, or sub-agents. 232 of 298 partners were clean at rollout; the other 66 are blocked until
those records are reassigned.

### Three deliberate design choices

⚠ **Deactivate, never delete.** `transactions.demand_handler_id` points at the partner with **no
foreign key** — deleting the row leaves dangling ids. The audit trail survives too.

⚠ **`reverted_at`, not a new status.** Status goes to `SUSPENDED` because the **existing** login
gate (`routes/agent.ts` — *"only ACTIVE partners may sign in"*, 2026-07-12) then revokes access with
no new code. The list filters on **`reverted_at IS NULL`**, *not* on status, so the 13 genuinely
SUSPENDED partners stay visible and manageable. Do not "simplify" that filter to use status.

⚠ **contact_type restore order:** the `previous_contact_type` recorded at conversion → else leave a
live BUYER/TENANT alone (`_keepDemand` never changed it) → else infer: owns inventory → `LANDLORD`,
has a RENT deal → `TENANT`, a SALE deal → `BUYER`, else `UNKNOWN`. Conversions before 2026-08-10
have no recorded value and fall to the inference.

---

## Why the Contacts page says 159 partners but the Partner Agents page says 298

**Both are right — they count different things.** Do not "fix" this by making them match.

| Source | Counts | Number |
|---|---|---|
| Contacts chip | contacts where `contact_type = 'PARTNER_AGENT'` | 159 |
| Partner Agents page | rows in `partner_agents` | 298 |

Overlap 154. The gap:

- **5** contacts typed `PARTNER_AGENT` with no partner record (manually set; harmless)
- **144** registered partners typed as something else — **122 LANDLORD (all 122 own inventory)**,
  14 BUYER, 6 MANAGEMENT, 2 TENANT

The 122 are dealers who **also list their own property**. Recording someone as a property owner
types them `LANDLORD`, overwriting `PARTNER_AGENT`. `contact_type` is one field expressing two
independent facts, and being a partner is really a *relationship* (the `partner_agents` row), not a
type.

**Left as-is deliberately (owner decision, 2026-08-10).** Re-basing the chip on the relationship
would show 298 but count those 122 twice — the chips would stop summing to the 5,844 total. If it
ever needs revisiting, `Contact.partner_profile` exists, so `{ partner_profile: { isNot: null } }`
works with no schema change.

*(`is_partner` in `routes/api.ts` and `api/client.ts` is derived from `contact_type` and has the
same skew — but it is rendered nowhere, so it is dead weight rather than a bug.)*

---

## Health checks

```sql
-- Partner agents whose contact is still a live demand lead — the accidental-conversion population.
-- 16 at rollout. Some are legitimate brokers; check the name before reverting.
SELECT p.name, p.phone_number, c.contact_type, c.lead_status, p.created_at::date
FROM partner_agents p JOIN contacts c ON c.phone_number = p.phone_number
WHERE c.contact_type IN ('BUYER','TENANT') AND p.reverted_at IS NULL
ORDER BY p.created_at DESC;

-- Duplicate conversions. Should be 0 for anything after 2026-08-10.
SELECT phone_number, count(*) FROM interactions
WHERE event_type = 'converted_to_partner' GROUP BY 1 HAVING count(*) > 1;

-- Reverted partners (hidden from the UI by design).
SELECT name, phone_number, reverted_at, reverted_by FROM partner_agents
WHERE reverted_at IS NOT NULL ORDER BY reverted_at DESC;
```

## Known gap

A LANDLORD contact never appears in **Ext. Leads** — that list only shows demand contacts — so the
live-lead warning always fires there, which is correct. The no-warning path exists only via the
Deal Workspace, where the contact can be any type.
