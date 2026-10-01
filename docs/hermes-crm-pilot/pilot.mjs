import { readFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const fail = (message) => { throw new Error(message); };

function prepare(shortageFile, inventoryFiles) {
  const shortageResponse = read(shortageFile);
  if (shortageResponse.success !== true || !Array.isArray(shortageResponse.data)) fail('Invalid shortage response');
  const shortages = shortageResponse.data.filter((row) => row.status === 'OPEN' && row.match_count < 3).map((row) => ({
    id: row.id, area: row.area, match_count: row.match_count,
    demand: {
      intent: row.demand?.intent, budget_min: row.demand?.budget_min,
      budget_max: row.demand?.budget_max, taxonomy_node_id: row.demand?.taxonomy_node_id,
    },
  }));
  const inventory = new Map();
  let expectedPages;
  const pageNumbers = new Set();
  for (const file of inventoryFiles) {
    const page = read(file);
    if (page.scope !== 'tenant_staff' || !Array.isArray(page.data) || !Number.isInteger(page.page) || !Number.isInteger(page.totalPages)) fail(`Invalid tenant-scoped inventory page: ${file}`);
    if (expectedPages !== undefined && expectedPages !== page.totalPages) fail('Inventory page count changed during export');
    if (pageNumbers.has(page.page)) fail(`Duplicate inventory page: ${page.page}`);
    pageNumbers.add(page.page);
    expectedPages = page.totalPages;
    for (const row of page.data) {
      if (row.status !== 'active') fail(`Non-active listing in export: ${row.id}`);
      inventory.set(row.id, {
        id: row.id, display_id: row.display_id, intent: row.intent,
        category: row.category, type: row.type, apartment_name: row.apartment_name,
        sub_locality: row.sub_locality, locality: row.locality, city: row.city,
        price: row.price, price_unit: row.price_unit,
      });
    }
  }
  if (inventoryFiles.length !== expectedPages) fail(`Expected ${expectedPages} inventory pages, got ${inventoryFiles.length}`);
  for (let page = 1; page <= expectedPages; page++) if (!pageNumbers.has(page)) fail(`Missing inventory page: ${page}`);
  return { shortages, inventory: [...inventory.values()] };
}

function check(inputFile, outputFile) {
  const input = read(inputFile);
  const output = read(outputFile);
  if (!Array.isArray(output.candidates) || !Array.isArray(output.survey_stops)) fail('Expected candidates and survey_stops arrays');
  const onlyKeys = (row, keys) => Object.keys(row).sort().join() === [...keys].sort().join();
  if (!onlyKeys(output, ['candidates', 'survey_stops'])) fail('Unexpected output fields');
  const shortageIds = new Set(input.shortages.map((row) => row.id));
  const shortageAreas = new Map(input.shortages.map((row) => [row.id, row.area]));
  const inventoryIds = new Set(input.inventory.map((row) => row.id));
  const seen = new Set();
  for (const row of output.candidates) {
    if (!onlyKeys(row, ['shortage_id', 'inventory_id', 'reason'])) fail('Unexpected candidate fields');
    if (!shortageIds.has(row.shortage_id) || !inventoryIds.has(row.inventory_id)) fail('Candidate references unknown CRM record');
    const key = `${row.shortage_id}:${row.inventory_id}`;
    if (seen.has(key)) fail('Duplicate candidate');
    seen.add(key);
    if (typeof row.reason !== 'string' || !row.reason.trim()) fail('Candidate needs reason');
  }
  for (const row of output.survey_stops) {
    if (!onlyKeys(row, ['shortage_id', 'area', 'reason'])) fail('Unexpected survey stop fields');
    if (!shortageIds.has(row.shortage_id) || row.area !== shortageAreas.get(row.shortage_id)) fail('Survey stop must use shortage area');
    if (typeof row.reason !== 'string' || !row.reason.trim()) fail('Survey stop needs reason');
  }
  return `Valid review queue: ${output.candidates.length} candidates, ${output.survey_stops.length} stops`;
}

try {
  if (process.argv[2] === 'prepare' && process.argv.length >= 5) {
    console.log(JSON.stringify(prepare(process.argv[3], process.argv.slice(4)), null, 2));
  } else if (process.argv[2] === 'check' && process.argv.length === 5) {
    console.log(check(process.argv[3], process.argv[4]));
  } else {
    fail('Usage: node pilot.mjs prepare shortages.json inventory-page*.json > pilot-input.json | node pilot.mjs check pilot-input.json output.json');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
