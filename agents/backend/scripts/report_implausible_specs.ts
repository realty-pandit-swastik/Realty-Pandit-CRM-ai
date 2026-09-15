/**
 * READ-ONLY report: active listings with implausible `specs.area`, grouped by listing owner.
 *
 * Surfaces data-entry errors (4.5 sqm guest house, 32 sqm template shops, 88,264 sqm, etc.) so
 * the team can hand them back to the owning agent to correct. **It never edits listings** (per the
 * data-correction rule — bad listing data is the owner's to fix). No --execute, no writes.
 *
 *   npx ts-node --transpile-only scripts/report_implausible_specs.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import prisma from '../src/db';

const AREA_TO_SQFT: Record<string, number> = { sqft: 1, sqm: 10.7639, sqyd: 9, acre: 43560, bigha: 27000, marla: 272.25, gaj: 9, katha: 720 };
const norm = (s: any) => { if (!s) return {}; if (typeof s === 'string') { try { return JSON.parse(s); } catch { return {}; } } return s; };
const toSqft = (area: any, unit?: string | null) => { const a = Number(area); if (!Number.isFinite(a)) return null; return a * (AREA_TO_SQFT[String(unit || 'sqft').toLowerCase()] ?? 1); };

async function main() {
  const active = await prisma.inventory.findMany({
    where: { status: 'active' },
    select: {
      id: true, display_id: true, type: true, specs: true, locality: true, city: true,
      uploaded_by_agent: { select: { name: true } }, assigned_agent: { select: { name: true } },
    },
  });
  type Row = { owner: string; idLabel: string; type: string; loc: string; reason: string };
  const flagged: Row[] = [];
  for (const i of active) {
    const s = norm(i.specs);
    const area = s.area;
    const sqft = toSqft(area, s.area_unit);
    let reason: string | null = null;
    if (area == null || area === '' || Number(area) <= 0) reason = 'area missing/zero';
    else if (sqft != null && sqft < 100) reason = `too small: ${area} ${s.area_unit || ''} (~${Math.round(sqft)} sqft)`;
    else if (sqft != null && sqft > 5_000_000) reason = `too large: ${area} ${s.area_unit || ''} (~${Math.round(sqft).toLocaleString()} sqft)`;
    if (reason) flagged.push({
      owner: (i.uploaded_by_agent?.name || i.assigned_agent?.name || '(unassigned)') as string,
      idLabel: i.display_id || i.id.slice(0, 8), type: i.type || '?', loc: i.locality || i.city || '', reason,
    });
  }
  console.log(`\n=== Implausible area — active listings: ${flagged.length} of ${active.length} ===`);
  const byOwner: Record<string, Row[]> = {};
  for (const f of flagged) (byOwner[f.owner] = byOwner[f.owner] || []).push(f);
  for (const [owner, rows] of Object.entries(byOwner).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${owner}  (${rows.length})`);
    rows.forEach(f => console.log(`   ${f.idLabel}  ${f.type.padEnd(18)} ${f.loc.slice(0, 28).padEnd(28)} — ${f.reason}`));
  }
  console.log('\n(Read-only: no listings were modified. Owners correct these via Edit Inventory.)');
  await prisma.$disconnect(); process.exit(0);
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
