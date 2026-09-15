/**
 * Backfill contacts.last_wa_inbound from each contact's newest inbound WhatsApp Interaction,
 * then (optionally) repair lead_status rows that the bug wrongly downgraded to 'cold'.
 *
 * THE BUG (2026-08-07): `SessionTracker.markInbound()` is fired un-awaited at the top of
 * webhook_processor, BEFORE the contact row is created. It uses `updateMany`, which matches
 * zero rows silently when the contact does not exist yet — so every first-ever inbound message
 * lost its stamp permanently. Affected contacts are treated as "session closed" forever:
 * forced onto templates by SessionTracker.isSessionActive, flagged "never replied" by
 * followup_scheduler, and auto-downgraded to lead_status='cold' after 7 days.
 *
 * ⚠ ORDERING: `SESSION_KEEPALIVE_ENABLED` must be false before running this. The keepalive job
 * selects on exactly this column with a 21-23h window; populating it first would fire an
 * rp_reopen_session burst at the whole backfilled population.
 *
 * Idempotent and monotonic — the guard `(last_wa_inbound IS NULL OR < newest)` means it can be
 * re-run safely and can never move a stamp BACKWARDS (which would falsely reopen a session).
 *
 *   npx ts-node --transpile-only scripts/backfill_last_wa_inbound.ts                 # dry-run
 *   npx ts-node --transpile-only scripts/backfill_last_wa_inbound.ts --execute       # stamp only
 *   npx ts-node --transpile-only scripts/backfill_last_wa_inbound.ts --execute --repair-status
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import prisma from '../src/db';

const DRY_RUN = !process.argv.includes('--execute');
const REPAIR_STATUS = process.argv.includes('--repair-status');
const SCRIPT_TAG = 'repair_lead_status_2026-08';

/**
 * Only treat a stamp as missing if it is NULL or lags the newest inbound by more than this.
 *
 * A naive `last_wa_inbound < newest_inbound` matches 442 rows, but 419 of them are a
 * sub-second write-order artifact, not a bug: markInbound() fires at webhook_processor:81
 * while the inbound Interaction row is written later in the same turn, so the stamp is
 * legitimately a few hundred ms older. Measured on prod 2026-08-07: 376 rows stale by <5s,
 * 43 by <1m, 0 by >1d, and 23 genuinely NULL. The threshold keeps the count honest and
 * avoids 419 pointless writes.
 */
const STALE_THRESHOLD = "interval '1 minute'";

