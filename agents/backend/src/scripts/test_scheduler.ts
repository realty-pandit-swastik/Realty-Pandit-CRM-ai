
import prisma from '../db';
import { DecisionEngine } from '../services/decision_engine';

const decisionEngine = new DecisionEngine();

async function main() {
    console.log('Testing Scheduler & Decision Engine...');

    // 1. Create a mock triggered contact
    const phoneNumber = '919999999999';
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error('No tenant found');

    const contact = await prisma.contact.upsert({
        where: { phone_number: phoneNumber },
        update: { next_action_at: new Date(Date.now() - 10000) }, // 10 seconds ago (Past)
        create: {
            phone_number: phoneNumber,
            tenant_id: tenant.id,
            next_action_at: new Date(Date.now() - 10000)
        }
    });

    console.log(`Set next_action_at for ${phoneNumber} to PAST.`);

    // 2. Manually trigger Decision Engine (simulating Scheduler)
    console.log('Simulating Scheduler Execution...');
    await decisionEngine.executeNextAction(contact);

    // 3. Check for cleanup (In a real scheduler this is done by the loop, here we verify logic)
    console.log('✅ DecisionEngine executed. Check console for "Executing next action" log.');

    // 4. Test Missed Call Fallback
    console.log('Testing Missed Call Fallback...');
    await decisionEngine.handleMissedCall(contact.phone_number, contact.phone_number);

    // 5. Verify Interaction Log
    const interactions = await prisma.interaction.findMany({
        where: { phone_number: phoneNumber, channel: 'whatsapp' },
        orderBy: { created_at: 'desc' },
        take: 1
    });

    if (interactions.length > 0) {
        console.log('✅ Fallback Interaction Logged:', interactions[0].content);
    } else {
        console.error('❌ No Fallback Interaction found.');
    }
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
