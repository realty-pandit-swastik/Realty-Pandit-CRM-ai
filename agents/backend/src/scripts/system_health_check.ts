
import prisma from '../db';

async function main() {
    console.log('🏥 Reality Pandit System Health Check 🏥');
    console.log('=======================================');

    try {
        // 1. Connectivity
        await prisma.$connect();
        console.log('✅ Database Connection: ACTIVE');

        // 2. Tenant Status
        const tenant = await prisma.tenant.findFirst();
        console.log(`🏢 Tenant: ${tenant ? tenant.business_name : 'NOT FOUND ❌'}`);

        // 3. SSOT Stats
        const contactCount = await prisma.contact.count();
        const buyers = await prisma.contact.count({ where: { intent: 'buy' } });
        const sellers = await prisma.contact.count({ where: { intent: 'sell' } });
        const leadScores = await prisma.leadScore.count();

        console.log('\n📊 SSOT Statistics:');
        console.log(`   - Total Contacts: ${contactCount}`);
        console.log(`   - Potential Buyers: ${buyers}`);
        console.log(`   - Potential Sellers: ${sellers}`);
        console.log(`   - Lead Scores Tracked: ${leadScores}`);

        // 4. Interaction Activity
        const interactions = await prisma.interaction.count();
        const voiceCalls = await prisma.voiceCall.count();
        const recentLogs = await prisma.interaction.findMany({
            take: 3,
            orderBy: { created_at: 'desc' },
            select: { channel: true, direction: true, event_type: true, created_at: true }
        });

        console.log('\n💬 Communication Activity:');
        console.log(`   - Total Interactions Logged: ${interactions}`);
        console.log(`   - Voice Calls Logged: ${voiceCalls}`);
        console.log('   - Recent Events:');
        recentLogs.forEach(log => {
            console.log(`     [${log.created_at.toISOString()}] ${log.direction} ${log.channel} ${log.event_type}`);
        });

        // 5. Scheduler Health (Task Queue)
        const pendingTasks = await prisma.contact.count({
            where: { next_action_at: { lte: new Date() } }
        });
        console.log(`\n⏰ Scheduler Status:`);
        console.log(`   - Overdue/Pending Actions: ${pendingTasks} (Should be 0 if Scheduler is running)`);

        console.log('\n=======================================');
        console.log('✅ SYSTEM STATUS: OPERATIONAL');

    } catch (error) {
        console.error('\n❌ SYSTEM FAILURE:', error);
        process.exit(1);
    }
}

main()
    .then(async () => { await prisma.$disconnect(); })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); });