async function main() {
    console.log(`\n=== backfill_last_wa_inbound  (${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}${REPAIR_STATUS ? ' +repair-status' : ''}) ===\n`);

    // Safety interlock — see the ORDERING note above.
    const keepalive = process.env.SESSION_KEEPALIVE_ENABLED;
    if (keepalive === 'true') {
        console.error('❌ ABORT: SESSION_KEEPALIVE_ENABLED=true. Set it to false and restart the');
        console.error('   backend before backfilling, or this will trigger a keep-alive burst.');
        process.exit(1);
    }
    console.log(`SESSION_KEEPALIVE_ENABLED=${keepalive ?? '<unset>'} → keepalive is OFF, safe to proceed.\n`);

    // ── 1. Candidates ────────────────────────────────────────────────────────────
    // channel='whatsapp' AND direction='inbound', deliberately NOT filtered by event_type:
    // workflow_message / workflow_start / ctwa_ad_click are all genuine inbound WhatsApp
    // messages that open the 24h window just as much as event_type='message' does.
    const candidates = await prisma.$queryRawUnsafe<Array<{
        phone_number: string; name: string | null; max_at: Date; lead_status: string | null; created_at: Date;
    }>>(`
        SELECT c.phone_number, c.name, x.max_at, c.lead_status, c.created_at
        FROM contacts c
        JOIN (
            SELECT i.phone_number, MAX(i.created_at) AS max_at
            FROM interactions i
            WHERE i.channel = 'whatsapp' AND i.direction = 'inbound'
            GROUP BY i.phone_number
        ) x ON x.phone_number = c.phone_number
        WHERE c.last_wa_inbound IS NULL OR c.last_wa_inbound < x.max_at - ${STALE_THRESHOLD}
        ORDER BY x.max_at DESC
    `);

    console.log(`Candidates to stamp: ${candidates.length}`);
    if (candidates.length) {
        const now = Date.now();
        const bucket = { '<24h': 0, '1-7d': 0, '7-21d': 0, '>21d': 0 };
        let inKeepaliveWindow = 0;
        for (const c of candidates) {
            const ageH = (now - new Date(c.max_at).getTime()) / 36e5;
            if (ageH < 24) bucket['<24h']++;
            else if (ageH < 24 * 7) bucket['1-7d']++;
            else if (ageH < 24 * 21) bucket['7-21d']++;
            else bucket['>21d']++;
            if (ageH >= 21 && ageH <= 23) inKeepaliveWindow++;
        }
        console.log('Age of newest inbound:', JSON.stringify(bucket));
        console.log(`⚠ Landing inside the 21-23h keepalive window right now: ${inKeepaliveWindow}`);
        console.log('\nSample (up to 25):');
        for (const c of candidates.slice(0, 25)) {
            console.log(`  ${c.phone_number.padEnd(15)} ${String(c.name ?? '—').slice(0, 22).padEnd(24)} status=${String(c.lead_status).padEnd(6)} newest_inbound=${new Date(c.max_at).toISOString()}`);
        }
    }

    if (DRY_RUN) {
        console.log('\nDRY RUN — no writes. Re-run with --execute to apply.');
    } else if (candidates.length) {
        const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 13);
        const bak = `contacts_bak_${ts}`;
        await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "${bak}" AS SELECT * FROM contacts`);
        console.log(`\n✅ Snapshot created: ${bak}`);

        const updated = await prisma.$executeRawUnsafe(`
            UPDATE contacts c
            SET last_wa_inbound = x.max_at
            FROM (
                SELECT i.phone_number, MAX(i.created_at) AS max_at
                FROM interactions i
                WHERE i.channel = 'whatsapp' AND i.direction = 'inbound'
                GROUP BY i.phone_number
            ) x
            WHERE c.phone_number = x.phone_number
              AND (c.last_wa_inbound IS NULL OR c.last_wa_inbound < x.max_at - ${STALE_THRESHOLD})
        `);
        console.log(`✅ Stamped ${updated} contacts.`);
        console.log(`   Revert: UPDATE contacts c SET last_wa_inbound = b.last_wa_inbound FROM "${bak}" b WHERE b.phone_number = c.phone_number;`);
    }

    // ── 2. lead_status repair (heuristic — requires explicit --repair-status) ────
    // There is NO ground-truth marker: followup_scheduler writes 'cold' with no audit row,
    // and three other legitimate paths also write 'cold'. So this deliberately narrows to
    // contacts that (a) are cold, (b) have a REAL inbound WhatsApp conversation, (c) whose
    // newest inbound is inside 14 days so they are not genuinely cold by the 14d rule, and
    // (d) are not the 2-no-show case. Repaired to 'warm', never 'hot' — the prior value is
    // unknowable and 'warm' is the conservative floor that restores follow-up eligibility.
    const repairCandidates = await prisma.$queryRawUnsafe<Array<{
        phone_number: string; name: string | null; contact_type: string; created_at: Date; last_wa_inbound: Date | null;
    }>>(`
        SELECT c.phone_number, c.name, c.contact_type::text AS contact_type, c.created_at, c.last_wa_inbound
        FROM contacts c
        WHERE c.lead_status = 'cold'
          AND c.contact_type IN ('BUYER','TENANT','LANDLORD')
          AND c.opted_out_at IS NULL
          -- Only contacts old enough that followup_scheduler's 7-day "never replied" rule
          -- could actually have downgraded them. Without this the query also matches leads
          -- that were simply CREATED cold (webhook_processor sets lead_status:'cold' on
          -- create) — warming those is a business decision to re-activate new leads, not a
          -- repair of bug damage. Measured 2026-08-07: 15 matched, only 6 attributable.
          AND c.created_at <= now() - interval '7 days'
          AND EXISTS (
              SELECT 1 FROM interactions i
              WHERE i.phone_number = c.phone_number
                AND i.channel = 'whatsapp' AND i.direction = 'inbound'
                AND i.created_at > now() - interval '14 days'
          )
          AND NOT EXISTS (
              SELECT 1 FROM lead_scores ls
              WHERE ls.phone_number = c.phone_number AND ls.no_show_count >= 2
          )
        ORDER BY c.created_at DESC
    `);

    console.log(`\n=== lead_status repair candidates (cold → warm): ${repairCandidates.length} ===`);
    for (const c of repairCandidates.slice(0, 25)) {
        console.log(`  ${c.phone_number.padEnd(15)} ${String(c.name ?? '—').slice(0, 22).padEnd(24)} type=${c.contact_type.padEnd(8)} created=${new Date(c.created_at).toISOString().slice(0, 10)}`);
    }

    if (!REPAIR_STATUS) {
        console.log('\n(no --repair-status flag → lead_status NOT touched. Review the sample above and get owner sign-off first.)');
    } else if (DRY_RUN) {
        console.log('\nDRY RUN — lead_status not written.');
    } else if (repairCandidates.length) {
        let n = 0;
        for (const c of repairCandidates) {
            await prisma.contact.update({
                where: { phone_number: c.phone_number },
                data: { lead_status: 'warm' },
            });
            const tenant = await prisma.contact.findUnique({
                where: { phone_number: c.phone_number }, select: { tenant_id: true },
            });
            await prisma.interaction.create({
                data: {
                    tenant_id: tenant!.tenant_id,
                    phone_number: c.phone_number,
                    channel: 'system',
                    direction: 'outbound',
                    event_type: 'lead_status_repair',
                    content: 'cold → warm (last_wa_inbound backfill, 2026-08 bug)',
                    metadata: { from: 'cold', to: 'warm', reason: 'last_wa_inbound_null_bug', script: SCRIPT_TAG },
                },
            });
            n++;
        }
        console.log(`✅ Repaired ${n} contacts cold → warm (each with a lead_status_repair audit row).`);
        console.log(`   Revert: UPDATE contacts c SET lead_status='cold' FROM interactions i`);
        console.log(`           WHERE i.phone_number=c.phone_number AND i.event_type='lead_status_repair'`);
        console.log(`             AND i.metadata->>'script'='${SCRIPT_TAG}';`);
    }

    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error('ERROR:', e);
    await prisma.$disconnect();
    process.exit(1);
});
