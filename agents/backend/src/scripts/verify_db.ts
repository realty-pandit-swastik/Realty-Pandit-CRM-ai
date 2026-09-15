import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

console.log('DB URL loaded:', process.env.DATABASE_URL ? 'YES' : 'NO');
// console.log('DB URL:', process.env.DATABASE_URL); // CAUTION: Logs password

async function main() {
    console.log('Verifying Database State...');

    const contacts = await prisma.contact.findMany({
        include: { interactions: true, voice_calls: true }
    });

    const voiceCalls = await prisma.voiceCall.findMany();
    console.log(`Found ${voiceCalls.length} Voice Calls:`);
    console.log(JSON.stringify(voiceCalls, null, 2));

    console.log(`Found ${contacts.length} Contact(s):`);
    console.log(JSON.stringify(contacts, null, 2));

    if (contacts.length > 0 && contacts[0].interactions.length > 0) {
        console.log('✅ TEST PASSED: Contact and Interaction created.');
    } else {
        console.error('❌ TEST FAILED: Data missing.');
        process.exit(1);
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
