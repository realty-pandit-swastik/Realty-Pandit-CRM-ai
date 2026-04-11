
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding Demo Buyer...');

    // Get Tenant ID
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error('No tenant found. Run interactions or seed tenant first.');
    const tenantId = tenant.id;

    const phone = '919876543211';

    // Upsert to ensure idempotency
    const buyer = await prisma.contact.upsert({
        where: { phone_number: phone },
        update: { intent: 'buy', lead_status: 'warm' },
        create: {
            phone_number: phone,
            tenant_id: tenantId,
            name: 'Demo Buyer',
            intent: 'buy',
            lead_status: 'warm',
            source: 'demo_seed'
        }
    });

    // Also initialize lead score
    await prisma.leadScore.upsert({
        where: { phone_number: phone },
        update: {},
        create: {
            phone_number: phone,
            tenant_id: tenantId,
            total_score: 50,
            intent_score: 30,
            engagement_score: 20,
            reliability_score: 0
        }
    });

    console.log(`✅ Created Buyer: ${buyer.phone_number}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
