# Inventory NULL `uploaded_by_agent_id` Recovery

## When to use

If managers or employees report "I submitted inventory but it doesn't show in my list," and the inventory IS in the DB but with `uploaded_by_agent_id = NULL`. This means the agent's session expired during submission and the `/api/workflow/commit` endpoint silently dropped the agent linkage.

The endpoint-level fix landed 2026-05-11 (`backend/src/routes/workflow.ts:269` — admin source now rejects expired JWTs with 401). But existing NULL records from before that fix need backfill.

Background: see [`../precautions/workflow-engine-traps.md`](../precautions/workflow-engine-traps.md).

## Detection query

```js
// /var/www/realty-pandit/backend/fix-null.js (one-off script)
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const nullRecords = await prisma.inventory.findMany({
    where: { uploaded_by_agent_id: null, upload_source: 'admin' },
    select: { id: true, display_id: true, created_at: true, uploader_phone: true, uploader_name: true },
    orderBy: { created_at: 'desc' },
    take: 50,
  });
  console.log('NULL admin records:', nullRecords.length);
  console.log(JSON.stringify(nullRecords, null, 2));
  await prisma.$disconnect();
})();
```

Run on server:
```bash
scp -i $RP_KEY fix-null.js root@72.62.231.224:/var/www/realty-pandit/backend/
ssh -i $RP_KEY root@72.62.231.224 "cd /var/www/realty-pandit/backend && node fix-null.js"
```

## Patching procedure

For records where the agent identity is recoverable (e.g. one manager whose session expired during a known submission window):

```js
const result = await prisma.inventory.updateMany({
  where: { uploaded_by_agent_id: null, upload_source: 'admin' },
  data: { uploaded_by_agent_id: '<agent-id>' },
});
```

If multiple agents could be responsible, scope by `created_at` window + `uploader_phone` to narrow.

**Always confirm with the user (super_boss) before bulk-assigning**, especially across different uploader_phones — those values are the **property owner's** phone, not the agent's. Multiple uploader_phones in the NULL set = multiple submitting agents whose JWTs expired.

## Verification

After patching:
```js
const remaining = await prisma.inventory.count({
  where: { uploaded_by_agent_id: null, upload_source: 'admin' }
});
console.log('Remaining NULL admin records:', remaining);  // should be 0
```

Then confirm the affected manager can now see the inventory in their list (use the role-based visibility query):
```js
const teamIds = [<manager_id>, ...teamMemberIds];
const visible = await prisma.inventory.count({
  where: {
    status: 'active',
    OR: [
      { uploaded_by_agent_id: { in: teamIds } },
      { reference_agent_id: { in: teamIds } },
      { assigned_agent_id: { in: teamIds } },
    ]
  }
});
```

## Historical context

On 2026-05-11, 18 admin-submitted records from April 19 through May 9 had `uploaded_by_agent_id = NULL`. All 18 were assigned to Ashwani (the manager who reported the bug); Ashwani's visible inventory count went from 77 → 94.
