
import { DecisionEngine } from '../services/decision_engine';
import prisma from '../db';

async function testOutbound() {
    console.log('🧪 Testing Outbound Call Flow...');

    // 1. Ensure Tenant
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error("No Tenant");

    const engine = new DecisionEngine();
    const testPhone = "919999999999";

    // 2. Trigger Call
    console.log(`[Test] Triggering call to ${testPhone}...`);
    await engine.triggerOutboundCall(testPhone, "New Lead Followup");

    // 3. Verify Log
    // Give a sec for async logs
    await new Promise(r => setTimeout(r, 1000));

    const log = await prisma.interaction.findFirst({
        where: {
            phone_number: testPhone,
            event_type: 'call_initiate'
        },
        orderBy: { created_at: 'desc' }
    });

    if (log) {
        console.log('✅ Outbound Call Logged Successfully:', log.content);
    } else {
        console.error('❌ Failed to find Interaction log.');
    }
}

testOutbound()
    .catch(console.error)
    .finally(() => process.exit(0));
