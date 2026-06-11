/**
 * recover_99acres_gap.ts — one-off reconciliation for the 99acres lead gap (2026-05-28 → 05-31)
 *
 * The original poller bug fetched-then-dropped leads and advanced its watermark, so leads
 * delivered during the gap that have aged out of the 99acres pull-API rolling buffer are
 * NOT recoverable via the API. The authoritative record is the 99acres seller dashboard
 * (Response Manager). Export those leads, convert to JSON, and feed this script: it diffs
 * by phone against existing contacts and ingests only the MISSING ones (contact + agent
 * round-robin + auto-deal via ensureDealForLead + an interaction log), mirroring the live
 * 99acres ingest wiring.
 *
 * INPUT: a JSON file — array of { phone, name?, email?, received_on?, intent?, location? }.
 *   phone is required; everything else is best-effort.
 *
 * USAGE (run from /var/www/realty-pandit/backend on prod, per reference_prod_db_script_pattern):
 *   DRY-RUN (default, no writes):  npx ts-node --transpile-only scripts/recover_99acres_gap.ts ./gap.json
 *   APPLY (after pg_dump backup):  APPLY=1 npx ts-node --transpile-only scripts/recover_99acres_gap.ts ./gap.json
 *
 * SAFETY: take a pg_dump backup before APPLY (see reference_prod_db_backup). Idempotent —
 * re-running skips contacts that already exist (by normalized phone), so it is safe to re-run.
 */
import * as fs from 'fs';
import prisma from '../src/db';
import { normalizePhone, resolveStoredContactPhone } from '../src/utils/phone';
import { ensureDealForLead } from '../src/services/ensure_deal';

interface GapLead {
    phone: string;
    name?: string | null;
    email?: string | null;
    received_on?: string | null;
    intent?: string | null;
    location?: string | null;
}

async function main() {
    const APPLY = process.env.APPLY === '1';
    const file = process.argv[2];
    if (!file) { console.error('Usage: ts-node scripts/recover_99acres_gap.ts <gap.json> (set APPLY=1 to write)'); process.exit(1); }

    const raw: GapLead[] = JSON.parse(fs.readFileSync(file, 'utf8'));
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error('No tenant configured');

    let missing = 0, existing = 0, invalid = 0, created = 0;
    const sample: any[] = [];

    for (const lead of raw) {
        const phone = normalizePhone(lead.phone);
        if (!phone || !/^\+91[6-9]\d{9}$/.test(phone)) { invalid++; continue; }

        // Resolve to any existing PK (incl. legacy bare/dash rows) so we don't duplicate.
        const storedPhone = (await resolveStoredContactPhone(phone, prisma)) ?? phone;
        const found = await prisma.contact.findUnique({ where: { phone_number: storedPhone }, select: { phone_number: true } });
        if (found) { existing++; continue; }

        missing++;
        if (sample.length < 10) sample.push({ phone: storedPhone, name: lead.name ?? null, received_on: lead.received_on ?? null });
        if (!APPLY) continue;

        const intent = lead.intent && /rent|lease|tenant/i.test(lead.intent) ? 'rent' : 'buy';
        await prisma.contact.create({
            data: {
                phone_number: storedPhone,
                name: lead.name || null,
                email: lead.email || null,
                source: '99acres',
                contact_type: 'BUYER',
                intent,
                preferred_location: lead.location || null,
                tenant_id: tenant.id,
                last_channel: '99acres',
                last_interaction: new Date(),
                lead_status: 'warm',
                // requirement type unknown from a basic export → left for the bot/agent to qualify
            },
        });
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: storedPhone,
                channel: '99acres',
                direction: 'inbound',
                event_type: 'lead_capture',
                content: `99acres lead (gap-recovery): ${lead.name || 'Unknown'}${lead.received_on ? ` — received ${lead.received_on}` : ''}`,
                metadata: { source: '99acres', ingestion_method: 'gap_recovery_script', original_data: lead as any },
            },
        });
        // Agent round-robin + NEW deal + qualification cadence (same wiring as live ingest).
        await ensureDealForLead({ contactPhone: storedPhone, source: '99acres' }).catch((e) =>
            console.error(`  ensureDealForLead failed for ${storedPhone}: ${(e as Error).message}`));
        created++;
    }

    console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN'} | input rows: ${raw.length} | already in CRM: ${existing} | invalid phone: ${invalid} | MISSING (to recover): ${missing} | created: ${created}`);
    console.log('sample of missing:', JSON.stringify(sample, null, 2));
    process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
