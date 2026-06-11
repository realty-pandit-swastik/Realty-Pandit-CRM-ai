/**
 * Phase 1a — idempotent importer for the canonical taxonomy.
 * Reads prisma/data/taxonomy.seed.json (generated from Chat/newtree.xlsx) and upserts
 * TaxonomyNode + FieldDefinition + NodeField. Safe to re-run after taxonomy edits.
 *
 * Run on the server (after `prisma migrate deploy`): npx ts-node prisma/seed_taxonomy.ts
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

interface SeedData {
    fields: { key: string; label: string; input_type: string; unit?: string | null }[];
    nodes: { path: string[]; node_kind: string }[];
    attachments: { type_path: string[]; fields: { field: string; required?: boolean; options?: string[] | null }[] }[];
}

async function main() {
    const data: SeedData = JSON.parse(
        fs.readFileSync(path.join(__dirname, 'data', 'taxonomy.seed.json'), 'utf8'),
    );

    // 1) Field catalog
    const fieldIdByKey: Record<string, string> = {};
    for (const f of data.fields) {
        const row = await prisma.fieldDefinition.upsert({
            where: { key: f.key },
            update: { label: f.label, input_type: f.input_type, unit: f.unit ?? null },
            create: { key: f.key, label: f.label, input_type: f.input_type, unit: f.unit ?? null },
        });
        fieldIdByKey[f.key] = row.id;
    }

    // 2) Nodes (ancestor-ordered in the JSON → parents created before children)
    const nodeIdByPath: Record<string, string> = {};
    for (const n of data.nodes) {
        const name = n.path[n.path.length - 1];
        const parentKey = n.path.slice(0, -1).join('>');
        const parent_id = parentKey ? nodeIdByPath[parentKey] ?? null : null;
        const s = slug(name);
        const existing = await prisma.taxonomyNode.findFirst({ where: { parent_id, slug: s } });
        const row = existing
            ? await prisma.taxonomyNode.update({
                  where: { id: existing.id },
                  data: { name, node_kind: n.node_kind, is_active: true },
              })
            : await prisma.taxonomyNode.create({
                  data: { parent_id, name, slug: s, node_kind: n.node_kind },
              });
        nodeIdByPath[n.path.join('>')] = row.id;
    }

    // 3) Attachments (per-type field schema)
    let attached = 0;
    for (const a of data.attachments) {
        const nodeId = nodeIdByPath[a.type_path.join('>')];
        if (!nodeId) continue;
        let order = 0;
        for (const fa of a.fields) {
            const fieldId = fieldIdByKey[fa.field];
            if (!fieldId) continue;
            await prisma.nodeField.upsert({
                where: { taxonomy_node_id_field_id: { taxonomy_node_id: nodeId, field_id: fieldId } },
                update: { display_order: order, options_override: fa.options ?? undefined },
                create: {
                    taxonomy_node_id: nodeId,
                    field_id: fieldId,
                    display_order: order,
                    required: !!fa.required,
                    options_override: fa.options ?? undefined,
                },
            });
            order++;
            attached++;
        }
    }

    console.log(
        'SEED_TAXONOMY_DONE',
        JSON.stringify({
            nodes: Object.keys(nodeIdByPath).length,
            fields: Object.keys(fieldIdByKey).length,
            attachments: attached,
        }),
    );
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
