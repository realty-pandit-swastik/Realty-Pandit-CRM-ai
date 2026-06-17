---
name: reference-reassign-authority
description: Lead managers (employees) can reassign their own leads/deals/inventory to another team member. Three endpoints + audit + dual-side notification. Locked 2026-05-15.
metadata:
  type: reference
---

# Lead-manager reassign authority (locked 2026-05-15)

Employees who currently own a lead/deal/inventory can hand it off to another team member. Every reassign writes an audit row to `interactions` and fires push/WhatsApp to **both** the new owner and the previous owner.

## Permission model

| Resource | Endpoint | Gate | Employee self-check |
|---|---|---|---|
| Lead | `PATCH /api/leads/:phone/reassign` | none (default `authMiddleware`) | `if role==='employee' && contact.assigned_agent_id !== actor.id → 403` |
| Deal | `PATCH /api/deals/:id/reassign` | `act_on_deals` | `if role==='employee' && deal.coordinator_agent_id !== actor.id → 403` |
| Inventory | `POST /api/inventory/:id/transfer` | existing | (existing rule — super_boss/manager or current assigned) |

Managers + super_boss bypass the self-check (they can reassign anything).

## Audit rows

- **Lead:** `interactions` row, `event_type='lead_reassigned'`, metadata `{from_agent_id, from_agent_name, to_agent_id, to_agent_name, reason, actor_id}`
- **Deal:** `team_actions` row (existing pattern), `action_type='reassign'`
- **Inventory:** `interactions` row, `event_type='inventory_transferred'`, metadata mirrors lead shape

Diagnostic query:
```sql
SELECT created_at, event_type, content, metadata
FROM interactions
WHERE event_type IN ('lead_reassigned','inventory_transferred')
ORDER BY created_at DESC LIMIT 20;
```

## Notification events (config/notification_events.ts)

| Event key | Recipient | Channels |
|---|---|---|
| `lead_reassigned_to_me` | new owner | whatsapp + push |
| `lead_reassigned_away` | previous owner | push only |
| `deal_reassigned_to_me` | new coordinator | whatsapp + push |
| `deal_reassigned_away` | previous coordinator | push only |
| `inventory_transferred` (existing) | new handler | whatsapp + email + push |
| `inventory_transferred_away` | previous handler | push only |

"Away" events are intentionally push-only — previous owner already knows they handed off; avoid WhatsApp spam.

## Frontend entry point

Lead detail slide-out → "Assigned Agent" dropdown. Shows for super_boss/manager always; for employees only when `editAgent === agent.id` (i.e., they own this lead). Routes through `reassignLead()` helper in `src/api/client.ts`, which calls `/reassign` not `/assign`. The `/assign` endpoint still exists for unassign (null) and manager-only operations.

## Verification commands

```bash
# Employee login
curl -c /tmp/c.txt -X POST 'https://api.realtypandit.in/auth/login' \
  -d '{"phone":"8851772681","password":"****REDACTED****"}' -H 'Content-Type: application/json'
TOKEN=$(curl -s -b /tmp/c.txt -c /tmp/c.txt 'https://api.realtypandit.in/auth/csrf' \
  | grep -oE '"csrf_token":"[^"]*"' | sed 's/.*://;s/"//g')

# Reassign own lead → 200
curl -b /tmp/c.txt -H "X-CSRF-Token: $TOKEN" -H 'Content-Type: application/json' \
  -X PATCH 'https://api.realtypandit.in/api/leads/%2B919650484671/reassign' \
  -d '{"agent_id":"<target>","reason":"test"}'

# Reassign other's lead → 403
curl -b /tmp/c.txt -H "X-CSRF-Token: $TOKEN" -H 'Content-Type: application/json' \
  -X PATCH 'https://api.realtypandit.in/api/leads/%2B919871995201/reassign' \
  -d '{"agent_id":"<target>"}'
```

## Related

- [[reference_deal_permissions]] — `act_on_deals` vs `manage_deals` split (deal-reassign uses act_on_deals)
- [[feedback_jwt_agent_shape]] — fetch actor name from DB, not from `req.agent`
- [[feedback_prisma_enum_as_any]] — sibling silent-fail class
