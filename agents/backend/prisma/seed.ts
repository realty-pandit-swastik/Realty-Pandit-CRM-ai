import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting database seed...');

    // 1. Create Default Tenant
    const tenant = await prisma.tenant.upsert({
        where: { id: 'default-tenant' },
        update: {},
        create: {
            id: 'default-tenant',
            business_name: 'Realty Pandit Head Office',
            owner_name: 'Sunny Sharma',
            primary_phone: '+919999999999',
            status: 'active',
            timezone: 'Asia/Kolkata'
        },
    });
    console.log('✅ Tenant seeded:', tenant.id);

    // 2. Property Configurations
    console.log('📋 Seeding configurations...');
    const configurations = [
        { name: 'Studio', slug: 'studio', icon: 'studio', display_order: 1 },
        { name: '1 BHK', slug: '1-bhk', icon: 'bed-single', display_order: 2 },
        { name: '2 BHK', slug: '2-bhk', icon: 'bed-double', display_order: 3 },
        { name: '3 BHK', slug: '3-bhk', icon: 'bed', display_order: 4 },
        { name: '4 BHK', slug: '4-bhk', icon: 'bed', display_order: 5 },
        { name: '5+ BHK', slug: '5-plus-bhk', icon: 'bed', display_order: 6 },
        { name: 'Furnished Office', slug: 'furnished-office', icon: 'briefcase', display_order: 7 },
        { name: 'Bare Shell', slug: 'bare-shell', icon: 'building', display_order: 8 },
        { name: 'Serviced Office', slug: 'serviced-office', icon: 'office', display_order: 9 },
    ];

    for (const config of configurations) {
        await prisma.propertyConfiguration.upsert({
            where: { slug: config.slug },
            update: { name: config.name, icon: config.icon, display_order: config.display_order },
            create: {
                name: config.name,
                slug: config.slug,
                icon: config.icon,
                display_order: config.display_order,
                is_active: true,
                labels_json: { en: config.name, hi: config.name }
            }
        });
    }
    console.log('✅ Configurations seeded');

    // 3. Usage Types
    console.log('🏠 Seeding usage types...');
    const usageTypes = [
        { name: 'Self-use', slug: 'self-use', icon: 'home', display_order: 1 },
        { name: 'Investment', slug: 'investment', icon: 'trending-up', display_order: 2 },
        { name: 'Rental Income', slug: 'rental-income', icon: 'dollar-sign', display_order: 3 },
    ];

    for (const usage of usageTypes) {
        await prisma.usageType.upsert({
            where: { slug: usage.slug },
            update: { name: usage.name, icon: usage.icon, display_order: usage.display_order },
            create: {
                name: usage.name,
                slug: usage.slug,
                icon: usage.icon,
                display_order: usage.display_order,
                is_active: true,
                labels_json: { en: usage.name, hi: usage.name }
            }
        });
    }
    console.log('✅ Usage types seeded');

    // 4. Investment Types
    console.log('💰 Seeding investment types...');
    const investmentTypes = [
        { name: 'Pre-launch', slug: 'pre-launch', icon: 'clock', display_order: 1 },
        { name: 'Under Construction', slug: 'under-construction', icon: 'construction', display_order: 2 },
        { name: 'Ready to Move', slug: 'ready-to-move', icon: 'key', display_order: 3 },
    ];

    for (const investment of investmentTypes) {
        await prisma.investmentType.upsert({
            where: { slug: investment.slug },
            update: { name: investment.name, icon: investment.icon, display_order: investment.display_order },
            create: {
                name: investment.name,
                slug: investment.slug,
                icon: investment.icon,
                display_order: investment.display_order,
                is_active: true,
                labels_json: { en: investment.name, hi: investment.name }
            }
        });
    }
    console.log('✅ Investment types seeded');

    // 5. Complete Property Classification Hierarchy
    console.log('🏗️  Seeding classification hierarchy...');
    const hierarchy = [
        {
            name: 'Residential',
            slug: 'residential',
            icon: 'home',
            description: 'Residential properties for living',
            display_order: 1,
            is_active: true,
            sub_categories: [
                {
                    name: 'Individual Housing',
                    slug: 'individual_housing',
                    icon: 'house',
                    display_order: 1,
                    validation_rules: { bhk_required: false, floor_required: false, builtup_area_required: true },
                    types: [
                        { name: 'Independent House', slug: 'independent_house', icon: 'house', display_order: 1 },
                        { name: 'Villa', slug: 'villa', icon: 'home-modern', display_order: 2 },
                        { name: 'Row House', slug: 'row_house', icon: 'home-group', display_order: 3 },
                        { name: 'Bungalow', slug: 'bungalow', icon: 'home-city', display_order: 4 },
                        { name: 'Farm House', slug: 'farm_house', icon: 'tractor', display_order: 5 }
                    ]
                },
                {
                    name: 'Apartment',
                    slug: 'apartment',
                    icon: 'building',
                    display_order: 2,
                    validation_rules: { bhk_required: true, floor_required: true, builtup_area_required: true },
                    types: [
                        { name: 'Flat', slug: 'flat', icon: 'door-closed', display_order: 1 },
                        { name: 'Studio Apartment', slug: 'studio_apartment', icon: 'home-simple', display_order: 2 },
                        { name: 'Service Apartment', slug: 'service_apartment', icon: 'concierge-bell', display_order: 3 },
                        { name: 'Penthouse', slug: 'penthouse', icon: 'crown', display_order: 4 },
                        { name: 'Duplex', slug: 'duplex', icon: 'stairs', display_order: 5 },
                        { name: 'Builder Floor', slug: 'builder_floor', icon: 'building-columns', display_order: 6 },
                        { name: 'Gated Community Apartment', slug: 'gated_community', icon: 'shield-check', display_order: 7 }
                    ]
                },
                {
                    name: 'Plot / Land',
                    slug: 'plot_land',
                    icon: 'map',
                    display_order: 3,
                    validation_rules: { bhk_required: false, floor_required: false, plot_area_required: true },
                    types: [
                        { name: 'Residential Plot', slug: 'residential_plot', icon: 'square-dashed', display_order: 1 },
                        { name: 'Farm Land', slug: 'farm_land', icon: 'wheat', display_order: 2 },
                        { name: 'Agricultural Land', slug: 'agricultural_land', icon: 'leaf', display_order: 3 },
                        { name: 'Non-Agricultural Land', slug: 'non_agricultural_land', icon: 'land-plot', display_order: 4 }
                    ]
                },
                {
                    name: 'Shared Living',
                    slug: 'shared_living',
                    icon: 'users',
                    display_order: 4,
                    validation_rules: { bhk_required: false, floor_required: false },
                    types: [
                        { name: 'PG (Paying Guest)', slug: 'pg', icon: 'bed-single', display_order: 1 },
                        { name: 'Hostel', slug: 'hostel', icon: 'building-user', display_order: 2 },
                        { name: 'Co-living Space', slug: 'coliving', icon: 'users-round', display_order: 3 },
                        { name: 'Room/Flatmate', slug: 'flatmate', icon: 'door-open', display_order: 4 }
                    ]
                }
            ]
        },
        {
            name: 'Commercial',
            slug: 'commercial',
            icon: 'briefcase',
            description: 'Commercial properties for business',
            display_order: 2,
            is_active: true,
            sub_categories: [
                {
                    name: 'Office',
                    slug: 'office',
                    icon: 'briefcase',
                    display_order: 1,
                    validation_rules: { bhk_required: false, floor_required: true, builtup_area_required: true },
                    types: [
                        { name: 'Commercial Office Space', slug: 'commercial_office_space', icon: 'office-building', display_order: 1 },
                        { name: 'Office in IT Park/SEZ', slug: 'office_it_park_sez', icon: 'laptop-code', display_order: 2 },
                        { name: 'Co-working Space', slug: 'coworking_space', icon: 'users-cog', display_order: 3 },
                        { name: 'Business Center', slug: 'business_center', icon: 'building-shield', display_order: 4 }
                    ]
                },
                {
                    name: 'Retail',
                    slug: 'retail',
                    icon: 'shop',
                    display_order: 2,
                    validation_rules: { bhk_required: false, floor_required: false, builtup_area_required: true },
                    types: [
                        { name: 'Retail Shop', slug: 'retail_shop', icon: 'store', display_order: 1 },
                        { name: 'Showroom', slug: 'showroom', icon: 'warehouse', display_order: 2 },
                        { name: 'Mall Space', slug: 'mall_space', icon: 'shopping-bag', display_order: 3 },
                        { name: 'Commercial Building', slug: 'commercial_building', icon: 'building', display_order: 4 }
                    ]
                },
                {
                    name: 'Industrial',
                    slug: 'industrial',
                    icon: 'factory',
                    display_order: 3,
                    validation_rules: { bhk_required: false, floor_required: false, builtup_area_required: true },
                    types: [
                        { name: 'Warehouse', slug: 'warehouse', icon: 'boxes-stacked', display_order: 1 },
                        { name: 'Godown', slug: 'godown', icon: 'warehouse', display_order: 2 },
                        { name: 'Cold Storage', slug: 'cold_storage', icon: 'snowflake', display_order: 3 },
                        { name: 'Factory', slug: 'factory', icon: 'industry', display_order: 4 }
                    ]
                },
                {
                    name: 'Hospitality',
                    slug: 'hospitality',
                    icon: 'hotel',
                    display_order: 4,
                    validation_rules: { bhk_required: false, floor_required: false },
                    types: [
                        { name: 'Hotel', slug: 'hotel', icon: 'hotel', display_order: 1 },
                        { name: 'Restaurant', slug: 'restaurant', icon: 'utensils', display_order: 2 },
                        { name: 'Guest House', slug: 'guest_house', icon: 'bed-double', display_order: 3 },
                        { name: 'Banquet Hall', slug: 'banquet_hall', icon: 'champagne-glasses', display_order: 4 }
                    ]
                },
                {
                    name: 'Healthcare',
                    slug: 'healthcare',
                    icon: 'hospital',
                    display_order: 5,
                    validation_rules: { bhk_required: false, floor_required: false, builtup_area_required: true },
                    types: [
                        { name: 'Hospital', slug: 'hospital', icon: 'hospital', display_order: 1 },
                        { name: 'Clinic', slug: 'clinic', icon: 'stethoscope', display_order: 2 },
                        { name: 'Nursing Home', slug: 'nursing_home', icon: 'bed-pulse', display_order: 3 }
                    ]
                },
                {
                    name: 'Commercial Land',
                    slug: 'commercial_land',
                    icon: 'map-pin',
                    display_order: 6,
                    validation_rules: { bhk_required: false, floor_required: false, plot_area_required: true },
                    types: [
                        { name: 'Commercial Land', slug: 'commercial_land_plot', icon: 'square', display_order: 1 },
                        { name: 'Industrial Land', slug: 'industrial_land', icon: 'industry', display_order: 2 },
                        { name: 'IT/SEZ Land', slug: 'it_sez_land', icon: 'microchip', display_order: 3 }
                    ]
                }
            ]
        },
        {
            name: 'Agricultural Land',
            slug: 'agricultural_land',
            icon: 'wheat',
            description: 'Agricultural and farm land properties',
            display_order: 3,
            is_active: true,
            sub_categories: [
                {
                    name: 'Farm Land',
                    slug: 'farm_land',
                    icon: 'tractor',
                    display_order: 1,
                    validation_rules: { bhk_required: false, floor_required: false, plot_area_required: true },
                    types: [
                        { name: 'Agricultural Farm Land', slug: 'agricultural_farm_land', icon: 'wheat', display_order: 1 },
                        { name: 'Dairy Farm', slug: 'dairy_farm', icon: 'milk', display_order: 2 },
                        { name: 'Poultry Farm', slug: 'poultry_farm', icon: 'egg', display_order: 3 },
                        { name: 'Orchard / Fruit Farm', slug: 'orchard_fruit_farm', icon: 'apple-whole', display_order: 4 }
                    ]
                },
                {
                    name: 'Agricultural Plot',
                    slug: 'agricultural_plot',
                    icon: 'sprout',
                    display_order: 2,
                    validation_rules: { bhk_required: false, floor_required: false, plot_area_required: true },
                    types: [
                        { name: 'Agricultural Land Plot', slug: 'agricultural_land_plot', icon: 'leaf', display_order: 1 },
                        { name: 'Farmhouse Land', slug: 'farmhouse_land', icon: 'trees', display_order: 2 }
                    ]
                }
            ]
        },
        {
            name: 'Institutional',
            slug: 'institutional',
            icon: 'school',
            description: 'Educational and institutional properties',
            display_order: 4,
            is_active: false,
            sub_categories: [
                {
                    name: 'Educational',
                    slug: 'educational',
                    icon: 'graduation-cap',
                    display_order: 1,
                    validation_rules: { bhk_required: false, floor_required: false, builtup_area_required: true },
                    types: [
                        { name: 'School', slug: 'school', icon: 'school', display_order: 1 },
                        { name: 'College', slug: 'college', icon: 'building-columns', display_order: 2 },
                        { name: 'Training Center', slug: 'training_center', icon: 'chalkboard-user', display_order: 3 }
                    ]
                }
            ]
        },
        {
            name: 'Mixed Use',
            slug: 'mixed_use',
            icon: 'buildings',
            description: 'Properties with residential and commercial usage',
            display_order: 5,
            is_active: false,
            sub_categories: [
                {
                    name: 'Mixed Development',
                    slug: 'mixed_development',
                    icon: 'layer-group',
                    display_order: 1,
                    validation_rules: { bhk_required: false, floor_required: false },
                    types: [
                        { name: 'Residential + Commercial', slug: 'residential_commercial', icon: 'building-circle-check', display_order: 1 },
                        { name: 'Township', slug: 'township', icon: 'city', display_order: 2 }
                    ]
                }
            ]
        }
    ];

    // Seed hierarchy
    for (const cat of hierarchy) {
        const category = await prisma.propertyCategory.upsert({
            where: { slug: cat.slug },
            update: {
                name: cat.name,
                icon: cat.icon,
                description: cat.description,
                display_order: cat.display_order,
                is_active: cat.is_active ?? true
            },
            create: {
                name: cat.name,
                slug: cat.slug,
                icon: cat.icon,
                description: cat.description,
                display_order: cat.display_order,
                is_active: cat.is_active ?? true,
                labels_json: { en: cat.name, hi: cat.name }
            }
        });

        for (const sub of cat.sub_categories) {
            const subCategory = await prisma.propertySubCategory.upsert({
                where: {
                    category_id_slug: {
                        category_id: category.id,
                        slug: sub.slug
                    }
                },
                update: {
                    name: sub.name,
                    icon: sub.icon,
                    display_order: sub.display_order,
                    validation_rules: sub.validation_rules
                },
                create: {
                    name: sub.name,
                    slug: sub.slug,
                    category_id: category.id,
                    icon: sub.icon,
                    display_order: sub.display_order,
                    is_active: true,
                    labels_json: { en: sub.name, hi: sub.name },
                    validation_rules: sub.validation_rules
                }
            });

            for (const type of sub.types) {
                await prisma.propertyType.upsert({
                    where: {
                        sub_category_id_slug: {
                            sub_category_id: subCategory.id,
                            slug: type.slug
                        }
                    },
                    update: {
                        name: type.name,
                        icon: type.icon,
                        display_order: type.display_order
                    },
                    create: {
                        name: type.name,
                        slug: type.slug,
                        sub_category_id: subCategory.id,
                        icon: type.icon,
                        display_order: type.display_order,
                        is_active: true,
                        labels_json: { en: type.name, hi: type.name }
                    }
                });
            }
        }
    }
    console.log('✅ Classification hierarchy seeded');

    console.log('🎉 Seeding complete!');
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error('❌ Seeding failed:', e);
        await prisma.$disconnect();
        process.exit(1);
    });
