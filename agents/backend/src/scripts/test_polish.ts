
import prisma from '../db';
import { DecisionEngine } from '../services/decision_engine';
import { VoiceService } from '../services/voice';

const de = new DecisionEngine();
const vs = new VoiceService();

async function testPolish() {
    console.log('🧪 Testing System Polish Features...');

    // 1. Smart Timing Test
    console.log('\n[Test 1] Smart Timing (Missed Call)');
    const testPhone = "9999999999";
    // Ensure contact exists
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) return console.error("No tenant");

    await prisma.contact.upsert({
        where: { phone_number: testPhone },
        update: { next_action_at: null, next_action_type: null },
        create: { phone_number: testPhone, tenant_id: tenant.id }
    });

    console.log('Triggering handleMissedCall...');
    await de.handleMissedCall("contact_id", testPhone);

    const contact = await prisma.contact.findUnique({ where: { phone_number: testPhone } });
    if (contact?.next_action_at && contact.next_action_at > new Date()) {
        console.log('✅ Smart Timing Pass: Next action scheduled in future.');
        console.log(`   Scheduled At: ${contact.next_action_at}`);
        console.log(`   Action Type: ${contact.next_action_type}`);
    } else {
        console.error('❌ Smart Timing Fail: Action not scheduled correctly.');
    }

    // 2. Spam Prevention Test
    console.log('\n[Test 2] Voice Spam Prevention');
    // Create a mock recent call
    await prisma.voiceCall.create({
        data: {
            tenant_id: tenant.id,
            phone_number: testPhone,
            direction: 'outbound',
            call_status: 'completed',
            started_at: new Date()
        }
    });

    console.log('Attempting Outbound Call (Should be blocked)...');
    await vs.makeOutboundCall(testPhone, "Hello");
    console.log('✅ Check logs above for "Spam Prevention" message.');
}

testPolish();
