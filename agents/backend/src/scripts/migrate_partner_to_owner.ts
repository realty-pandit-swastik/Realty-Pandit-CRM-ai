/**
 * Data Migration Script: PartnerAgent → Owner + Subscription
 *
 * This script migrates existing PartnerAgent records to the new unified Owner model.
 *
 * Migration Steps:
 * 1. For each PartnerAgent, create Owner record (scope=EXTERNAL, externalType based on data)
 * 2. Create corresponding Subscription record (map package_type to planType)
 * 3. Update Inventory records (agent_owner_id → owner_id)
 * 4. Migrate Commission records (agent_id → owner_id)
 *
 * IMPORTANT: Run this ONCE during deployment. Idempotent - can be re-run safely.
 */

import { PrismaClient, OwnerScope, ExternalOwnerType, OwnerStatus, PlanType, SubscriptionStatus } from '@prisma/client';

const prisma = new PrismaClient();

interface MigrationStats {
    partnersProcessed: number;
    ownersCreated: number;
    subscriptionsCreated: number;
    inventoryUpdated: number;
    commissionsUpdated: number;
    errors: string[];
}

/**
 * Map PartnerAgent.package_type to new PlanType enum
 */
function mapPackageToPlanType(packageType: string): PlanType {
    switch (packageType) {
        case 'FREE':
            return PlanType.FREE;
        case 'PRO':
            return PlanType.PRO;
        case 'ADVANCE_PRO':
            return PlanType.PREMIUM;
        default:
            console.warn(`Unknown package type: ${packageType}, defaulting to FREE`);
            return PlanType.FREE;
    }
}

/**
 * Determine ExternalOwnerType based on PartnerAgent data
 * Heuristic: Check if they have multiple properties or company info
 */
function determineExternalType(agent: any): ExternalOwnerType {
    // If they have a company name or GST, likely a PROPERTY_AGENT
    if (agent.company_name || agent.gst_number) {
        return ExternalOwnerType.PROPERTY_AGENT;
    }

    // If they're an individual, use INDIVIDUAL_AGENT
    // Note: REAL_ESTATE_BUILDER will be assigned manually or via separate onboarding
    return ExternalOwnerType.INDIVIDUAL_AGENT;
}

/**
 * Calculate priority score based on package and performance
 */
function calculatePriorityScore(packageType: string, inventoryCount: number): number {
    let baseScore = 50; // Default for FREE

    switch (packageType) {
        case 'PRO':
            baseScore = 70;
            break;
        case 'ADVANCE_PRO':
            baseScore = 90;
            break;
    }

    // Bonus points for active inventory (max +10)
    const inventoryBonus = Math.min(inventoryCount, 10);

    return baseScore + inventoryBonus;
}

/**
 * Main migration function
 */
