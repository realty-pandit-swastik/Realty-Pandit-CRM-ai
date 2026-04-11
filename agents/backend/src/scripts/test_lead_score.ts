
import { LeadScoreService } from '../services/lead_score';
import prisma from '../db';

async function main() {
    console.log('--- TEST: Lead Scoring & No-Show ---');

    const leadScoreService = new LeadScoreService();
    // Use a fixed phone number for testing
    const TEST_PHONE = '+919999988888';
    const TENANT_ID = 'default-tenant'; // Assumption

    try {
        // 1. Setup: Ensure Contact Exists
        console.log('1. Creating/Resetting Contact...');
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) throw new Error("No Tenant Found");

        await prisma.contact.upsert({
            where: { phone_number: TEST_PHONE },
            update: { lead_status: 'cold' },
            create: {
                phone_number: TEST_PHONE,
                tenant_id: tenant.id,
                name: 'Test User',
                lead_status: 'cold'
            }
        });

        // Reset Score
        await prisma.leadScore.deleteMany({ where: { phone_number: TEST_PHONE } });
        await leadScoreService.initScore(TEST_PHONE, tenant.id);

        // 2. Simulate Engagement (Message Received)
        console.log('2. Simulating Incoming Message (+10 Engagement)...');
        await leadScoreService.updateScore(TEST_PHONE, 'engagement', 10);

        let score = await prisma.leadScore.findUnique({ where: { phone_number: TEST_PHONE } });
        console.log(`Score after Msg: ${score?.total_score} (Expected ~10)`);

        // 3. Simulate High Intent (Site Visit Request)
        console.log('3. Simulating Site Visit Request (+15 Intent)...');
        await leadScoreService.updateScore(TEST_PHONE, 'intent', 15);

        score = await prisma.leadScore.findUnique({ where: { phone_number: TEST_PHONE } });
        console.log(`Score after Intent: ${score?.total_score} (Expected ~25)`);

        // 4. Simulate NO-SHOW (Reliability -20)
        console.log('4. Simulating NO-SHOW Penalty (-20 Reliability)...');
        await leadScoreService.handleNoShow(TEST_PHONE);

        score = await prisma.leadScore.findUnique({ where: { phone_number: TEST_PHONE } });
        console.log(`Score after No-Show: ${score?.total_score} (Expected ~5)`);
        console.log(`No-Show Count: ${score?.no_show_count} (Expected 1)`);

        console.log('--- TEST COMPLETED ---');

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
