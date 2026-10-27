/** Read-only candidate/rollback plan. No apply mode; production writes need a separate approval. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '../src/utils/phone';
import { writeFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

const prisma = new PrismaClient({ log: [] });
const args = process.argv.slice(2);
if (args.includes('--apply')) throw new Error('Apply is gated: review the dry-run plan and obtain separate approval');
const tenant = args[args.indexOf('--tenant') + 1];
if (!args.includes('--tenant') || !tenant || tenant.startsWith('--')) throw new Error('Usage: ts-node scripts/contact-party-repair-dry-run.ts --tenant <tenant-id>');

async function main() {
    const report = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL statement_timeout = 20000`;
        const [staff, inventory] = await Promise.all([
            tx.agent.findMany({ where: { tenant_id: tenant }, select: { phone: true } }),
            tx.inventory.findMany({ where: { tenant_id: tenant }, orderBy: { id: 'asc' }, select: {
                id: true, display_id: true, updated_at: true, ownership_type: true,
                owner_phone: true, owner_contact_id: true, owner_id: true, referral_partner_id: true,
                assigned_agent_id: true, uploaded_by_agent_id: true,
                contact: { select: { phone_number: true } }, owner: { select: { contact_phone: true } },
                referral_partner: { select: { phone_number: true } },
            } }),
        ]);
        const staffPhones = new Set(staff.map(a => normalizePhone(a.phone || '')).filter(Boolean));
        const internal = (phone: string | null | undefined) => !!phone && staffPhones.has(normalizePhone(phone));
        const candidates = inventory.filter(i => internal(i.owner_phone) || internal(i.owner_contact_id) || internal(i.owner.contact_phone) || internal(i.referral_partner?.phone_number));
        return { mode: 'DRY_RUN', tenant, captured_at: new Date().toISOString(), scanned: inventory.length,
            candidates: candidates.map(i => {
                const staffOwner = internal(i.owner_phone) || internal(i.owner_contact_id) || internal(i.owner.contact_phone);
                const canPropose = !staffOwner && !!i.contact && i.ownership_type === 'OWNER' && internal(i.referral_partner?.phone_number);
                const original = { referral_partner_id: i.referral_partner_id };
                return { inventory_id: i.id, display_id: i.display_id, expected_updated_at: i.updated_at,
                    reason: staffOwner ? 'Staff-valued owner requires verified replacement; no guessed repair' : 'Explicit OWNER has an internal employee in the external-partner relation',
                    review_required: true, proposed_changes: canPropose ? { referral_partner_id: null } : null,
                    original_values: original, rollback_values: canPropose ? original : null,
                    preserved: { owner_id: i.owner_id, assigned_agent_id: i.assigned_agent_id, uploaded_by_agent_id: i.uploaded_by_agent_id },
                };
            }),
            execution_note: 'No rows changed. A future approved executor must lock/recheck tenant, identity and updated_at, capture the post-write version, and audit each change. Rollback must match that post-write version before restoring original_values.',
        };
    }, { timeout: 30000 });
    if (args.includes('--out')) {
        const output = args[args.indexOf('--out') + 1];
        if (!output || !statSync(dirname(output)).isDirectory()) throw new Error('Existing report output directory required');
        writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
        console.log(JSON.stringify({ mode: report.mode, tenant, report: output, scanned: report.scanned,
            candidates: report.candidates.length, proposed_unlinks: report.candidates.filter(c => c.proposed_changes).length,
            manual_review: report.candidates.filter(c => !c.proposed_changes).length,
            example: report.candidates.find(c => c.display_id === 'RP-GZB-RES-21125') }));
    } else console.log(JSON.stringify(report, null, 2));
}
main().catch(() => { console.error('Read-only repair report failed; no apply mode exists'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
