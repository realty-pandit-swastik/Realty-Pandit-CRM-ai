
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding Master Data Structure (Full Classification Tree)...');

    // 1. CLEAR EXISTING MASTER DATA (Reverse order for FK constraints)
    await prisma.propertyType.deleteMany({});
    await prisma.propertySubCategory.deleteMany({});
    await prisma.propertyCategory.deleteMany({});
    await prisma.propertyConfiguration.deleteMany({});
    await prisma.usageType.deleteMany({});
    await prisma.investmentType.deleteMany({});

    // 2. SEED CONFIGURATIONS
    const configurations = [
        { name: '1 BHK', slug: '1-bhk', display_order: 1, icon: 'bed' },
        { name: '2 BHK', slug: '2-bhk', display_order: 2, icon: 'bed' },
        { name: '3 BHK', slug: '3-bhk', display_order: 3, icon: 'bed' },
        { name: '4 BHK', slug: '4-bhk', display_order: 4, icon: 'bed' },
        { name: '5+ BHK', slug: '5-plus-bhk', display_order: 5, icon: 'bed' },
        { name: 'Studio', slug: 'studio', display_order: 6, icon: 'layout' },
        { name: 'Duplex', slug: 'duplex', display_order: 7, icon: 'layers' },
        { name: 'Penthouse', slug: 'penthouse', display_order: 8, icon: 'crown' },
        { name: 'Warm Shell', slug: 'warm-shell', display_order: 9, icon: 'box' },
        { name: 'Bare Shell', slug: 'bare-shell', display_order: 10, icon: 'box' },
        { name: 'Furnished', slug: 'furnished', display_order: 11, icon: 'sofa' },
        { name: 'Semi-Furnished', slug: 'semi-furnished', display_order: 12, icon: 'sofa' },
        { name: 'Unfurnished', slug: 'unfurnished', display_order: 13, icon: 'box' },
        { name: 'Boss Cabin', slug: 'boss-cabin', display_order: 14, icon: 'briefcase' },
        { name: 'Ground Floor', slug: 'ground-floor', display_order: 15, icon: 'building' },
    ];

    for (const config of configurations) {
        await prisma.propertyConfiguration.create({ data: config });
    }
    console.log(`Seeded ${configurations.length} configurations`);

    // 3. SEED USAGE TYPES
    const usageTypes = [
        { name: 'Self Use', slug: 'self_use', display_order: 1, labels_json: { en: 'Self Use', hi: 'स्वयं उपयोग' } },
        { name: 'Investment', slug: 'investment', display_order: 2, labels_json: { en: 'Investment', hi: 'निवेश' } },
        { name: 'Rental Income', slug: 'rental_income', display_order: 3, labels_json: { en: 'Rental Income', hi: 'किराये की आय' } },
        { name: 'Business Use', slug: 'business_use', display_order: 4, labels_json: { en: 'Business Use', hi: 'व्यापार उपयोग' } },
    ];

    for (const ut of usageTypes) {
        await prisma.usageType.create({ data: ut });
    }
    console.log(`Seeded ${usageTypes.length} usage types`);

    // 4. SEED INVESTMENT TYPES
    const investmentTypes = [
        { name: 'Pre-launch', slug: 'pre_launch', display_order: 1, labels_json: { en: 'Pre-launch', hi: 'प्री-लॉन्च' } },
        { name: 'Under Construction', slug: 'under_construction', display_order: 2, labels_json: { en: 'Under Construction', hi: 'निर्माणाधीन' } },
        { name: 'Ready to Move', slug: 'ready_to_move', display_order: 3, labels_json: { en: 'Ready to Move', hi: 'रेडी टू मूव' } },
        { name: 'Resale', slug: 'resale', display_order: 4, labels_json: { en: 'Resale', hi: 'पुनर्विक्रय' } },
    ];

    for (const it of investmentTypes) {
        await prisma.investmentType.create({ data: it });
    }
    console.log(`Seeded ${investmentTypes.length} investment types`);

    // =====================================================
    // 5. SEED FULL CLASSIFICATION TREE (matches structure.txt)
    // =====================================================

    // ── A. RESIDENTIAL ──────────────────────────────────
    const resCat = await prisma.propertyCategory.create({
        data: {
            name: 'Residential', slug: 'residential',
            icon: 'home', display_order: 1,
            description: 'Houses, apartments, plots and residential spaces',
            labels_json: { en: 'Residential', hi: 'आवासीय' }
        }
    });

    // A.1 Apartment / Gated Society
    const aptGated = await prisma.propertySubCategory.create({
        data: {
            name: 'Apartment / Gated Society', slug: 'apartment_gated_society', category_id: resCat.id,
            icon: 'building', display_order: 1,
            labels_json: { en: 'Apartment / Gated Society', hi: 'अपार्टमेंट / गेटेड सोसाइटी' },
            validation_rules: { bhk_required: true, floor_required: true, builtup_area_required: true }
        }
    });
    await prisma.propertyType.createMany({
        data: [
            { name: 'Flat', slug: 'flat', sub_category_id: aptGated.id, display_order: 1, icon: 'building' },
            { name: 'Duplex', slug: 'duplex_apt', sub_category_id: aptGated.id, display_order: 2, icon: 'layers' },
            { name: 'Penthouse', slug: 'penthouse_apt', sub_category_id: aptGated.id, display_order: 3, icon: 'crown' },
        ]
    });

    // A.2 Independent House / Villa
    const indHouseVilla = await prisma.propertySubCategory.create({
        data: {
            name: 'Independent House / Villa', slug: 'independent_house_villa', category_id: resCat.id,
            icon: 'home', display_order: 2,
            labels_json: { en: 'Independent House / Villa', hi: 'स्वतंत्र मकान / विला' },
            validation_rules: { bhk_required: true, floor_required: false, builtup_area_required: true }
        }
    });
    await prisma.propertyType.createMany({
        data: [
            { name: 'Independent House', slug: 'independent_house', sub_category_id: indHouseVilla.id, display_order: 1, icon: 'home' },
            { name: 'Villa', slug: 'villa', sub_category_id: indHouseVilla.id, display_order: 2, icon: 'castle' },
            { name: 'Bungalow', slug: 'bungalow', sub_category_id: indHouseVilla.id, display_order: 3, icon: 'home' },
            { name: 'Row House', slug: 'row_house', sub_category_id: indHouseVilla.id, display_order: 4, icon: 'layout-grid' },
        ]
    });

    // A.3 Land / Plot
    const landPlot = await prisma.propertySubCategory.create({
        data: {
            name: 'Land / Plot', slug: 'land_plot', category_id: resCat.id,
            icon: 'map', display_order: 3,
            labels_json: { en: 'Land / Plot', hi: 'जमीन / प्लॉट' },
            validation_rules: { bhk_required: false, floor_required: false, builtup_area_required: false, plot_area_required: true }
        }
    });
    await prisma.propertyType.createMany({
        data: [
            { name: 'Residential Plot', slug: 'residential_plot', sub_category_id: landPlot.id, display_order: 1, icon: 'map-pin' },
            { name: 'Gated Community Plot', slug: 'gated_plot', sub_category_id: landPlot.id, display_order: 2, icon: 'shield' },
            { name: 'Corner Plot', slug: 'corner_plot', sub_category_id: landPlot.id, display_order: 3, icon: 'corner-up-right' },
        ]
    });

    // A.4 Builder Floor
    await prisma.propertySubCategory.create({
        data: {
            name: 'Builder Floor', slug: 'builder_floor', category_id: resCat.id,
            icon: 'building', display_order: 4,
            labels_json: { en: 'Builder Floor', hi: 'बिल्डर फ्लोर' },
            validation_rules: { bhk_required: true, floor_required: true, builtup_area_required: true }
        }
    });

    // A.5 Builder Flat Front Facing
    await prisma.propertySubCategory.create({
        data: {
            name: 'Builder Flat Front Facing', slug: 'builder_flat_front', category_id: resCat.id,
            icon: 'building-2', display_order: 5,
            labels_json: { en: 'Builder Flat Front Facing', hi: 'बिल्डर फ्लैट फ्रंट फेसिंग' },
            validation_rules: { bhk_required: true, floor_required: true, builtup_area_required: true }
        }
    });

    // A.5b Builder Flat Back Facing
    await prisma.propertySubCategory.create({
        data: {
            name: 'Builder Flat Back Facing', slug: 'builder_flat_back', category_id: resCat.id,
            icon: 'building-2', display_order: 6,
            labels_json: { en: 'Builder Flat Back Facing', hi: 'बिल्डर फ्लैट बैक फेसिंग' },
            validation_rules: { bhk_required: true, floor_required: true, builtup_area_required: true }
        }
    });

    // A.6 Farm House
    await prisma.propertySubCategory.create({
        data: {
            name: 'Farm House', slug: 'farm_house', category_id: resCat.id,
            icon: 'trees', display_order: 6,
            labels_json: { en: 'Farm House', hi: 'फार्म हाउस' },
            validation_rules: { bhk_required: false, floor_required: false, builtup_area_required: true, plot_area_required: true }
        }
    });

    // A.7 Serviced Apartments
    await prisma.propertySubCategory.create({
        data: {
            name: 'Serviced Apartments', slug: 'serviced_apartments', category_id: resCat.id,
            icon: 'concierge-bell', display_order: 7,
            labels_json: { en: 'Serviced Apartments', hi: 'सर्विस्ड अपार्टमेंट' },
            validation_rules: { bhk_required: true, floor_required: true, builtup_area_required: true }
        }
    });

    // A.8 Studio Apartment
    await prisma.propertySubCategory.create({
        data: {
            name: 'Studio Apartment', slug: 'studio_apartment', category_id: resCat.id,
            icon: 'layout', display_order: 8,
            labels_json: { en: 'Studio Apartment', hi: 'स्टूडियो अपार्टमेंट' },
            validation_rules: { bhk_required: false, floor_required: true, builtup_area_required: true }
        }
    });

    // ── B. COMMERCIAL ────────────────────────────────────
    const comCat = await prisma.propertyCategory.create({
        data: {
            name: 'Commercial', slug: 'commercial',
            icon: 'building-2', display_order: 2,
            description: 'Offices, retail, industrial, hospitality and healthcare spaces',
            labels_json: { en: 'Commercial', hi: 'व्यावसायिक' }
        }
    });

    // B.1 Office
    const office = await prisma.propertySubCategory.create({
        data: {
            name: 'Office', slug: 'office', category_id: comCat.id,
            icon: 'briefcase', display_order: 1,
            labels_json: { en: 'Office', hi: 'कार्यालय' },
            validation_rules: { bhk_required: false, floor_required: true, builtup_area_required: true }
        }
    });
    await prisma.propertyType.createMany({
        data: [
            { name: 'Corporate Office', slug: 'corporate_office', sub_category_id: office.id, display_order: 1, icon: 'building' },
            { name: 'IT Park', slug: 'it_park', sub_category_id: office.id, display_order: 2, icon: 'monitor' },
            { name: 'Coworking', slug: 'coworking', sub_category_id: office.id, display_order: 3, icon: 'users' },
            { name: 'Business Park', slug: 'business_park', sub_category_id: office.id, display_order: 4, icon: 'briefcase' },
        ]
    });

    // B.2 Industrial
    const industrial = await prisma.propertySubCategory.create({
        data: {
            name: 'Industrial', slug: 'industrial', category_id: comCat.id,
            icon: 'factory', display_order: 2,
            labels_json: { en: 'Industrial', hi: 'औद्योगिक' },
            validation_rules: { bhk_required: false, floor_required: false, builtup_area_required: true }
        }
    });
    await prisma.propertyType.createMany({
        data: [
            { name: 'Warehouse', slug: 'warehouse', sub_category_id: industrial.id, display_order: 1, icon: 'package' },
            { name: 'Logistics Park', slug: 'logistics_park', sub_category_id: industrial.id, display_order: 2, icon: 'truck' },
            { name: 'Factory', slug: 'factory', sub_category_id: industrial.id, display_order: 3, icon: 'factory' },
            { name: 'Cold Storage', slug: 'cold_storage', sub_category_id: industrial.id, display_order: 4, icon: 'thermometer' },
        ]
    });

    // B.3 Retail
    const retail = await prisma.propertySubCategory.create({
        data: {
            name: 'Retail', slug: 'retail', category_id: comCat.id,
            icon: 'shopping-bag', display_order: 3,
            labels_json: { en: 'Retail', hi: 'खुदरा' },
            validation_rules: { bhk_required: false, floor_required: true, builtup_area_required: true }
        }
    });
    await prisma.propertyType.createMany({
        data: [
            { name: 'Shop', slug: 'shop', sub_category_id: retail.id, display_order: 1, icon: 'store' },
            { name: 'Mall Unit', slug: 'mall_unit', sub_category_id: retail.id, display_order: 2, icon: 'shopping-cart' },
            { name: 'Showroom', slug: 'showroom', sub_category_id: retail.id, display_order: 3, icon: 'eye' },
            { name: 'Standalone Shop', slug: 'standalone_shop', sub_category_id: retail.id, display_order: 4, icon: 'store' },
        ]
    });

    // B.4 Hospitality
    const hospitality = await prisma.propertySubCategory.create({
        data: {
            name: 'Hospitality', slug: 'hospitality', category_id: comCat.id,
            icon: 'hotel', display_order: 4,
            labels_json: { en: 'Hospitality', hi: 'आतिथ्य' },
            validation_rules: { bhk_required: false, floor_required: false, builtup_area_required: true }
        }
    });
    await prisma.propertyType.createMany({
        data: [
            { name: 'Hotel', slug: 'hotel', sub_category_id: hospitality.id, display_order: 1, icon: 'hotel' },
            { name: 'Resort', slug: 'resort', sub_category_id: hospitality.id, display_order: 2, icon: 'palm-tree' },
            { name: 'Banquet', slug: 'banquet', sub_category_id: hospitality.id, display_order: 3, icon: 'party-popper' },
            { name: 'Restaurant', slug: 'restaurant', sub_category_id: hospitality.id, display_order: 4, icon: 'utensils' },
            { name: 'Kiosk', slug: 'kiosk', sub_category_id: hospitality.id, display_order: 5, icon: 'store' },
            { name: 'Multiplex', slug: 'multiplex', sub_category_id: hospitality.id, display_order: 6, icon: 'film' },
            { name: 'Food Court', slug: 'food_court', sub_category_id: hospitality.id, display_order: 7, icon: 'coffee' },
            { name: 'Serviced Apartment', slug: 'serviced_apartment', sub_category_id: hospitality.id, display_order: 8, icon: 'concierge-bell' },
        ]
    });

    // B.5 Healthcare
    const healthcare = await prisma.propertySubCategory.create({
        data: {
            name: 'Healthcare', slug: 'healthcare', category_id: comCat.id,
            icon: 'heart-pulse', display_order: 5,
            labels_json: { en: 'Healthcare', hi: 'स्वास्थ्य सेवा' },
            validation_rules: { bhk_required: false, floor_required: true, builtup_area_required: true }
        }
    });
    await prisma.propertyType.createMany({
        data: [
            { name: 'Hospital', slug: 'hospital', sub_category_id: healthcare.id, display_order: 1, icon: 'hospital' },
            { name: 'Clinic', slug: 'clinic', sub_category_id: healthcare.id, display_order: 2, icon: 'stethoscope' },
            { name: 'Diagnostic Center', slug: 'diagnostic_center', sub_category_id: healthcare.id, display_order: 3, icon: 'microscope' },
        ]
    });

    // B.6 Lands / Plots (Commercial)
    const comLand = await prisma.propertySubCategory.create({
        data: {
            name: 'Lands / Plots', slug: 'lands_plots', category_id: comCat.id,
            icon: 'map', display_order: 6,
            labels_json: { en: 'Lands / Plots', hi: 'भूमि / प्लॉट' },
            validation_rules: { bhk_required: false, floor_required: false, builtup_area_required: false, plot_area_required: true }
        }
    });
    await prisma.propertyType.createMany({
        data: [
            { name: 'Commercial Land', slug: 'commercial_land', sub_category_id: comLand.id, display_order: 1, icon: 'map-pin' },
            { name: 'Industrial Land', slug: 'industrial_land', sub_category_id: comLand.id, display_order: 2, icon: 'factory' },
            { name: 'SCO Plots', slug: 'sco_plots', sub_category_id: comLand.id, display_order: 3, icon: 'layout-grid' },
        ]
    });

    // B.7 School / College
    await prisma.propertySubCategory.create({
        data: {
            name: 'School / College', slug: 'school_college', category_id: comCat.id,
            icon: 'graduation-cap', display_order: 7,
            labels_json: { en: 'School / College', hi: 'स्कूल / कॉलेज' },
            validation_rules: { bhk_required: false, floor_required: false, builtup_area_required: true }
        }
    });

    // ── C. AGRICULTURAL LAND ──────────────────────────────
    await prisma.propertyCategory.create({
        data: {
            name: 'Agricultural Land', slug: 'agricultural_land',
            icon: 'tree-pine', display_order: 3,
            description: 'Agricultural and farm lands',
            labels_json: { en: 'Agricultural Land', hi: 'कृषि भूमि' }
        }
    });

    console.log('Full Classification Tree Seeded Successfully!');
    console.log('Categories: 3 (Residential, Commercial, Agricultural Land)');
    console.log('Sub-categories: 15');
    console.log('Configurations: 15');
    console.log('Usage Types: 4');
    console.log('Investment Types: 4');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