async function migratePartnerAgentsToOwners(): Promise<MigrationStats> {
    const stats: MigrationStats = {
        partnersProcessed: 0,
        ownersCreated: 0,
        subscriptionsCreated: 0,
        inventoryUpdated: 0,
        commissionsUpdated: 0,
        errors: []
    };

    try {
        console.log('🚀 Starting PartnerAgent → Owner migration...\n');

        // Fetch all PartnerAgent records with their inventory count
        const partnerAgents = await prisma.partnerAgent.findMany({
            include: {
                contact: true,
                _count: {
                    select: {
                        inventory: true
                    }
                }
            }
        });

        console.log(`Found ${partnerAgents.length} PartnerAgent records to migrate\n`);

        for (const agent of partnerAgents) {
            try {
                stats.partnersProcessed++;

                console.log(`[${stats.partnersProcessed}/${partnerAgents.length}] Processing: ${agent.contact.name} (${agent.phone_number})`);

                // Check if Owner already exists (idempotent)
                const existingOwner = await prisma.owner.findUnique({
                    where: { contact_phone: agent.phone_number }
                });

                if (existingOwner) {
                    console.log(`  ⏭️  Owner already exists, skipping...`);
                    continue;
                }

                // Determine external type and priority
                const externalType = determineExternalType(agent);
                const priorityScore = calculatePriorityScore(agent.package_type, agent._count.inventory);

                // Create Owner record
                const owner = await prisma.owner.create({
                    data: {
                        scope: OwnerScope.EXTERNAL,
                        externalType: externalType,
                        contact_phone: agent.phone_number,
                        status: agent.status === 'ACTIVE' ? OwnerStatus.ACTIVE :
                                agent.status === 'SUSPENDED' ? OwnerStatus.SUSPENDED :
                                OwnerStatus.PENDING_VERIFICATION,
                        listing_limit: agent.listing_limit,
                        priority_score: priorityScore
                    }
                });

                stats.ownersCreated++;
                console.log(`  ✅ Created Owner: ${owner.id} (${externalType})`);

                // Create Subscription record
                const planType = mapPackageToPlanType(agent.package_type);

                const subscription = await prisma.subscription.create({
                    data: {
                        owner_id: owner.id,
                        plan_type: planType,
                        status: agent.subscription_end_date && agent.subscription_end_date > new Date()
                            ? SubscriptionStatus.ACTIVE
                            : SubscriptionStatus.EXPIRED,
                        start_date: agent.subscription_start_date,
                        end_date: agent.subscription_end_date,
                        auto_renew: false // Default, can be updated later
                    }
                });

                stats.subscriptionsCreated++;
                console.log(`  ✅ Created Subscription: ${subscription.id} (${planType})`);

                // Update Inventory records (agent_owner_id → owner_id)
                // IMPORTANT: This requires the schema to be migrated first (TASK-100)
                const inventoryUpdateResult = await prisma.$executeRaw`
                    UPDATE inventory
                    SET owner_id = ${owner.id}
                    WHERE agent_owner_id = ${agent.id}
                `;

                if (inventoryUpdateResult > 0) {
                    stats.inventoryUpdated += inventoryUpdateResult;
                    console.log(`  ✅ Updated ${inventoryUpdateResult} Inventory records`);
                }

                // Update Commission records (agent_id → owner_id)
                const commissionUpdateResult = await prisma.$executeRaw`
                    UPDATE commissions
                    SET owner_id = ${owner.id}
                    WHERE agent_id = ${agent.id}
                `;

                if (commissionUpdateResult > 0) {
                    stats.commissionsUpdated += commissionUpdateResult;
                    console.log(`  ✅ Updated ${commissionUpdateResult} Commission records`);
                }

            } catch (error) {
                const errorMsg = `Error migrating ${agent.phone_number}: ${(error as Error).message}`;
                console.error(`  ❌ ${errorMsg}`);
                stats.errors.push(errorMsg);
            }
        }

        console.log('\n📊 Migration Statistics:');
        console.log(`  Partners Processed: ${stats.partnersProcessed}`);
        console.log(`  Owners Created: ${stats.ownersCreated}`);
        console.log(`  Subscriptions Created: ${stats.subscriptionsCreated}`);
        console.log(`  Inventory Updated: ${stats.inventoryUpdated}`);
        console.log(`  Commissions Updated: ${stats.commissionsUpdated}`);
        console.log(`  Errors: ${stats.errors.length}`);

        if (stats.errors.length > 0) {
            console.log('\n❌ Errors encountered:');
            stats.errors.forEach(err => console.log(`  - ${err}`));
        }

        console.log('\n✅ Migration completed!');

    } catch (error) {
        console.error('Fatal migration error:', error);
        throw error;
    }

    return stats;
}

/**
 * Rollback function (in case migration needs to be reversed)
 * WARNING: This deletes Owner and Subscription records created by this migration
 */
async function rollbackMigration(): Promise<void> {
    console.log('⚠️  Rolling back migration...');

    try {
        // Delete all EXTERNAL owners (keeps INTERNAL owners safe)
        const result = await prisma.owner.deleteMany({
            where: { scope: OwnerScope.EXTERNAL }
        });

        console.log(`✅ Rolled back ${result.count} Owner records (Subscriptions auto-deleted via cascade)`);
    } catch (error) {
        console.error('Rollback failed:', error);
        throw error;
    }
}

/**
 * CLI Execution
 */
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    try {
        if (command === 'rollback') {
            await rollbackMigration();
        } else {
            const stats = await migratePartnerAgentsToOwners();

            // Exit with error code if there were errors
            if (stats.errors.length > 0) {
                process.exit(1);
            }
        }
    } catch (error) {
        console.error('Migration script failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}

export { migratePartnerAgentsToOwners, rollbackMigration };
