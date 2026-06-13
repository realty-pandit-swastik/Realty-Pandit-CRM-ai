/**
 * Submit the dealer/partner brochure template `rp_property_brochure_v1` to Meta.
 *
 * DOCUMENT-header UTILITY template — delivers a single-property PDF as a real
 * attachment card in the chat (MakeMyTrip-style "direct PDF"). One message per
 * property; {{1}} = property summary, {{2}} = "1 of 3" sequence.
 *
 * Run on the server from the backend dir:
 *   cd /var/www/realty-pandit/backend && node src/scripts/submit_brochure_template.js
 *
 * Needs WHATSAPP_TOKEN + WHATSAPP_BUSINESS_ACCOUNT_ID in .env. Node 20 (global fetch/Buffer).
 * DOCUMENT header requires a sample header_handle → we generate a tiny sample PDF with pdfkit
 * and push it through the resumable upload API (same flow the v5 image template used).
 * Idempotent: an already-existing name is reported + skipped.
 *
 * ⚠ Category MUST be UTILITY. A wrong category locks the name for 4 weeks
 *   (see runbooks/meta-template-approval.md). Do not submit as MARKETING.
 */
require('dotenv').config();

const TOKEN = process.env.WHATSAPP_TOKEN;
const WABA = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WABA_ID || '2124684824933246';
const V = process.env.WHATSAPP_API_VERSION || 'v25.0';
const BASE = `https://graph.facebook.com/${V}`;

if (!TOKEN) { console.error('Missing WHATSAPP_TOKEN'); process.exit(1); }

// v2: request-fulfillment framing ("As requested … you enquired about") mirrors the
// approved-UTILITY v5 property cards. v1 was auto-reclassified MARKETING (its name is
// now category-locked ~4 weeks); v2 uses the proven UTILITY wording.
const TEMPLATE = {
    name: 'rp_property_brochure_v2',
    language: 'en',
    category: 'UTILITY',
    components: [
        { type: 'HEADER', format: 'DOCUMENT', example: { header_handle: ['__HANDLE__'] } },
        {
            type: 'BODY',
            text:
                'Namaste 🙏 As requested, here are the complete details of the {{1}} (Property {{2}}) you enquired about.\n\n' +
                'Please find the attached brochure with photos, specifications & pricing.\n\n' +
                'Reply here or tap below to schedule a visit. 🙏',
            example: { body_text: [['2 BHK Flat in Vaishali, Ghaziabad', '1 of 3']] },
        },
        { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Schedule Visit' }] },
    ],
};

// Minimal valid sample PDF (any PDF satisfies the DOCUMENT header sample requirement).
function samplePdfBuffer() {
    return new Promise((resolve, reject) => {
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.fontSize(20).text('Property Brochure (sample)', 40, 60);
        doc.fontSize(12).text('Sample document used only for WhatsApp template approval.', 40, 100);
        doc.end();
    });
}

async function getDocumentHandle() {
    const dbg = await (await fetch(`${BASE}/debug_token?input_token=${TOKEN}&access_token=${TOKEN}`)).json();
    const APP_ID = dbg && dbg.data && dbg.data.app_id;
    if (!APP_ID) throw new Error('could not resolve app_id from token: ' + JSON.stringify(dbg));
    const buf = await samplePdfBuffer();
    const start = await (await fetch(
        `${BASE}/${APP_ID}/uploads?file_name=sample.pdf&file_length=${buf.length}&file_type=${encodeURIComponent('application/pdf')}&access_token=${TOKEN}`,
        { method: 'POST' },
    )).json();
    if (!start.id) throw new Error('upload session start failed: ' + JSON.stringify(start));
    const up = await (await fetch(`${BASE}/${start.id}`, {
        method: 'POST', headers: { Authorization: `OAuth ${TOKEN}`, file_offset: '0' }, body: buf,
    })).json();
    if (!up.h) throw new Error('upload bytes failed: ' + JSON.stringify(up));
    console.log(`app_id=${APP_ID}  sample pdf=${buf.length}B  handle OK`);
    return up.h;
}

async function submit(t) {
    const r = await fetch(`${BASE}/${WABA}/message_templates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(t),
    });
    const j = await r.json();
    if (r.ok) {
        console.log(`✓ ${t.name} → status=${j.status || 'PENDING'} id=${j.id || ''} category=${j.category || t.category}`);
    } else {
        const c = j && j.error && j.error.code;
        const s = j && j.error && j.error.error_subcode;
        const m = (j && j.error && j.error.message) || JSON.stringify(j);
        if (c === 100 && (s === 2388023 || /exist/i.test(m))) console.log(`• ${t.name} already exists, skipping`);
        else console.error(`✗ ${t.name} FAILED: code=${c} subcode=${s} msg=${m}`);
    }
}

(async () => {
    const handle = await getDocumentHandle();
    const tpl = JSON.parse(JSON.stringify(TEMPLATE).replace('__HANDLE__', handle));
    console.log(`Submitting ${tpl.name} (DOCUMENT/UTILITY) to WABA ${WABA}...`);
    await submit(tpl);
    console.log('Done. Approval typically takes minutes–hours; verify with:');
    console.log(`  GET ${BASE}/${WABA}/message_templates?fields=name,status,category&access_token=$WHATSAPP_TOKEN`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
