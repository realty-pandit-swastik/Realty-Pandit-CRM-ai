/**
 * One-shot cleanup: flush orphaned assets pointing at already-deactivated agents
 * down to the super_boss.
 *
 * Why this is needed: deactivations that ran before the 2026-05-12 cascade fix
 * (Bug 2 `tx.leads` typo) had their entire transaction rolled back, leaving
 * inventory + contacts + partners still pointing at the now-inactive agent.
 *
 * What this does:
 *   For each agent currently `status = 'inactive'`, calls the cascade with
 *   super_boss as the target. Idempotent — running on a clean agent transfers 0
 *   records and is a safe no-op.
 *
 * Run:
 *   node -r ts-node/register/transpile-only scripts/cleanup-deactivation-orphans.ts
 */

import prisma from '../src/db';
import { ownershipService } from '../src/services/ownership_service';

(async () => {
    const start = Date.now();

    const superBoss = await prisma.agent.findFirst({
        where: { role: 'super_boss', status: 'active' },
        select: { id: true, name: true },
    });
    if (!superBoss) {
        console.error('FATAL: no active super_boss to receive assets');
        process.exit(1);
    }
    console.log(`[cleanup] target super_boss: ${superBoss.name} (${superBoss.id})\n`);

    const inactives = await prisma.agent.findMany({
        where: { status: 'inactive' },
        select: { id: true, name: true },
    });

    if (inactives.length === 0) {
        console.log('[cleanup] no inactive agents — nothing to do');
        await prisma.$disconnect();
        process.exit(0);
    }

    console.log(`[cleanup] scanning ${inactives.length} inactive agents...\n`);

    let totalMoved = 0;
    for (const a of inactives) {
        const before = await ownershipService.getOwnershipSummary(a.id);
        const totalBefore =
            before.partners + before.inventory + before.contacts + before.leads + before.transactions;

        if (totalBefore === 0) {
            console.log(`  ${a.name.padEnd(25)} clean (0 orphans)`);
            continue;
        }

        console.log(`  ${a.name.padEnd(25)} BEFORE: ${JSON.stringify(before)}`);

        const result = await ownershipService.cascadeOnAgentDeactivation(a.id, superBoss.id);
        const sumMoved =
            result.counts.partners + result.counts.inventory + result.counts.contacts +
            result.counts.leads + result.counts.transactions;
        totalMoved += sumMoved;

        console.log(`  ${a.name.padEnd(25)} MOVED:  ${JSON.stringify(result.counts)} → super_boss`);

        const after = await ownershipService.getOwnershipSummary(a.id);
        const totalAfter =
            after.partners + after.inventory + after.contacts + after.leads + after.transactions;
        console.log(`  ${a.name.padEnd(25)} AFTER:  ${JSON.stringify(after)}\n`);
        if (totalAfter !== 0) {
            console.error(`  WARN: ${a.name} still has ${totalAfter} after cleanup`);
        }
    }

    console.log(`\n[cleanup] done. ${totalMoved} records moved in ${Date.now() - start}ms.`);
    await prisma.$disconnect();
})();
