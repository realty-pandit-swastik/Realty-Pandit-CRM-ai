// Mint Property IDs for inventory rows that have none. Dry-run (count only) by default; add `live` to write.
import prisma from '../db';
import { generateDisplayId } from '../utils/inventory_id';

const live = process.argv[2] === 'live';

(async () => {
    const rows = await prisma.inventory.findMany({
        where: { display_id: null },
        select: { id: true, city: true, locality: true, category: true },
        orderBy: { created_at: 'asc' },
    });
    if (live) {
        for (const row of rows) {
            const id = await generateDisplayId(row.city || row.locality || '', row.category || 'residential');
            await prisma.inventory.update({ where: { id: row.id }, data: { display_id: id } });
            console.log(`SET ${row.id} -> ${id}`);
        }
    }
    console.log(`${rows.length} listing(s) without a Property ID${live ? ' — updated' : ' (dry-run, nothing written)'}`);
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
