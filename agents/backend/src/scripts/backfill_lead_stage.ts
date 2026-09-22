/**
 * Phase 4 — align contacts.lifecycle_stage to the deal, and clear legacy junk values.
 * Idempotent. Pass --apply to write; default is a dry run.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { deriveLeadStage } from '../services/lead_stage_sync';
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const CANON = ['NEW','QUALIFIED','MATCHING_APPOINTMENT','VISIT_SCHEDULED','VISITED','NEGOTIATION','CLOSED_WON','CLOSED_LOST','ON_HOLD'];

(async () => {
  console.log(APPLY ? '*** APPLY MODE — writing ***\n' : '--- DRY RUN (no writes) ---\n');

  const deals = await prisma.transaction.findMany({ select: { demand_contact_id: true, status: true, updated_at: true } });
  const byPhone = new Map<string, { status: any; updated_at: Date }[]>();
  for (const d of deals) {
    if (!byPhone.has(d.demand_contact_id)) byPhone.set(d.demand_contact_id, []);
    byPhone.get(d.demand_contact_id)!.push({ status: d.status, updated_at: d.updated_at });
  }

  const contacts = await prisma.contact.findMany({ select: { phone_number: true, lifecycle_stage: true } });
  const plan: { phone: string; from: string; to: string; why: string }[] = [];
  let noDealJunk = 0, alreadyOk = 0, noDealOk = 0;

  for (const c of contacts) {
    const cur = c.lifecycle_stage || 'NEW';
    const mine = byPhone.get(c.phone_number);
    if (mine && mine.length) {
      const want = deriveLeadStage(mine)!;
      if (want !== cur) plan.push({ phone: c.phone_number, from: cur, to: want, why: 'deal' });
      else alreadyOk++;
    } else if (!CANON.includes(cur)) {
      const want = cur === 'MATCHED' ? 'QUALIFIED' : 'NEW';
      plan.push({ phone: c.phone_number, from: cur, to: want, why: 'junk (no deal)' });
      noDealJunk++;
    } else noDealOk++;
  }

  const tally = new Map<string, number>();
  for (const p of plan) { const k = `${p.from} -> ${p.to}  [${p.why}]`; tally.set(k, (tally.get(k) || 0) + 1); }
  console.log('changes by transition:');
  [...tally.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}  ${k}`));
  console.log(`\n  total to change : ${plan.length}`);
  console.log(`  already correct : ${alreadyOk}`);
  console.log(`  dealless, fine  : ${noDealOk}`);
  console.log(`  dealless junk   : ${noDealJunk}`);

  console.log('\n--- report impact (before) ---');
  const lostBefore = await prisma.contact.count({ where: { lifecycle_stage: 'CLOSED_LOST' } });
  const junkBefore = await prisma.contact.count({ where: { lifecycle_stage: { notIn: CANON } } });
  console.log(`  lost-lead report rows : ${lostBefore}`);
  console.log(`  non-canonical values  : ${junkBefore}`);

  if (!APPLY) { console.log('\nDry run only. Re-run with --apply to write.'); await prisma.$disconnect(); return; }

  let done = 0;
  for (let i = 0; i < plan.length; i += 200) {
    const batch = plan.slice(i, i + 200);
    await prisma.$transaction(batch.map(p =>
      prisma.contact.update({ where: { phone_number: p.phone }, data: { lifecycle_stage: p.to } })));
    done += batch.length;
    if (done % 1000 === 0 || done === plan.length) console.log(`  ...${done}/${plan.length}`);
  }

  console.log('\n--- after ---');
  const lostAfter = await prisma.contact.count({ where: { lifecycle_stage: 'CLOSED_LOST' } });
  const junkAfter = await prisma.contact.count({ where: { lifecycle_stage: { notIn: CANON } } });
  const div: any[] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int n FROM transactions t JOIN contacts c ON c.phone_number = t.demand_contact_id WHERE c.lifecycle_stage <> t.status::text`);
  console.log(`  lost-lead report rows : ${lostBefore} -> ${lostAfter}`);
  console.log(`  non-canonical values  : ${junkBefore} -> ${junkAfter}`);
  console.log(`  raw deal/lead row mismatches (multi-deal leads legitimately remain): ${div[0].n}`);
  await prisma.$disconnect();
})().catch(async e => { console.error('ERR', e); await prisma.$disconnect(); process.exit(1); });
