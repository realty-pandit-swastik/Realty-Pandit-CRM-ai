---
name: reference-deal-permissions
description: Deal-pipeline permission matrix split into `act_on_deals` (employees can do) vs `manage_deals` (super_boss + manager only). Fixed 2026-05-15 after team members were silently blocked from Log Call.
metadata:
  type: reference
---

# Deal-pipeline permission split (locked 2026-05-15)

Before 2026-05-15, every action on a deal was gated by `checkPermission('manage_deals')`, which only super_boss + manager had. Employees got 403 on Log Call, Qualify, Stage Change, Share Property, etc. — they could SEE the pipeline but couldn't ACT on it. **`Log My Call`** button silently failed for every employee — 26+ retries logged from team-member phones, all 4–11ms 403s before the handler even ran.

## The split

`agents/backend/src/config/permissions.ts`:

```ts
// All three roles get this:
act_on_deals  // log-call, requirements, status, match, share-properties,
              // share-next-property, matched-inventory, book-appointment,
              // visit-outcome, log-action, query answer

// Only super_boss + manager get this:
manage_deals  // POST / (create deal), PATCH /:id/reassign,
              //  POST/GET /:id/commission-entries (financial)
```

## Why this split

| Action | Gate | Reason |
|---|---|---|
| Log Call outcome | `act_on_deals` | Employees ARE the lead managers on most deals — they MUST be able to update call outcomes. |
| Edit requirements (qualify) | `act_on_deals` | Same. Qualifying is the employee's daily job. |
| Stage change (NEW → QUALIFIED → VISIT_SCHEDULED…) | `act_on_deals` | Follows from log-call outcomes. |
| Share property to client | `act_on_deals` | Core sales activity. |
| Book appointment | `act_on_deals` | Visit coordination. |
| Visit outcome | `act_on_deals` | Records what happened at the visit. |
| Reassign deal to another agent | `manage_deals` | Reassignment is a supervisory action — only manager or super_boss should redirect work. |
| Create new deal from scratch | `manage_deals` | Most deals are auto-created from leads. Manual deal creation is admin-level. |
| Commission entries (create + read) | `manage_deals` | Financial data — needs supervisor approval. |

## How to verify the gate works

```bash
# Login as an employee (test account)
curl -c /tmp/c.txt -X POST 'https://api.realtypandit.in/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"phone":"8851772681","password":"****REDACTED****"}'

# Grab CSRF
TOKEN=$(curl -s -b /tmp/c.txt -c /tmp/c.txt 'https://api.realtypandit.in/auth/csrf' \
  | grep -oE '"csrf_token":"[^"]*"' | sed 's/.*://;s/"//g')

# Try the formerly-blocked routes — should NOT return 403
curl -s -b /tmp/c.txt -H "X-CSRF-Token: $TOKEN" \
  -X PATCH 'https://api.realtypandit.in/api/deals/<id>/requirements' \
  -H 'Content-Type: application/json' \
  -d '{"demand_bedrooms":"2BHK"}'
# Expected: HTTP 200 with {"success":true}

# Try the still-blocked routes — should return 403 with explicit reason
curl -s -b /tmp/c.txt -H "X-CSRF-Token: $TOKEN" \
  -X PATCH 'https://api.realtypandit.in/api/deals/<id>/reassign' \
  -H 'Content-Type: application/json' \
  -d '{"agent_id":"<id>"}'
# Expected: HTTP 403 with {"error":"Access denied. Missing permission: manage_deals"}
```

## Diagnostic trick

When the user complains "button doesn't work / silently fails", check the backend log for **403 with duration < 50ms** on the relevant POST/PATCH path:

```bash
grep '"status":403' /var/www/realty-pandit/backend/logs/combined-YYYY-MM-DD.log \
  | head -5
```

A fast 403 means middleware denial — not a business-logic bug. Look at `checkPermission('xxx')` on the route and compare to the user's role permission list.

## Related

- [[reference_callback_routing]] — separate handler that already runs without permission gate (auto-fires)
- [[feedback_prisma_enum_as_any]] — different class of silent-fail bug we fixed on `/requirements` same week
