
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('TEST SCRIPT STARTING');
    try {
        const count = await prisma.propertyConfiguration.count();
        console.log('Existing configurations count:', count);

        const config = await prisma.propertyConfiguration.create({
            data: {
                name: 'TEST CONFIG',
                slug: 'test-config-' + Date.now(),
                tenant_id: 'default-tenant'
            }
        });
        console.log('Created test config:', config);
    } catch (e) {
        console.error('TEST ERROR:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
