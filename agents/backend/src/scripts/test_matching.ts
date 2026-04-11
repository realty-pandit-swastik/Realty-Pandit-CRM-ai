
import { MatchingService } from '../services/matching';
import prisma from '../db';

async function testMatching() {
    console.log('🧪 Testing Matching Engine...');

    const matching = new MatchingService();

    // 1. Seed Dummy Inventory
    console.log('[Setup] Seeding Inventory...');
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error("No Tenant");

    await prisma.inventory.create({
        data: {
            tenant_id: tenant.id,
            owner_phone: '9999999999',
            category: 'RESIDENTIAL',
            type: 'FLAT',
            intent: 'SELL',
            location: 'Noida Sector 75',
            price: 5000000, // 50 Lakh
            status: 'active'
        }
    });

    // 2. Query
    console.log('[Test] Searching for matching buyer...');
    const buyerReq = {
        property_type: 'FLAT',
        preferred_location: 'Noida',
        budget_max: 6000000
    };

    const matches = await matching.findMatches(buyerReq);

    if (matches.length > 0) {
        console.log('✅ Found Matches:', matches.map(m => m.location));
    } else {
        console.error('❌ No matches found (expected 1)');
    }
}

testMatching()
    .catch(console.error)
    .finally(() => process.exit(0));
