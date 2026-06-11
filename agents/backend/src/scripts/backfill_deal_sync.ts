/**
 * One-time backfill: copy requirement fields from contacts → transactions
 * for all active deals where the transaction snapshot has nulls but the
 * contact has real data.
 *
 * Usage:
 *   DRY_RUN=true  npx ts-node src/scripts/backfill_deal_sync.ts
 *   DRY_RUN=false npx ts-node src/scripts/backfill_deal_sync.ts
 */
import prisma from '../db';

const DRY_RUN = process.env.DRY_RUN !== 'false';

async function main() {
    console.log(`\n=== Lead–Deal Sync Backfill (DRY_RUN=${DRY_RUN}) ===\n`);

    // OBSOLETE (2026-06-01): this one-time backfill copied legacy demand_category/demand_type_slug
    // from contacts onto transactions. Those columns were DROPPED on both Contact AND Transaction
    // (2026-05-29 demand-canonical migration). Demand is now the canonical demand_taxonomy_node_id +
    // demand_schema_values on the Contact, read live by the matching engine — no per-deal snapshot to
    // backfill. Re-running this would throw `Unknown argument demand_category`. Guarded off so it's safe.
    console.error('[backfill_deal_sync] OBSOLETE — demand is canonical on the contact (demand_taxonomy_node_id + demand_schema_values); this backfill no longer applies. Exiting.');
    process.exit(0);

    const deals = await (prisma as any).transaction.findMany({
        where: {
            status: { notIn: ['CLOSED_WON', 'CLOSED_LOST', 'ON_HOLD'] },
        },
        include: {
            demand_contact: {
                select: {
                    phone_number: true,
                    name: true,
                    demand_category: true,
                    demand_type_slug: true,
                    budget_min: true,
                    budget_max: true,
                    area_min: true,
                    area_max: true,
                    intent: true,
                    preferred_location: true,
                },
            },
        },
    });

    let patched = 0;
    let skipped = 0;

    for (const deal of deals) {
        const c = deal.demand_contact;
        if (!c) { skipped++; continue; }

        const update: Record<string, any> = {};

        if (deal.demand_area_min == null && c.area_min != null)
            update.demand_area_min = Number(c.area_min);
        if (deal.demand_area_max == null && c.area_max != null)
            update.demand_area_max = Number(c.area_max);
        if (deal.demand_budget_min == null && c.budget_min != null)
            update.demand_budget_min = Number(c.budget_min);
        if (deal.demand_budget_max == null && c.budget_max != null)
            update.demand_budget_max = Number(c.budget_max);
        if (deal.demand_category == null && c.demand_category != null)
            update.demand_category = c.demand_category;
        if (deal.demand_type_slug == null && c.demand_type_slug != null)
            update.demand_type_slug = c.demand_type_slug;
        if (deal.demand_intent == null && c.intent != null)
            update.demand_intent = (c.intent as string).toLowerCase();
        if (deal.demand_location == null && c.preferred_location != null)
            update.demand_location = c.preferred_location;

        if (Object.keys(update).length === 0) { skipped++; continue; }

        const label = `${c.name || c.phone_number} (deal ${deal.id})`;
        console.log(`[PATCH] ${label}:`);
        Object.entries(update).forEach(([k, v]) => console.log(`  ${k}: null → ${v}`));

        if (!DRY_RUN) {
            await (prisma as any).transaction.update({
                where: { id: deal.id },
                data: update,
            });
        }
        patched++;
    }

    console.log(`\nSummary: ${patched} deals patched, ${skipped} skipped (no gap or no contact).`);
    if (DRY_RUN) console.log('DRY RUN — no changes written. Set DRY_RUN=false to apply.');
    else console.log('Done — changes written to production DB.');
}

main().catch(console.error).finally(() => (prisma as any).$disconnect());
