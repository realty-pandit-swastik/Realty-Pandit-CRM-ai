
import prisma from '../db';

async function checkLog() {
    const log = await prisma.interaction.findFirst({
        where: {
            event_type: 'call_initiate'
        },
        orderBy: { created_at: 'desc' }
    });

    if (log) {
        console.log('✅ Found Log:', log.content);
        process.exit(0);
    } else {
        console.log('❌ No call log found.');
        process.exit(1);
    }
}

checkLog();
