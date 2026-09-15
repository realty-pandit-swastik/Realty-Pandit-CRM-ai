/**
 * Seed Script: Flat Property Types + Data Migration
 *
 * 1. Seeds 38 FlatPropertyType entries (12 residential + 25 commercial + 1 agricultural)
 * 2. Migrates existing Inventory data: district→city, price→dual pricing, upload_source
 *
 * Run: npx ts-node prisma/seed_flat_types.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface FlatTypeEntry {
    name: string;
    slug: string;
    main_category: string;
    display_order: number;
    is_active?: boolean;
    bhk_required: boolean;
    floor_required: boolean;
    plot_area_required: boolean;
    legacy_category_slug: string;
    legacy_type_slug: string;
}

const FLAT_PROPERTY_TYPES: FlatTypeEntry[] = [
    // ═══════════════════════════════════════
    // RESIDENTIAL (8 active, 4 deactivated)
    // ═══════════════════════════════════════
    {
        name: 'Apartment / Gated Society',
        slug: 'residential_apartment',
        main_category: 'residential',
        display_order: 1,
        is_active: true,
        bhk_required: true,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'residential',
        legacy_type_slug: 'apartment',
    },
    {
        name: 'Builder Floor',
        slug: 'builder_floor',
        main_category: 'residential',
        display_order: 2,
        is_active: true,
        bhk_required: true,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'residential',
        legacy_type_slug: 'builder_floor',
    },
    {
        name: 'Builder Flat Front Facing',
        slug: 'builder_flat_front_back',
        main_category: 'residential',
        display_order: 3,
        is_active: true,
        bhk_required: true,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'residential',
        legacy_type_slug: 'builder_flat',
    },
    {
        name: 'Builder Flat Back Facing',
        slug: 'builder_flat_back_facing',
        main_category: 'residential',
        display_order: 4,
        is_active: true,
        bhk_required: true,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'residential',
        legacy_type_slug: 'builder_flat',
    },
    {
        name: 'Independent House / Villa',
        slug: 'independent_house_villa',
        main_category: 'residential',
        display_order: 5,
        is_active: true,
        bhk_required: true,
        floor_required: false,
        plot_area_required: true,
        legacy_category_slug: 'residential',
        legacy_type_slug: 'villa',
    },
    {
        name: 'Land / Plot',
        slug: 'residential_land_plot',
        main_category: 'residential',
        display_order: 6,
        is_active: true,
        bhk_required: false,
        floor_required: false,
        plot_area_required: true,
        legacy_category_slug: 'residential',
        legacy_type_slug: 'plot',
    },
    {
        name: 'Farm House',
        slug: 'farm_house',
        main_category: 'residential',
        display_order: 7,
        is_active: true,
        bhk_required: true,
        floor_required: false,
        plot_area_required: true,
        legacy_category_slug: 'residential',
        legacy_type_slug: 'farm_house',
    },
    {
        name: 'Studio Apartment',
        slug: 'studio_apartment',
        main_category: 'residential',
        display_order: 8,
        is_active: true,
        bhk_required: false,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'residential',
        legacy_type_slug: 'studio',
    },
    // --- Deactivated residential types ---
    {
        name: 'Independent / Builder Floor',
        slug: 'independent_builder_floor',
        main_category: 'residential',
        display_order: 99,
        is_active: false,
        bhk_required: true,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'residential',
        legacy_type_slug: 'builder_floor',
    },
    {
        name: 'Serviced Apartments',
        slug: 'serviced_apartments',
        main_category: 'residential',
        display_order: 99,
        is_active: false,
        bhk_required: true,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'residential',
        legacy_type_slug: 'serviced_apartment',
    },
    {
        name: 'New Projects',
        slug: 'new_projects',
        main_category: 'residential',
        display_order: 99,
        is_active: false,
        bhk_required: true,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'residential',
        legacy_type_slug: 'new_project',
    },
    {
        name: 'Other',
        slug: 'residential_other',
        main_category: 'residential',
        display_order: 99,
        is_active: false,
        bhk_required: false,
        floor_required: false,
        plot_area_required: false,
        legacy_category_slug: 'residential',
        legacy_type_slug: 'other',
    },

    // ═══════════════════════════════════════
    // COMMERCIAL (25 types)
    // ═══════════════════════════════════════
    {
        name: 'Commercial Shops',
        slug: 'commercial_shops',
        main_category: 'commercial',
        display_order: 1,
        bhk_required: false,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'shop',
    },
    {
        name: 'Commercial Showrooms',
        slug: 'commercial_showrooms',
        main_category: 'commercial',
        display_order: 2,
        bhk_required: false,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'showroom',
    },
    {
        name: 'Commercial Office / Space',
        slug: 'commercial_office_space',
        main_category: 'commercial',
        display_order: 3,
        bhk_required: false,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'office',
    },
    {
        name: 'Commercial Land / Inst. Land',
        slug: 'commercial_land',
        main_category: 'commercial',
        display_order: 4,
        bhk_required: false,
        floor_required: false,
        plot_area_required: true,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'commercial_land',
    },
    {
        name: 'Hotel / Resorts',
        slug: 'hotel_resorts',
        main_category: 'commercial',
        display_order: 5,
        bhk_required: false,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'hotel',
    },
    {
        name: 'Guest-House / Banquet-Halls',
        slug: 'guest_house_banquet',
        main_category: 'commercial',
        display_order: 6,
        bhk_required: false,
        floor_required: false,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'guest_house',
    },
    {
        name: 'Time Share',
        slug: 'time_share',
        main_category: 'commercial',
        display_order: 7,
        bhk_required: false,
        floor_required: false,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'time_share',
    },
    {
        name: 'Office in Business Park',
        slug: 'office_business_park',
        main_category: 'commercial',
        display_order: 8,
        bhk_required: false,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'office_business_park',
    },
    {
        name: 'Office in IT Park',
        slug: 'office_it_park',
        main_category: 'commercial',
        display_order: 9,
        bhk_required: false,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'office_it_park',
    },
    {
        name: 'WareHouse',
        slug: 'warehouse',
        main_category: 'commercial',
        display_order: 10,
        bhk_required: false,
        floor_required: false,
        plot_area_required: true,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'warehouse',
    },
    {
        name: 'Industrial Lands / Plots',
        slug: 'industrial_land_plots',
        main_category: 'commercial',
        display_order: 11,
        bhk_required: false,
        floor_required: false,
        plot_area_required: true,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'industrial_land',
    },
    {
        name: 'Cold Storage',
        slug: 'cold_storage',
        main_category: 'commercial',
        display_order: 12,
        bhk_required: false,
        floor_required: false,
        plot_area_required: true,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'cold_storage',
    },
    {
        name: 'Factory',
        slug: 'factory',
        main_category: 'commercial',
        display_order: 13,
        bhk_required: false,
        floor_required: false,
        plot_area_required: true,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'factory',
    },
    {
        name: 'Manufacturing',
        slug: 'manufacturing',
        main_category: 'commercial',
        display_order: 14,
        bhk_required: false,
        floor_required: false,
        plot_area_required: true,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'manufacturing',
    },
    {
        name: 'Agricultural / Farm Land',
        slug: 'agricultural_farm_land_commercial',
        main_category: 'commercial',
        display_order: 15,
        bhk_required: false,
        floor_required: false,
        plot_area_required: true,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'agricultural_land',
    },
    {
        name: 'Business Center',
        slug: 'business_center',
        main_category: 'commercial',
        display_order: 16,
        bhk_required: false,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'business_center',
    },
    {
        name: 'Other',
        slug: 'commercial_other',
        main_category: 'commercial',
        display_order: 17,
        bhk_required: false,
        floor_required: false,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'other',
    },
    {
        name: 'Ready to Move Office Space',
        slug: 'ready_to_move_office',
        main_category: 'commercial',
        display_order: 18,
        bhk_required: false,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'office',
    },
    {
        name: 'Bare Shell Office Space',
        slug: 'bare_shell_office',
        main_category: 'commercial',
        display_order: 19,
        bhk_required: false,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'office',
    },
    {
        name: 'Co-working Office Space',
        slug: 'coworking_office',
        main_category: 'commercial',
        display_order: 20,
        bhk_required: false,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'office',
    },
    {
        name: 'Food Court',
        slug: 'food_court',
        main_category: 'commercial',
        display_order: 21,
        bhk_required: false,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'food_court',
    },
    {
        name: 'SCO Plots',
        slug: 'sco_plots',
        main_category: 'commercial',
        display_order: 22,
        bhk_required: false,
        floor_required: false,
        plot_area_required: true,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'sco_plot',
    },
    {
        name: 'Restaurant',
        slug: 'restaurant',
        main_category: 'commercial',
        display_order: 23,
        bhk_required: false,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'restaurant',
    },
    {
        name: 'Kiosk',
        slug: 'kiosk',
        main_category: 'commercial',
        display_order: 24,
        bhk_required: false,
        floor_required: false,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'kiosk',
    },
    {
        name: 'Multiplex',
        slug: 'multiplex',
        main_category: 'commercial',
        display_order: 25,
        bhk_required: false,
        floor_required: true,
        plot_area_required: false,
        legacy_category_slug: 'commercial',
        legacy_type_slug: 'multiplex',
    },

    // ═══════════════════════════════════════
    // AGRICULTURAL (1 type)
    // ═══════════════════════════════════════
    {
        name: 'Agricultural Land',
        slug: 'agricultural_land',
        main_category: 'agricultural',
        display_order: 1,
        bhk_required: false,
        floor_required: false,
        plot_area_required: true,
        legacy_category_slug: 'agricultural',
        legacy_type_slug: 'agricultural_land',
    },
];

async function main() {
    console.log('=== Inventory Redesign v2: Seed & Data Migration ===\n');

    // Step 1: Upsert FlatPropertyType entries (creates new, updates existing names/order/active)
    console.log('[1/4] Upserting FlatPropertyType entries...');
    let created = 0;
    let updated = 0;

    for (const entry of FLAT_PROPERTY_TYPES) {
        const is_active = entry.is_active !== undefined ? entry.is_active : true;
        const result = await prisma.flatPropertyType.upsert({
            where: { slug: entry.slug },
            create: { ...entry, is_active },
            update: {
                name: entry.name,
                display_order: entry.display_order,
                is_active,
                bhk_required: entry.bhk_required,
                floor_required: entry.floor_required,
                plot_area_required: entry.plot_area_required,
            },
        });
        // Check if it was newly created (no updated_at) or updated
        const existing = await prisma.flatPropertyType.findUnique({ where: { slug: entry.slug } });
        if (existing) updated++; else created++;
    }
    console.log(`   Processed: ${created + updated} entries (upserted)`);

    // Step 2: Migrate district → city
    console.log('[2/4] Migrating district → city...');
    const districtMigration = await prisma.$executeRawUnsafe(
        `UPDATE inventory SET city = district WHERE city IS NULL AND district IS NOT NULL`
    );
    console.log(`   Updated ${districtMigration} records`);

    // Step 3: Migrate price → customer_price + display_price
    console.log('[3/4] Migrating price → dual pricing...');
    const priceMigration = await prisma.$executeRawUnsafe(
        `UPDATE inventory SET customer_price = price, display_price = price WHERE customer_price IS NULL AND price IS NOT NULL`
    );
    console.log(`   Updated ${priceMigration} records`);

    // Step 4: Set upload_source for existing records
    console.log('[4/4] Setting upload_source for existing records...');
    const unknownUploadMigration = await prisma.$executeRawUnsafe(
        `UPDATE inventory SET upload_source = 'unknown' WHERE upload_source IS NULL`
    );
    console.log(`   Set to unknown: ${unknownUploadMigration}`);

    // Summary
    const totalTypes = await prisma.flatPropertyType.count();
    const totalInventory = await prisma.inventory.count();
    console.log(`\n=== Done! ===`);
    console.log(`FlatPropertyType total: ${totalTypes}`);
    console.log(`Inventory total: ${totalInventory}`);
}

main()
    .catch((e) => {
        console.error('Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
