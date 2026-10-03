import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'hermes-crm-pilot-'));
const put = (name, value) => { const path = join(dir, name); writeFileSync(path, JSON.stringify(value)); return path; };
const run = (...args) => spawnSync(process.execPath, [new URL('pilot.mjs', import.meta.url).pathname, ...args], { encoding: 'utf8' });

try {
  const shortages = put('shortages.json', { success: true, data: [{ id: 's1', area: 'Sector 4', status: 'OPEN', match_count: 1, demand: { intent: 'buy', budget_max: 9000000, contact_phone: 'SECRET' } }] });
  const inventory = put('inventory.json', { scope: 'tenant_staff', page: 1, totalPages: 1, data: [{ id: 'i1', display_id: 'RP-1', status: 'active', intent: 'sell', locality: 'Sector 4', price: '8000000', owner_phone: 'SECRET' }] });
  const prepared = run('prepare', shortages, inventory);
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.ok(!prepared.stdout.includes('SECRET'));
  const input = put('input.json', JSON.parse(prepared.stdout));
  const output = put('output.json', { candidates: [{ shortage_id: 's1', inventory_id: 'i1', reason: 'Same area; check details' }], survey_stops: [{ shortage_id: 's1', area: 'Sector 4', reason: 'Open shortage' }] });
  assert.equal(run('check', input, output).status, 0);
  const duplicate = put('duplicate.json', { candidates: [{ shortage_id: 's1', inventory_id: 'i1', reason: 'A' }, { shortage_id: 's1', inventory_id: 'i1', reason: 'B' }], survey_stops: [] });
  assert.equal(run('check', input, duplicate).status, 1);
  console.log('Hermes CRM pilot contract passed');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
