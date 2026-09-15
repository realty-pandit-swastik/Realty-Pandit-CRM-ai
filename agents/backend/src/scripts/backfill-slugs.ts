/**
 * Backfill/regenerate SEO slugs for all inventory records.
 *
 * Usage: npx ts-node src/scripts/backfill-slugs.ts
 * Or via node after build: node dist/scripts/backfill-slugs.js
 *
 * Pass --force to regenerate ALL slugs (not just null ones).
 */

import prisma from '../db';
import { generateUniqueSlug } from '../utils/slug';

const force = process.argv.includes('--force');

async function backfillSlugs() {
    console.log(`Starting slug backfill${force ? ' (FORCE - regenerating all)' : ''}...`);

    const properties = await prisma.inventory.findMany({
        where: force ? {} : { slug: null },
        select: {
            id: true,
            type: true,
            category: true,
            specs: true,
            intent: true,
            location: true,
            city: true,
            locality: true,
            sub_locality: true,
            apartment_name: true,
            full_address: true,
            flat_no: true,
            plot_no: true,
            property_configuration: { select: { name: true } },
        },
    });

    console.log(`Found ${properties.length} properties to process`);

    let success = 0;
    let failed = 0;

    for (const property of properties) {
        try {
            const slug = await generateUniqueSlug({
                id: property.id,
                type: property.type || undefined,
                category: property.category || undefined,
                specs: property.specs || {},
                intent: property.intent || undefined,
                location: property.location,
                city: property.city,
                locality: property.locality,
                sub_locality: property.sub_locality,
                apartment_name: property.apartment_name,
                full_address: property.full_address,
                flat_no: property.flat_no,
                plot_no: property.plot_no,
                configuration_name: property.property_configuration?.name,
            });

            await prisma.inventory.update({
                where: { id: property.id },
                data: { slug },
            });

            success++;
            console.log(`  [${success}/${properties.length}] ${property.id} → ${slug}`);
        } catch (err) {
            failed++;
            console.error(`  FAILED ${property.id}:`, err);
        }
    }

    console.log(`\nBackfill complete: ${success} success, ${failed} failed out of ${properties.length} total`);
    await prisma.$disconnect();
}

backfillSlugs().catch((err) => {
    console.error('Backfill error:', err);
    process.exit(1);
});
