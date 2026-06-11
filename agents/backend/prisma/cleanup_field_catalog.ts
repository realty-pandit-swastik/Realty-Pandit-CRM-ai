/**
 * Clean up the taxonomy FieldDefinition catalog + NodeField options that were
 * imported verbatim (and garbled) from Chat/newtree.xlsx.
 *
 * For each field (matched by its CURRENT key) it sets the corrected key, label,
 * input_type and canonical options_json on FieldDefinition (in place — the uuid id
 * is unchanged so NodeField.field_id stays valid). Then it NULLS every
 * NodeField.options_override so all types inherit the clean canonical options
 * (read API falls back options_override ?? field.options_json). Finally it detaches
 * the `age-of-construction` field from TYPE nodes (duplicate of the construction_status step).
 *
 * Idempotent (re-running matches by new key too). Approved catalog 2026-05-24.
 *
 *   DRY RUN: npx ts-node --transpile-only prisma/cleanup_field_catalog.ts --dry-run
 *   APPLY:   npx ts-node --transpile-only prisma/cleanup_field_catalog.ts
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');

type Spec = { match: string[]; key: string; label: string; input_type: string; options: string[] | null };

// match: current key(s) to find this field by (handles already-renamed re-runs).
const CATALOG: Spec[] = [
    // 3a. measurement / counts
    { match: ['bhk'], key: 'bhk', label: 'BHK', input_type: 'select', options: ['1 RK', '1', '2', '3', '4', '5', '6', '7', '8+'] },
    { match: ['rooms'], key: 'rooms', label: 'Rooms', input_type: 'number', options: null },
    { match: ['toilets', 'bathrooms'], key: 'bathrooms', label: 'Bathrooms', input_type: 'number', options: null },
    { match: ['balconies'], key: 'balconies', label: 'Balconies', input_type: 'number', options: null },
    { match: ['floors'], key: 'floors', label: 'Total Floors', input_type: 'number', options: null },
    { match: ['area'], key: 'area-type', label: 'Area Type', input_type: 'select', options: ['Super Built-up', 'Built-up', 'Carpet'] },
    { match: ['plot-area'], key: 'plot-area', label: 'Plot Area', input_type: 'number', options: null },
    { match: ['dimension'], key: 'dimension', label: 'Plot Dimensions', input_type: 'text', options: null },
    { match: ['road-with', 'road-width'], key: 'road-width', label: 'Road Width', input_type: 'number', options: null },
    { match: ['facing'], key: 'facing', label: 'Facing', input_type: 'select', options: ['North', 'South', 'East', 'West', 'North-East', 'North-West', 'South-East', 'South-West'] },
    { match: ['side-opens', 'sides-open'], key: 'sides-open', label: 'Sides Open', input_type: 'select', options: ['1', '2', '3', '4'] },
    { match: ['floor-allowed-to-contruction-far', 'far'], key: 'far', label: 'FAR (Floor Area Ratio)', input_type: 'number', options: null },
    // 3b. status / tenure / furnishing
    { match: ['staus', 'status'], key: 'status', label: 'Construction Status', input_type: 'select', options: ['Ready to Move', 'Under Construction'] },
    { match: ['furnishing'], key: 'furnishing', label: 'Furnishing', input_type: 'select', options: ['Unfurnished', 'Semi-Furnished', 'Fully Furnished'] },
    { match: ['free-lease-hold', 'ownership-tenure'], key: 'ownership-tenure', label: 'Ownership', input_type: 'select', options: ['Freehold', 'Leasehold'] },
    { match: ['boundary-wall-yes-no', 'boundary-wall'], key: 'boundary-wall', label: 'Boundary Wall', input_type: 'select', options: ['Yes', 'No'] },
    { match: ['any-contruction-yes-no', 'any-construction'], key: 'any-construction', label: 'Any Construction on Plot', input_type: 'select', options: ['Yes', 'No'] },
    { match: ['pre-rent-leased'], key: 'pre-rent-leased', label: 'Pre-Rented / Leased', input_type: 'select', options: ['Vacant', 'Pre-Rented', 'Leased'] },
    // 3c. multi-select
    { match: ['amenties', 'amenities'], key: 'amenities', label: 'Amenities', input_type: 'multiselect', options: ['Gym', 'Club House', 'Power Backup', 'Lift', 'Intercom', 'Guest House', 'Park', 'Community Hall', 'Mini Theater', 'Swimming Pool', 'Security', 'Gas Pipeline'] },
    { match: ['additional-rooms'], key: 'additional-rooms', label: 'Additional Rooms', input_type: 'multiselect', options: ['Pooja Room', 'Study', 'Servant Room', 'Store Room'] },
    { match: ['parking'], key: 'parking', label: 'Parking', input_type: 'multiselect', options: ['Reserved', 'Common', 'Open', 'Covered'] },
    // 3d. commercial / office
    { match: ['reception'], key: 'reception', label: 'Reception', input_type: 'select', options: ['Yes', 'No'] },
    { match: ['confernce-meeting-cabin', 'conference-cabins'], key: 'conference-cabins', label: 'Conference / Meeting Cabins', input_type: 'number', options: null },
    { match: ['mini-max-seats', 'seats'], key: 'seats', label: 'Seating Capacity', input_type: 'number', options: null },
    { match: ['lifts'], key: 'lifts', label: 'Lifts', input_type: 'number', options: null },
    { match: ['pantry-cantine', 'pantry-canteen'], key: 'pantry-canteen', label: 'Pantry / Canteen', input_type: 'select', options: ['Yes', 'No'] },
    // 3e. hospitality / institution / petrol
    { match: ['quailty-rating', 'star-rating'], key: 'star-rating', label: 'Star Rating', input_type: 'select', options: ['1 Star', '2 Star', '3 Star', '4 Star', '5 Star'] },
    { match: ['play-ground', 'playground'], key: 'playground', label: 'Playground', input_type: 'select', options: ['Yes', 'No'] },
    { match: ['labs'], key: 'labs', label: 'Labs', input_type: 'number', options: null },
    { match: ['woards', 'wards'], key: 'wards', label: 'Wards', input_type: 'number', options: null },
    { match: ['operationth', 'operation-theatres'], key: 'operation-theatres', label: 'Operation Theatres', input_type: 'number', options: null },
    { match: ['revenus', 'annual-revenue'], key: 'annual-revenue', label: 'Annual Revenue', input_type: 'text', options: null },
    { match: ['nozzels', 'nozzles'], key: 'nozzles', label: 'Nozzles', input_type: 'number', options: null },
    { match: ['brands'], key: 'brands', label: 'Fuel Brands', input_type: 'multiselect', options: ['IOCL', 'BPCL', 'HPCL', 'Reliance', 'Nayara', 'Shell', 'Other'] },
    // age-of-construction: cleaned for safety, but DETACHED from nodes below (dup of construction step)
    { match: ['age-of-construction'], key: 'age-of-construction', label: 'Age of Construction', input_type: 'select', options: ['New', 'Less than 1 year', '1-3 years', '3-5 years', '5-10 years', '10+ years'] },
];

async function main() {
    const all = await prisma.fieldDefinition.findMany({ select: { id: true, key: true } });
    const byKey = new Map(all.map((f) => [f.key, f.id]));
    let updated = 0, notFound: string[] = [];
    for (const s of CATALOG) {
        const id = s.match.map((k) => byKey.get(k)).find(Boolean);
        if (!id) { notFound.push(s.match[0]); continue; }
        console.log(`${DRY ? '[DRY] ' : ''}field ${s.match[0]} -> key=${s.key} label="${s.label}" type=${s.input_type} opts=${s.options ? s.options.length : 0}`);
        if (!DRY) {
            await prisma.fieldDefinition.update({ where: { id }, data: { key: s.key, label: s.label, input_type: s.input_type, options_json: s.options ?? undefined } });
        }
        updated++;
    }
    // Null out ALL per-node garbage option overrides so types inherit clean canonical options.
    const ovCount = await prisma.nodeField.count({ where: { options_override: { not: null } } });
    if (!DRY) await prisma.$executeRawUnsafe('UPDATE "node_fields" SET "options_override" = NULL');
    // Detach age-of-construction from TYPE nodes (duplicate of construction_status step).
    const ageId = byKey.get('age-of-construction');
    let detached = 0;
    if (ageId) {
        if (!DRY) { const r = await prisma.nodeField.deleteMany({ where: { field_id: ageId } }); detached = r.count; }
        else detached = await prisma.nodeField.count({ where: { field_id: ageId } });
    }
    console.log(DRY ? '--- DRY RUN ---' : '--- APPLIED ---');
    console.log(`fields_updated=${updated} not_found=${JSON.stringify(notFound)} options_override_cleared~${ovCount} age_detached=${detached}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
