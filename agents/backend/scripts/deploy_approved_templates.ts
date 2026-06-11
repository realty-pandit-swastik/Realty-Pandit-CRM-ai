/**
 * Deploy Approved Templates
 *
 * Checks if all 8 new templates are approved on Meta.
 * If ALL are approved, redeploys updated whatsapp_templates.ts to the server
 * and restarts PM2.
 *
 * Run: npx ts-node --project tsconfig.json scripts/deploy_approved_templates.ts
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { execSync } from 'child_process';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TOKEN = process.env.WHATSAPP_TOKEN;

if (!TOKEN) {
    console.error('Missing WHATSAPP_TOKEN');
    process.exit(1);
}

const TEMPLATES_TO_CHECK = [
    { id: '924610597067782',  oldName: 'rp_buyer_lead_received_v2',   newName: 'rp_buyer_lead_received_v3' },
    { id: '1534014075098547', oldName: 'rp_welcome_buyer_v3',         newName: 'rp_welcome_buyer_v4' },
    { id: '1483900190058192', oldName: 'rp_welcome_seller_v3',        newName: 'rp_welcome_seller_v4' },
    { id: '2113643889478517', oldName: 'rp_reopen_session_v3',        newName: 'rp_reopen_session_v4' },
    { id: '1268315518825647', oldName: 'rp_appointment_confirm',      newName: 'rp_appointment_confirm_v2' },
    { id: '2025851754997429', oldName: 'rp_visit_agent_notify_v3',    newName: 'rp_visit_agent_notify_v4' },
    { id: '2410715229447096', oldName: 'rp_tx_lead_assigned_v2',      newName: 'rp_tx_lead_assigned_v3' },
    { id: '1925621928139437', oldName: 'rp_tx_followup_new_v2',       newName: 'rp_tx_followup_new_v3' },
];

async function checkStatus(id: string): Promise<string> {
    try {
        const res = await axios.get(
            `https://graph.facebook.com/v25.0/${id}?fields=name,status`,
            { headers: { Authorization: `Bearer ${TOKEN}` } },
        );
        return res.data?.status || 'UNKNOWN';
    } catch {
        return 'ERROR';
    }
}

async function main() {
    console.log('\nChecking approval status of 8 new templates...\n');

    const results = await Promise.all(
        TEMPLATES_TO_CHECK.map(async t => ({
            ...t,
            status: await checkStatus(t.id),
        })),
    );

    for (const r of results) {
        const icon = r.status === 'APPROVED' ? '✅' : r.status === 'PENDING' ? '⏳' : '❌';
        console.log(`  ${icon} ${r.newName.padEnd(42)} ${r.status}`);
    }

    const allApproved = results.every(r => r.status === 'APPROVED');
    const pending = results.filter(r => r.status === 'PENDING');
    const rejected = results.filter(r => r.status === 'REJECTED');

    console.log();

    if (rejected.length > 0) {
        console.log('❌ Some templates were REJECTED by Meta:');
        for (const r of rejected) {
            console.log(`   ${r.newName}`);
        }
        console.log('   Review content and resubmit via submit_improved_templates.ts');
        process.exit(1);
    }

    if (pending.length > 0) {
        console.log(`⏳ ${pending.length} template(s) still PENDING — run this script again in a few minutes.`);
        process.exit(0);
    }

    if (allApproved) {
        console.log('✅ All 8 templates APPROVED — deploying updated registry to server...\n');

        const localFile = path.resolve(__dirname, '../src/config/whatsapp_templates.ts');
        const serverFile = '/var/www/realty-pandit/backend/src/config/whatsapp_templates.ts';
        const keyPath = 'C:/Users/Varchasv Bhardwaj/.ssh/realty_pandit_key';
        const host = 'root@72.62.231.224';

        try {
            execSync(
                `scp -i "${keyPath}" -o StrictHostKeyChecking=no "${localFile}" ${host}:${serverFile}`,
                { stdio: 'inherit' },
            );
            console.log('✅ Registry deployed');

            execSync(
                `ssh -i "${keyPath}" -o StrictHostKeyChecking=no ${host} "pm2 restart realty-backend"`,
                { stdio: 'inherit' },
            );
            console.log('✅ PM2 restarted — new templates are live!');
        } catch (err) {
            console.error('Deploy failed:', err);
            process.exit(1);
        }
    }
}

main().catch(e => { console.error(e); process.exit(1); });
