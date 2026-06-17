---
name: reference-bullmq-cleanup
description: BullMQ failed-jobs inspection + cleanup commands for Realty Pandit prod (Redis-backed queues)
metadata:
  type: reference
---

# BullMQ failed-jobs runbook

Two queues run on prod (Redis on `localhost:6379`, auth from `REDIS_PASSWORD` in `.env`):

| Queue | Purpose | `removeOnFail` cap |
|---|---|---|
| `scheduled-jobs` | Cron-style jobs (daily-report, 99acres-poll, housing-poll, behavior-audit, callback-sla-check, etc.) | 1000 |
| `whatsapp-inbound` | Inbound WhatsApp message processing (1 job per message) | 5000 |

## 2026-05-14 audit findings

- `scheduled-jobs:failed` had hit its **1000 cap** — every underlying bug was already fixed in code but the failed bucket never got cleaned.
- `whatsapp-inbound:failed` had **3 stale failures** from April 11–12 (`BUYER not in enum`, `lead_scores.lead_id doesn't exist`). Both schema issues fixed since.
- After cleanup: **0/0 failed**.

Root causes that contributed to the historical 1003:

| Job | Count | Bug | Status |
|---|---|---|---|
| `99acres-poll` | 652 | Pre-Apr-7 auth failures + 500s from upstream | Resolved |
| `housing-poll` | 322 | `Cannot find module '../../services/housing_poller'` — wrong relative path in `scheduled_worker.ts` | Fixed by Apr 9 |
| `daily-report` | 23 | Template-registry-key vs Meta-template-name confusion (`rp_daily_report_v3` not in registry) | Fixed 2026-05-14 |
| `pending-actions` | 2 | `contacts.meta_ad_id` column missing | Column added by Apr 17 |
| `catalog-reconcile` | 1 | Wrong import path | Fixed by Apr 20 |
| `whatsapp-inbound:process-message` | 3 | Schema drift (`BUYER` enum value, `lead_scores.lead_id`) | Fixed by Apr 12 |

## Inspect commands (read-only)

Pull Redis password into a local var first:
```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 'PASS=$(grep ^REDIS_PASSWORD /var/www/realty-pandit/backend/.env | cut -d= -f2); echo $PASS' > /dev/null
# Easier: inline every command
```

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 '
PASS=$(grep ^REDIS_PASSWORD /var/www/realty-pandit/backend/.env | cut -d= -f2)
RC="redis-cli -a $PASS --no-auth-warning"

# Counts per queue
for q in bull:scheduled-jobs bull:whatsapp-inbound; do
  echo "$q  failed=$($RC zcard $q:failed) wait=$($RC zcard $q:wait) active=$($RC zcard $q:active) delayed=$($RC zcard $q:delayed) completed=$($RC zcard $q:completed)"
done

# Top failure reasons across one queue
for id in $($RC zrange "bull:scheduled-jobs:failed" 0 -1); do
  $RC hget "bull:scheduled-jobs:$id" failedReason | head -c 100
  echo
done | sort | uniq -c | sort -rn | head -10
'
```

## Cleanup commands (destructive — use carefully)

Always inspect first, then clean. Safest: use BullMQ's own `queue.clean()` (handles both the zset and the hash payload).

```bash
ssh -i ~/.ssh/realty_pandit_key root@72.62.231.224 '
cd /var/www/realty-pandit/backend
timeout 45 node -e "
require(\"dotenv\").config();
require(\"ts-node/register/transpile-only\");
const { whatsappInboundQueue, scheduledJobsQueue } = require(\"./src/queues/index\");
(async () => {
  console.log(\"Before:\");
  for (const q of [scheduledJobsQueue, whatsappInboundQueue]) {
    console.log(\"  \" + q.name + \" failed=\" + (await q.getFailedCount()));
  }
  // clean(graceMs=0, limit=5000, status=failed) — graceMs=0 means clean ALL regardless of age
  await scheduledJobsQueue.clean(0, 5000, \"failed\");
  await whatsappInboundQueue.clean(0, 5000, \"failed\");
  console.log(\"After:\");
  for (const q of [scheduledJobsQueue, whatsappInboundQueue]) {
    console.log(\"  \" + q.name + \" failed=\" + (await q.getFailedCount()));
  }
  await scheduledJobsQueue.close();
  await whatsappInboundQueue.close();
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
"
'
```

`graceMs=0` cleans ALL failures regardless of age. To keep recent failures (e.g., last 24h), pass `graceMs=86400000` instead.

## Why letting failed jobs accumulate is bad

- Each job hash (`bull:<queue>:<id>`) holds the full data + stack trace. With 1000 jobs averaging ~5 KB, that's ~5 MB in Redis. Compounds across queues.
- The failed-bucket sorted set must be scanned by `getFailedCount()` and the GlitchTip digest pipeline — slow at 1000+.
- Real-time alerting (e.g., "alert if failed > 10/hour") gets drowned out by the static historical noise.

## Recommend running

After any deploy that fixes a class of cron failure, follow up with a cleanup. Add to deploy checklist:
1. Deploy fix
2. Verify next cron run succeeds
3. `queue.clean(0, 5000, 'failed')` to wipe the historical failures from that class
4. Confirm `failed=0` (or near it)

## Live queue dashboard

`getQueueStats()` in `agents/backend/src/queues/index.ts:39` returns counts for both queues. Already exposed via `/health` endpoint. If counts ever grow > 50, investigate within 24h.
