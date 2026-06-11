/**
 * Submit the 8 v5 property-share templates (Image header + body w/ link + 3 quick-reply buttons) to Meta.
 *
 * Run on the server from the backend dir:
 *   cd /var/www/realty-pandit/backend && node src/scripts/submit_property_templates_v5.js
 *
 * Needs WHATSAPP_TOKEN + WHATSAPP_BUSINESS_ACCOUNT_ID in .env. Node 20 (global fetch/Buffer).
 * IMAGE header requires a sample header_handle → obtained via the resumable upload API on the
 * app the token belongs to (auto-detected via debug_token). Idempotent: existing names are skipped.
 */
require('dotenv').config();

const TOKEN = process.env.WHATSAPP_TOKEN;
const WABA = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || process.env.WABA_ID || '2124684824933246';
const V = process.env.WHATSAPP_API_VERSION || 'v25.0';
const BASE = `https://graph.facebook.com/${V}`;
const SAMPLE_IMG = 'https://realtypandit.in/logo.png';
const LINK = 'https://www.realtypandit.in/properties/RP-GZB-RES-20471';

if (!TOKEN) { console.error('Missing WHATSAPP_TOKEN'); process.exit(1); }

const BUTTONS = {
    type: 'BUTTONS',
    buttons: [
        { type: 'QUICK_REPLY', text: 'Call Back' },
        { type: 'QUICK_REPLY', text: 'Schedule Visit' },
        { type: 'QUICK_REPLY', text: 'Next Option' },
    ],
};

// Build one template definition. handle = sample image header_handle.
function mk(handle, name, intent, o) {
    const priceLine = intent === 'rent' ? '💰 Rent: ₹{{3}}/month' : '💰 Price: ₹{{3}}';
    const text =
        `Namaste 🙏 As requested, here are the details of the ${o.subject} you enquired about:\n\n` +
        `${o.i1} {{1}}\n📍 {{2}}\n${priceLine}\n${o.i4} {{4}}\n${o.i5} {{5}}\n${o.i6} {{6}}\n\n` +
        `🔗 View photos & full details:\n{{7}}\n\n` +
        `Reply here or tap a button below to schedule a ${o.visit}. 🙏`;
    return {
        name, language: 'en', category: 'UTILITY',
        components: [
            { type: 'HEADER', format: 'IMAGE', example: { header_handle: [handle] } },
            { type: 'BODY', text, example: { body_text: [o.ex(intent)] } },
            BUTTONS,
        ],
    };
}

// per-category copy + icons + example values
const CATS = {
    res: { subject: 'residential property', i1: '🏡', i4: '📐', i5: '🛋', i6: '🏢', visit: 'visit',
        ex: (i) => i === 'rent'
            ? ['2 BHK Flat', 'Indirapuram, Ghaziabad', '25,000', '1050 sqft', 'Semi-Furnished', '2nd Floor', LINK]
            : ['2 BHK Builder Floor', 'Sector 5, Vaishali, Ghaziabad', '40.5 Lakh', '550 sqft', 'Semi-Furnished', '3rd Floor', LINK] },
    resPlot: { subject: 'residential plot', i1: '🏞', i4: '📐', i5: '🧭', i6: '📜', visit: 'site visit',
        ex: (i) => i === 'rent'
            ? ['Residential Plot', 'Indirapuram, Ghaziabad', '35,000', '200 Sq Yard', 'East · Road-facing', 'Freehold', LINK]
            : ['Residential Plot', 'Indirapuram, Ghaziabad', '9.0 Cr', '350 Sq Meter', 'North-East · Road-facing', 'Freehold · Boundary wall', LINK] },
    com: { subject: 'commercial property', i1: '🏢', i4: '📐', i5: '🪑', i6: '🚻', visit: 'visit',
        ex: (i) => i === 'rent'
            ? ['Office Space', 'Indirapuram, Ghaziabad', '70,000', '1200 sqft · Built-up', 'Unfurnished', '1 Washroom', LINK]
            : ['Retail Shop', 'Vaishali, Ghaziabad', '1.1 Cr', '1152 sqft', 'Unfurnished', 'Ground Floor', LINK] },
    comPlot: { subject: 'commercial land', i1: '🏗', i4: '📐', i5: '🧭', i6: '📜', visit: 'site visit',
        ex: (i) => i === 'rent'
            ? ['Commercial Land', 'Ghaziabad', '1.5 Lakh', '2000 Sq Yard', 'East · Road-facing', 'Freehold', LINK]
            : ['Commercial Land', 'Ghaziabad', '12.5 Cr', '5000 Sq Yard', 'East · Road-facing', 'Freehold · Boundary wall', LINK] },
};

function buildTemplates(handle) {
    return [
        mk(handle, 'rp_property_card_res_sale_v5', 'sell', CATS.res),
        mk(handle, 'rp_property_card_res_rent_v5', 'rent', CATS.res),
        mk(handle, 'rp_property_card_res_plot_sale_v5', 'sell', CATS.resPlot),
        mk(handle, 'rp_property_card_res_plot_rent_v5', 'rent', CATS.resPlot),
        mk(handle, 'rp_property_card_com_sale_v5', 'sell', CATS.com),
        mk(handle, 'rp_property_card_com_rent_v5', 'rent', CATS.com),
        mk(handle, 'rp_property_card_com_plot_sale_v5', 'sell', CATS.comPlot),
        mk(handle, 'rp_property_card_com_plot_rent_v5', 'rent', CATS.comPlot),
    ];
}

async function getHeaderHandle() {
    const dbg = await (await fetch(`${BASE}/debug_token?input_token=${TOKEN}&access_token=${TOKEN}`)).json();
    const APP_ID = dbg && dbg.data && dbg.data.app_id;
    if (!APP_ID) throw new Error('could not resolve app_id from token: ' + JSON.stringify(dbg));
    const img = await fetch(SAMPLE_IMG);
    if (!img.ok) throw new Error('sample image fetch failed: ' + img.status);
    const buf = Buffer.from(await img.arrayBuffer());
    const ct = img.headers.get('content-type') || 'image/png';
    const start = await (await fetch(`${BASE}/${APP_ID}/uploads?file_name=sample&file_length=${buf.length}&file_type=${encodeURIComponent(ct)}&access_token=${TOKEN}`, { method: 'POST' })).json();
    if (!start.id) throw new Error('upload session start failed: ' + JSON.stringify(start));
    const up = await (await fetch(`${BASE}/${start.id}`, { method: 'POST', headers: { Authorization: `OAuth ${TOKEN}`, file_offset: '0' }, body: buf })).json();
    if (!up.h) throw new Error('upload bytes failed: ' + JSON.stringify(up));
    console.log(`app_id=${APP_ID}  sample image=${ct} ${buf.length}B  handle OK`);
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
        console.log(`✓ ${t.name} → status=${j.status || 'PENDING'} id=${j.id || ''}`);
    } else {
        const c = j && j.error && j.error.code;
        const s = j && j.error && j.error.error_subcode;
        const m = (j && j.error && j.error.message) || JSON.stringify(j);
        if (c === 100 && (s === 2388023 || /exist/i.test(m))) console.log(`• ${t.name} already exists, skipping`);
        else console.error(`✗ ${t.name} FAILED: code=${c} subcode=${s} msg=${m}`);
    }
}

(async () => {
    const handle = await getHeaderHandle();
    const templates = buildTemplates(handle);
    console.log(`Submitting ${templates.length} v5 property templates to WABA ${WABA}...`);
    for (const t of templates) await submit(t);
    console.log('Done. Approval typically takes minutes–hours; check WhatsApp Manager → Message templates.');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
