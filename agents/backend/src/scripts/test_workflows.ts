
import { SellerWorkflow } from '../workflows/seller';
import prisma from '../db';

async function main() {
    console.log('Testing Workflows...');
    const sellerWorkflow = new SellerWorkflow();

    const phoneNumber = '919000000001';

    // Cleanup
    await prisma.interaction.deleteMany({ where: { phone_number: phoneNumber } });
    await prisma.contact.deleteMany({ where: { phone_number: phoneNumber } });

    // Setup Tenant
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error("No Tenant");

    // Create Contact
    let contact = await prisma.contact.create({
        data: {
            phone_number: phoneNumber,
            tenant_id: tenant.id,
            intent: 'sell',
            lead_status: 'cold'
        }
    });

    console.log(`Refreshed Contact: ${phoneNumber}`);

    // Step 1: User says "I have a flat"
    console.log('--- Step 1: "I have a flat" ---');
    let res = await sellerWorkflow.handle(contact, "I have a flat to sell");
    console.log(`Bot Says: ${res.reply_script}`);

    // Verify Update
    contact = (await prisma.contact.findUnique({ where: { phone_number: phoneNumber } }))!;
    if (contact.property_type === 'flat') console.log('✅ Property Type captured: flat');
    else console.error('❌ Property Type failed');

    // Step 2: User says location
    console.log('--- Step 2: "In Noida Sector 62" ---');
    res = await sellerWorkflow.handle(contact, "In Noida Sector 62");
    console.log(`Bot Says: ${res.reply_script}`);

    // Verify Update
    contact = (await prisma.contact.findUnique({ where: { phone_number: phoneNumber } }))!;
    if (contact.preferred_location === "In Noida Sector 62") console.log('✅ Location captured');
    else console.error('❌ Location failed');

    // Step 3: User says price
    console.log('--- Step 3: "50 Lakhs" ---');
    res = await sellerWorkflow.handle(contact, "50 Lakhs");
    console.log(`Bot Says: ${res.reply_script}`);

    // Verify Update
    contact = (await prisma.contact.findUnique({ where: { phone_number: phoneNumber } }))!;
    if (contact.lead_status === 'warm') console.log('✅ Lead Status -> Warm');
    else console.error('❌ Lead Status failed');

    console.log('Testing Complete.');
}

main()
    .then(async () => { await prisma.$disconnect(); })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); });
