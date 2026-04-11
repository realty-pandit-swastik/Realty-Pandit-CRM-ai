/**
 * Classification Tree Migration
 * Updates the database to match structure.txt
 *
 * Safe migration: renames existing records, adds missing ones,
 * deactivates unwanted ones. Does NOT delete anything to preserve FK refs.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('=== Classification Tree Migration ===\n');

    // ─────────────────────────────────────────────────────────────
    // 1. CATEGORIES — Ensure only 3 active: Residential, Commercial, Agricultural Land
    // ─────────────────────────────────────────────────────────────

    // Rename "Industrial" category → "Agricultural Land"
    const industrialCat = await prisma.propertyCategory.findFirst({ where: { slug: 'industrial_cat' } });
    if (industrialCat) {
        await prisma.propertyCategory.update({
            where: { id: industrialCat.id },
            data: { name: 'Agricultural Land', slug: 'agricultural_land', icon: 'tree-pine', display_order: 3, description: 'Agricultural and farm lands', labels_json: { en: 'Agricultural Land', hi: 'कृषि भूमि' } },
        });
        console.log('✓ Renamed "Industrial" category → "Agricultural Land"');
        // Deactivate old subcategories under this category (Manufacturing, Industrial Park)
        await prisma.propertySubCategory.updateMany({
            where: { category_id: industrialCat.id },
            data: { is_active: false },
        });
        console.log('  → Deactivated old subcategories (Manufacturing, Industrial Park)');
    }

    // Deactivate Institutional & Mixed Use categories
    for (const slug of ['institutional', 'mixed_use']) {
        const cat = await prisma.propertyCategory.findFirst({ where: { slug } });
        if (cat) {
            await prisma.propertyCategory.update({ where: { id: cat.id }, data: { is_active: false } });
            await prisma.propertySubCategory.updateMany({ where: { category_id: cat.id }, data: { is_active: false } });
            console.log(`✓ Deactivated "${cat.name}" category and its subcategories`);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. RESIDENTIAL SUBCATEGORIES — Match structure.txt
    // ─────────────────────────────────────────────────────────────
    const resCat = await prisma.propertyCategory.findFirst({ where: { slug: 'residential' } });
    if (!resCat) throw new Error('Residential category not found!');

    // Rename existing subcategories
    const renameResidential: { oldSlug: string; newName: string; newSlug: string }[] = [
        { oldSlug: 'apartment', newName: 'Apartment / Gated Society', newSlug: 'apartment_gated_society' },
        { oldSlug: 'individual_housing', newName: 'Independent House / Villa', newSlug: 'independent_house_villa' },
        { oldSlug: 'plot_land', newName: 'Land / Plot', newSlug: 'land_plot' },
    ];

    for (const r of renameResidential) {
        const sub = await prisma.propertySubCategory.findFirst({ where: { slug: r.oldSlug, category_id: resCat.id } });
        if (sub) {
            await prisma.propertySubCategory.update({
                where: { id: sub.id },
                data: { name: r.newName, slug: r.newSlug },
            });
            console.log(`✓ Renamed residential subcategory "${r.oldSlug}" → "${r.newName}"`);
        }
    }

    // Deactivate "Shared Living" (not in structure.txt)
    const sharedLiving = await prisma.propertySubCategory.findFirst({ where: { slug: 'shared_living', category_id: resCat.id } });
    if (sharedLiving) {
        await prisma.propertySubCategory.update({ where: { id: sharedLiving.id }, data: { is_active: false } });
        console.log('✓ Deactivated "Shared Living" subcategory');
    }

    // Add new residential subcategories
    const newResSubcategories = [
        { name: 'Builder Floor', slug: 'builder_floor', display_order: 4, icon: 'building', labels_json: { en: 'Builder Floor', hi: 'बिल्डर फ्लोर' } },
        { name: 'Builder Flat Front Facing', slug: 'builder_flat_front', display_order: 5, icon: 'building-2', labels_json: { en: 'Builder Flat Front Facing', hi: 'बिल्डर फ्लैट फ्रंट फेसिंग' } },
        { name: 'Farm House', slug: 'farm_house', display_order: 6, icon: 'trees', labels_json: { en: 'Farm House', hi: 'फार्म हाउस' } },
        { name: 'Serviced Apartments', slug: 'serviced_apartments', display_order: 7, icon: 'concierge-bell', labels_json: { en: 'Serviced Apartments', hi: 'सर्विस्ड अपार्टमेंट' } },
        { name: 'Studio Apartment', slug: 'studio_apartment', display_order: 8, icon: 'layout', labels_json: { en: 'Studio Apartment', hi: 'स्टूडियो अपार्टमेंट' } },
    ];

    for (const sc of newResSubcategories) {
        const exists = await prisma.propertySubCategory.findFirst({ where: { slug: sc.slug, category_id: resCat.id } });
        if (!exists) {
            await prisma.propertySubCategory.create({
                data: { ...sc, category_id: resCat.id, validation_rules: {} },
            });
            console.log(`✓ Added residential subcategory "${sc.name}"`);
        } else {
            console.log(`  Skipped "${sc.name}" (already exists)`);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 3. COMMERCIAL SUBCATEGORIES — Add missing ones from structure.txt
    // ─────────────────────────────────────────────────────────────
    const comCat = await prisma.propertyCategory.findFirst({ where: { slug: 'commercial' } });
    if (!comCat) throw new Error('Commercial category not found!');

    // Add missing commercial subcategories
    const newComSubcategories = [
        { name: 'Lands / Plots', slug: 'lands_plots', display_order: 6, icon: 'map', labels_json: { en: 'Lands / Plots', hi: 'भूमि / प्लॉट' } },
        { name: 'School / College', slug: 'school_college', display_order: 7, icon: 'graduation-cap', labels_json: { en: 'School / College', hi: 'स्कूल / कॉलेज' } },
    ];

    for (const sc of newComSubcategories) {
        const exists = await prisma.propertySubCategory.findFirst({ where: { slug: sc.slug, category_id: comCat.id } });
        if (!exists) {
            const created = await prisma.propertySubCategory.create({
                data: { ...sc, category_id: comCat.id, validation_rules: {} },
            });
            console.log(`✓ Added commercial subcategory "${sc.name}"`);

            // Add types for Lands/Plots
            if (sc.slug === 'lands_plots') {
                await prisma.propertyType.createMany({
                    data: [
                        { name: 'Commercial Land', slug: 'commercial_land', sub_category_id: created.id, display_order: 1, icon: 'map-pin' },
                        { name: 'Industrial Land', slug: 'industrial_land', sub_category_id: created.id, display_order: 2, icon: 'factory' },
                        { name: 'SCO Plots', slug: 'sco_plots', sub_category_id: created.id, display_order: 3, icon: 'layout-grid' },
                    ],
                });
                console.log('  → Added types: Commercial Land, Industrial Land, SCO Plots');
            }
        } else {
            console.log(`  Skipped "${sc.name}" (already exists)`);
        }
    }

    // Add missing commercial types
    // Office: add Business Park (rename SEZ Office)
    const officeSub = await prisma.propertySubCategory.findFirst({ where: { slug: 'office', category_id: comCat.id } });
    if (officeSub) {
        const sez = await prisma.propertyType.findFirst({ where: { slug: 'sez_office', sub_category_id: officeSub.id } });
        if (sez) {
            await prisma.propertyType.update({ where: { id: sez.id }, data: { name: 'Business Park', slug: 'business_park' } });
            console.log('✓ Renamed "SEZ Office" → "Business Park" under Office');
        }
    }

    // Retail: rename "High Street" → "Shop"
    const retailSub = await prisma.propertySubCategory.findFirst({ where: { slug: 'retail', category_id: comCat.id } });
    if (retailSub) {
        const highStreet = await prisma.propertyType.findFirst({ where: { slug: 'high_street', sub_category_id: retailSub.id } });
        if (highStreet) {
            await prisma.propertyType.update({ where: { id: highStreet.id }, data: { name: 'Shop', slug: 'shop' } });
            console.log('✓ Renamed "High Street" → "Shop" under Retail');
        }
    }

    // Hospitality: add Restaurant, Kiosk, Multiplex, Food Court
    const hospitalitySub = await prisma.propertySubCategory.findFirst({ where: { slug: 'hospitality', category_id: comCat.id } });
    if (hospitalitySub) {
        const newHospTypes = [
            { name: 'Restaurant', slug: 'restaurant', display_order: 5, icon: 'utensils' },
            { name: 'Kiosk', slug: 'kiosk', display_order: 6, icon: 'store' },
            { name: 'Multiplex', slug: 'multiplex', display_order: 7, icon: 'film' },
            { name: 'Food Court', slug: 'food_court', display_order: 8, icon: 'coffee' },
        ];
        for (const t of newHospTypes) {
            const exists = await prisma.propertyType.findFirst({ where: { slug: t.slug, sub_category_id: hospitalitySub.id } });
            if (!exists) {
                await prisma.propertyType.create({ data: { ...t, sub_category_id: hospitalitySub.id } });
                console.log(`✓ Added type "${t.name}" under Hospitality`);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 4. VERIFY FINAL STATE
    // ─────────────────────────────────────────────────────────────
    const activeCategories = await prisma.propertyCategory.findMany({
        where: { is_active: true },
        include: {
            sub_categories: {
                where: { is_active: true },
                include: { property_types: { where: { is_active: true } } },
            },
        },
        orderBy: { display_order: 'asc' },
    });

    console.log('\n=== Final Classification Tree ===');
    for (const cat of activeCategories) {
        console.log(`\n📁 ${cat.name} (${cat.slug})`);
        for (const sub of cat.sub_categories) {
            const types = sub.property_types.map(t => t.name).join(', ');
            console.log(`  ├── ${sub.name} ${types ? `→ [${types}]` : ''}`);
        }
    }

    console.log('\n=== Migration Complete ===');
}

main()
    .catch((e) => {
        console.error('Migration failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
