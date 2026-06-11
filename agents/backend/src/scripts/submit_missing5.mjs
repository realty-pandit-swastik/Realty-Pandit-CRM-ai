import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const TOKEN = process.env.WHATSAPP_TOKEN;
const WABA = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v25.0'}`;

const templates = [
    {
        name: 'rp_property_card', language: 'en', category: 'UTILITY',
        components: [{
            type: 'HEADER', format: 'IMAGE',
            example: { header_handle: ['https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=800'] },
        }, {
            type: 'BODY',
            text: '{{1}} — {{2}}\n\n{{3}}\n{{4}}\n\n{{5}}',
            example: { body_text: [['3BHK Flat', 'ATS Greens', 'Sector 150, Noida', '75 Lakh', 'Newly renovated, east facing. Gated society with pool and gym.']] },
        }, {
            type: 'BUTTONS',
            buttons: [
                { type: 'QUICK_REPLY', text: 'Call Back' },
                { type: 'QUICK_REPLY', text: 'Schedule Visit' },
                { type: 'QUICK_REPLY', text: 'Next Option' },
            ],
        }],
    },
    {
        name: 'rp_visit_availability', language: 'en', category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Visit ke liye aap kab available hain — please preferred date aur time share karein. Aapki convenience ke hisaab se arrange karenge.',
        }, {
            type: 'BUTTONS',
            buttons: [{ type: 'QUICK_REPLY', text: 'Reply' }],
        }],
    },
    {
        name: 'rp_all_properties_shared', language: 'en', category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Filhaal aapki requirement se match karne wali saari properties share kar di hain. Jaise hi nayi option milegi — turant aapko batayenge. Koi aur help chahiye toh reply karein.',
        }, {
            type: 'BUTTONS',
            buttons: [{ type: 'QUICK_REPLY', text: 'Reply' }],
        }],
    },
    {
        name: 'rp_appt_pending_customer', language: 'en', category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Aapka appointment request hamare paas pahunch gaya hai — hum abhi confirm kar rahe hain. Thodi der mein aapko update mil jaayega.',
        }],
    },
    {
        name: 'rp_negotiation_availability', language: 'en', category: 'UTILITY',
        components: [{
            type: 'BODY',
            text: 'Badhaai! Aapki deal negotiation stage mein hai. Aage badhne ke liye hamaari team aapse ek chhoti meeting karna chahti hai. Aap kab available hain — please preferred date aur time share karein.',
        }, {
            type: 'BUTTONS',
            buttons: [{ type: 'QUICK_REPLY', text: 'Reply' }],
        }],
    },
];

async function submit(t) {
    const r = await fetch(`${GRAPH}/${WABA}/message_templates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(t),
    });
    const j = await r.json();
    if (r.ok) {
        console.log(`OK    ${t.name}  =>  id=${j.id}  status=${j.status}`);
    } else {
        const msg = j?.error?.error_user_msg || j?.error?.message || JSON.stringify(j);
        console.log(`FAIL  ${t.name}  =>  ${msg}`);
    }
    await new Promise(r => setTimeout(r, 1000));
}

(async () => {
    console.log('Submitting 5 missing templates...');
    for (const t of templates) await submit(t);
    console.log('Done.');
})();
