/**
 * Backfill Migration Script: Populate category_id, sub_category_id, type_id
 * on Inventory records that have legacy `category` and `type` fields but
 * null hierarchical classification fields.
 *
 * Run with: npx ts-node prisma/backfill-categories.ts
 * (or: npx tsx prisma/backfill-categories.ts)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Legacy type → (sub_category slug, property_type slug) ──────────────
// Each legacy `type` value maps to a specific sub-category and property type
// in the new hierarchical classification tree.
const TYPE_MAPPING: Record<string, { subCategorySlug: string; propertyTypeSlug: string }> = {
    // Residential types
    flat:           { subCategorySlug: 'apartment',          propertyTypeSlug: 'flat' },
    apartment:      { subCategorySlug: 'apartment',          propertyTypeSlug: 'flat' },
    villa:          { subCategorySlug: 'individual_housing',  propertyTypeSlug: 'villa' },
    house:          { subCategorySlug: 'individual_housing',  propertyTypeSlug: 'independent_house' },
    independent_house: { subCategorySlug: 'individual_housing', propertyTypeSlug: 'independent_house' },
    plot:           { subCategorySlug: 'plot_land',           propertyTypeSlug: 'residential_plot' },
    builder_flat:   { subCategorySlug: 'apartment',          propertyTypeSlug: 'flat' },
    builder_floor:  { subCategorySlug: 'apartment',          propertyTypeSlug: 'builder_floor' },
    penthouse:      { subCategorySlug: 'apartment',          propertyTypeSlug: 'penthouse' },
    duplex:         { subCategorySlug: 'apartment',          propertyTypeSlug: 'duplex' },
    studio:         { subCategorySlug: 'apartment',          propertyTypeSlug: 'studio_apartment' },
    farm_house:     { subCategorySlug: 'individual_housing',  propertyTypeSlug: 'farm_house' },
    farmhouse:      { subCategorySlug: 'individual_housing',  propertyTypeSlug: 'farm_house' },
    pg:             { subCategorySlug: 'shared_living',       propertyTypeSlug: 'pg' },
    // Commercial types
    office:         { subCategorySlug: 'office',              propertyTypeSlug: 'commercial_office_space' },
    shop:           { subCategorySlug: 'retail',              propertyTypeSlug: 'retail_shop' },
    showroom:       { subCategorySlug: 'retail',              propertyTypeSlug: 'showroom' },
    warehouse:      { subCategorySlug: 'industrial',          propertyTypeSlug: 'warehouse' },
    factory:        { subCategorySlug: 'industrial',          propertyTypeSlug: 'factory' },
    godown:         { subCategorySlug: 'industrial',          propertyTypeSlug: 'godown' },
    hotel:          { subCategorySlug: 'hospitality',         propertyTypeSlug: 'hotel' },
    restaurant:     { subCategorySlug: 'hospitality',         propertyTypeSlug: 'restaurant' },
};

// ── Legacy category → master_categories slug ───────────────────────────
// The legacy `category` field values already match the master_categories slugs.
// (e.g., "residential" → slug "residential", "commercial" → slug "commercial")

interface BackfillStats {
    total: number;
    updated: number;
    skippedNoCategory: number;
    skippedCategoryNotFound: number;
    skippedSubCategoryNotFound: number;
    skippedTypeNotFound: number;
    errors: number;
}

async function backfill() {
    console.log('=== Backfill Categories Migration ===\n');

    // 1. Pre-load all master data into lookup maps for efficiency
    console.log('Loading master data...');

    const categories = await prisma.propertyCategory.findMany();
    const subCategories = await prisma.propertySubCategory.findMany();
    const propertyTypes = await prisma.propertyType.findMany();

    console.log(`  Categories: ${categories.length}`);
    console.log(`  Sub-categories: ${subCategories.length}`);
    console.log(`  Property types: ${propertyTypes.length}\n`);

    // Build slug-based lookup maps
    const categoryBySlug = new Map(categories.map(c => [c.slug, c]));

    // Sub-categories keyed by "categoryId:slug"
    const subCategoryByKey = new Map(
        subCategories.map(sc => [`${sc.category_id}:${sc.slug}`, sc])
    );

    // Property types keyed by "subCategoryId:slug"
    const propertyTypeByKey = new Map(
        propertyTypes.map(pt => [`${pt.sub_category_id}:${pt.slug}`, pt])
    );

    // 2. Fetch all inventory records with null category_id
    const records = await prisma.inventory.findMany({
        where: { category_id: null },
        select: {
            id: true,
            category: true,
            type: true,
        },
    });

    console.log(`Found ${records.length} inventory records with null category_id.\n`);

    if (records.length === 0) {
        console.log('Nothing to backfill. All records already have category_id set.');
        return;
    }

    // 3. Build update operations
    const stats: BackfillStats = {
        total: records.length,
        updated: 0,
        skippedNoCategory: 0,
        skippedCategoryNotFound: 0,
        skippedSubCategoryNotFound: 0,
        skippedTypeNotFound: 0,
        errors: 0,
    };

    const updates: Array<ReturnType<typeof prisma.inventory.update>> = [];

    for (const record of records) {
        const legacyCategory = record.category?.toLowerCase().trim();
        const legacyType = record.type?.toLowerCase().trim();

        // Skip if no legacy category value
        if (!legacyCategory) {
            console.warn(`  SKIP [${record.id}]: No legacy category value.`);
            stats.skippedNoCategory++;
            continue;
        }

        // Look up the master category by slug
        const masterCategory = categoryBySlug.get(legacyCategory);
        if (!masterCategory) {
            console.warn(`  SKIP [${record.id}]: Category slug "${legacyCategory}" not found in master_categories.`);
            stats.skippedCategoryNotFound++;
            continue;
        }

        // Start building the update payload -- at minimum we set category_id
        const updateData: {
            category_id: string;
            sub_category_id?: string;
            type_id?: string;
        } = {
            category_id: masterCategory.id,
        };

        // Try to resolve sub_category and property_type from legacy type
        if (legacyType && TYPE_MAPPING[legacyType]) {
            const mapping = TYPE_MAPPING[legacyType];

            // Find the sub-category under this category
            const subCategory = subCategoryByKey.get(`${masterCategory.id}:${mapping.subCategorySlug}`);
            if (subCategory) {
                updateData.sub_category_id = subCategory.id;

                // Find the property type under this sub-category
                const propType = propertyTypeByKey.get(`${subCategory.id}:${mapping.propertyTypeSlug}`);
                if (propType) {
                    updateData.type_id = propType.id;
                } else {
                    console.warn(
                        `  WARN [${record.id}]: Property type slug "${mapping.propertyTypeSlug}" not found ` +
                        `under sub-category "${mapping.subCategorySlug}". Setting category + sub-category only.`
                    );
                    stats.skippedTypeNotFound++;
                }
            } else {
                console.warn(
                    `  WARN [${record.id}]: Sub-category slug "${mapping.subCategorySlug}" not found ` +
                    `under category "${legacyCategory}". Setting category only.`
                );
                stats.skippedSubCategoryNotFound++;
            }
        } else if (legacyType) {
            console.warn(
                `  WARN [${record.id}]: Legacy type "${legacyType}" has no mapping defined. Setting category only.`
            );
        }

        updates.push(
            prisma.inventory.update({
                where: { id: record.id },
                data: updateData,
            })
        );
    }

    // 4. Execute all updates in a single transaction (batched)
    if (updates.length > 0) {
        console.log(`\nExecuting ${updates.length} updates in a transaction...`);

        // Prisma $transaction supports an array of promises.
        // For very large datasets, batch in chunks to avoid memory issues.
        const BATCH_SIZE = 500;
        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
            const batch = updates.slice(i, i + BATCH_SIZE);
            await prisma.$transaction(batch);
            const batchEnd = Math.min(i + BATCH_SIZE, updates.length);
            console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: updated records ${i + 1} - ${batchEnd}`);
            stats.updated += batch.length;
        }
    }

    // 5. Print summary
    console.log('\n=== Backfill Summary ===');
    console.log(`  Total records with null category_id:  ${stats.total}`);
    console.log(`  Successfully updated:                 ${stats.updated}`);
    console.log(`  Skipped (no legacy category):         ${stats.skippedNoCategory}`);
    console.log(`  Skipped (category not in master):     ${stats.skippedCategoryNotFound}`);
    console.log(`  Warnings (sub-category not found):    ${stats.skippedSubCategoryNotFound}`);
    console.log(`  Warnings (property type not found):   ${stats.skippedTypeNotFound}`);
    console.log(`  Errors:                               ${stats.errors}`);
    console.log('\nBackfill complete.');
}

backfill()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('Backfill failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
