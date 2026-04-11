/**
 * Data Recovery Script: Fix 98 admin inventories with wrong owner_phone
 *
 * The bug: workflow commit used logged-in agent's phone instead of the
 * source contact's phone from answers.uploader_phone.
 *
 * Recovery: Match inventory.uploader_name → Contact.name to find correct phone.
 *
 * Usage:
 *   node scripts/fix_owner_phones.js --dry-run   # Preview only
 *   node scripts/fix_owner_phones.js              # Apply fixes
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

// normalizePhone from utils/phone.ts (inline for script portability)
function normalizePhone(raw) {
    if (!raw) return null;
    let cleaned = raw.replace(/[\s\-()]/g, '').replace(/^\+/, '');
    if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
    if (/^\d{12}$/.test(cleaned) && cleaned.startsWith('91')) cleaned = cleaned.substring(2);
    if (/^[6-9]\d{9}$/.test(cleaned)) return `+91${cleaned}`;
    if (/^91[6-9]\d{9}$/.test(cleaned)) return `+${cleaned}`;
    return raw;
}

async function main() {
    console.log(`\n=== Inventory Owner Phone Recovery Script ===`);
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update records)'}\n`);

    // Step 1: Get all agent phones
    const agents = await prisma.agent.findMany({ select: { id: true, name: true, phone: true } });
    const agentPhones = new Set(agents.map(a => a.phone).filter(Boolean));
    console.log(`Found ${agents.length} agents`);

    // Step 2: Find affected inventories
    const allAdmin = await prisma.inventory.findMany({
        where: { upload_source: 'admin' },
        include: { uploaded_by_agent: { select: { id: true, name: true, phone: true } } },
        orderBy: { created_at: 'asc' },
    });

    const affected = allAdmin.filter(inv => {
        if (!inv.uploaded_by_agent) return false;
        if (inv.owner_phone !== inv.uploaded_by_agent.phone) return false;
        if (!inv.uploader_name) return false;
        // Name mismatch = bug victim
        return inv.uploader_name.trim().toLowerCase() !== inv.uploaded_by_agent.name.trim().toLowerCase();
    });

    console.log(`Total admin inventories: ${allAdmin.length}`);
    console.log(`Bug-affected: ${affected.length}\n`);

    const results = { exact: [], fuzzy: [], manual: [] };
    const backup = [];

    for (const inv of affected) {
        const name = inv.uploader_name.trim();
        const buggyPhone = inv.owner_phone;

        // Backup
        backup.push({
            id: inv.id,
            display_id: inv.display_id,
            old_owner_phone: inv.owner_phone,
            old_uploader_phone: inv.uploader_phone,
            old_owner_id: inv.owner_id,
            uploader_name: name,
            agent_name: inv.uploaded_by_agent?.name,
            agent_phone: inv.uploaded_by_agent?.phone,
        });

        // Pass 1: Exact match (case-insensitive)
        let contacts = await prisma.contact.findMany({
            where: {
                name: { equals: name, mode: 'insensitive' },
                phone_number: { not: buggyPhone }, // Exclude the agent's phone
            },
            select: { phone_number: true, name: true, contact_type: true },
        });

        // Filter: prefer LANDLORD contacts (was SELLER_LANDLORD)
        const sellers = contacts.filter(c => c.contact_type === 'LANDLORD');
        if (sellers.length === 1) {
            results.exact.push({ inv, correctPhone: sellers[0].phone_number, matchType: 'exact_seller' });
            continue;
        }
        if (contacts.length === 1) {
            results.exact.push({ inv, correctPhone: contacts[0].phone_number, matchType: 'exact' });
            continue;
        }

        // Pass 2: Fuzzy — partial name match
        contacts = await prisma.contact.findMany({
            where: {
                name: { contains: name, mode: 'insensitive' },
                phone_number: { not: buggyPhone },
            },
            select: { phone_number: true, name: true, contact_type: true },
        });
        if (contacts.length === 0) {
            // Try reverse: contact name contains the inventory name
            contacts = await prisma.contact.findMany({
                where: {
                    phone_number: { not: buggyPhone },
                    contact_type: 'LANDLORD',
                },
                select: { phone_number: true, name: true, contact_type: true },
            });
            contacts = contacts.filter(c => c.name && (
                c.name.toLowerCase().includes(name.toLowerCase()) ||
                name.toLowerCase().includes(c.name.toLowerCase())
            ));
        }

        const fuzzySellers = contacts.filter(c => c.contact_type === 'LANDLORD');
        if (fuzzySellers.length === 1) {
            results.fuzzy.push({ inv, correctPhone: fuzzySellers[0].phone_number, matchType: 'fuzzy_seller', contactName: fuzzySellers[0].name });
            continue;
        }
        if (contacts.length === 1) {
            results.fuzzy.push({ inv, correctPhone: contacts[0].phone_number, matchType: 'fuzzy', contactName: contacts[0].name });
            continue;
        }

        // Pass 3: Manual review
        results.manual.push({
            inv_id: inv.id.substring(0, 8),
            display_id: inv.display_id,
            uploader_name: name,
            buggy_phone: buggyPhone,
            agent: inv.uploaded_by_agent?.name,
            candidates: contacts.map(c => ({ phone: c.phone_number, name: c.name, type: c.contact_type })),
        });
    }

    // Report
    console.log(`=== RESULTS ===`);
    console.log(`Exact matches: ${results.exact.length}`);
    console.log(`Fuzzy matches: ${results.fuzzy.length}`);
    console.log(`Manual review: ${results.manual.length}\n`);

    // Show exact matches
    for (const r of results.exact) {
        console.log(`  [EXACT] ${r.inv.id.substring(0,8)} | ${r.inv.display_id} | "${r.inv.uploader_name}" → ${r.correctPhone}`);
    }
    for (const r of results.fuzzy) {
        console.log(`  [FUZZY] ${r.inv.id.substring(0,8)} | ${r.inv.display_id} | "${r.inv.uploader_name}" → ${r.correctPhone} (matched: "${r.contactName}")`);
    }
    for (const r of results.manual) {
        console.log(`  [MANUAL] ${r.inv_id} | ${r.display_id} | "${r.uploader_name}" | agent: ${r.agent} | candidates: ${r.candidates.length}`);
        r.candidates.forEach(c => console.log(`           → ${c.phone} "${c.name}" (${c.type})`));
    }

    if (DRY_RUN) {
        console.log(`\n=== DRY RUN COMPLETE — No changes made ===`);
        console.log(`Run without --dry-run to apply fixes.\n`);
        await prisma.$disconnect();
        return;
    }

    // Apply fixes
    console.log(`\n=== APPLYING FIXES ===`);
    const tenant = await prisma.tenant.findFirst();
    let fixed = 0;

    for (const r of [...results.exact, ...results.fuzzy]) {
        try {
            const correctPhone = r.correctPhone;

            // Ensure Owner record
            let owner = await prisma.owner.findFirst({
                where: { contact_phone: { in: [correctPhone, correctPhone.replace('+91', '')] } },
            });
            if (!owner) {
                owner = await prisma.owner.create({
                    data: {
                        scope: 'INTERNAL',
                        contact_phone: correctPhone,
                        status: 'ACTIVE',
                        listing_limit: 10,
                        priority_score: 50,
                    },
                });
            }

            // Update inventory
            await prisma.inventory.update({
                where: { id: r.inv.id },
                data: {
                    owner_phone: correctPhone,
                    uploader_phone: correctPhone,
                    owner_id: owner.id,
                },
            });

            // Audit log
            await prisma.interaction.create({
                data: {
                    tenant_id: tenant.id,
                    phone_number: correctPhone,
                    direction: 'system',
                    channel: 'admin',
                    event_type: 'owner_phone_corrected',
                    content: `Auto-corrected owner_phone for ${r.inv.display_id}`,
                    metadata: {
                        inventory_id: r.inv.id,
                        old_phone: r.inv.owner_phone,
                        new_phone: correctPhone,
                        match_type: r.matchType,
                        uploader_name: r.inv.uploader_name,
                    },
                },
            });

            fixed++;
            console.log(`  Fixed: ${r.inv.id.substring(0,8)} | ${r.inv.display_id} | ${r.inv.owner_phone} → ${correctPhone}`);
        } catch (err) {
            console.error(`  ERROR: ${r.inv.id.substring(0,8)} | ${err.message}`);
        }
    }

    console.log(`\n=== COMPLETE ===`);
    console.log(`Fixed: ${fixed}/${results.exact.length + results.fuzzy.length}`);
    console.log(`Manual review needed: ${results.manual.length}`);
    console.log(`Backup data: ${backup.length} records logged above\n`);

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
