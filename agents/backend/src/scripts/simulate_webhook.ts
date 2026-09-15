import 'dotenv/config';
import axios from 'axios';

async function main() {
    const url = 'http://127.0.0.1:3002/webhooks/whatsapp';

    // Mock Payload from WhatsApp Cloud API
    const payload = {
        object: 'whatsapp_business_account',
        entry: [{
            id: '12345',
            changes: [{
                value: {
                    messaging_product: 'whatsapp',
                    metadata: { display_phone_number: '1234567890', phone_number_id: '1234567890' },
                    contacts: [{ profile: { name: 'Demo Buyer' }, wa_id: '919876543211' }],
                    messages: [{
                        from: '919876543211',
                        id: 'wamid.HBgMOTE5ODc2NTQzMjExFQIAERgSRTI5QjE4NzlCMTIxQjJFMkZGAA==',
                        timestamp: '1686543211',
                        text: { body: 'Hello, I am looking to buy a 3BHK flat in Indirapuram.' },
                        type: 'text'
                    }]
                },
                field: 'messages'
            }]
        }]
    };

    try {
        console.log('Sending Webhook...');
        const res = await axios.post(url, payload);
        console.log(`Status: ${res.status}`);

        if (res.status === 200) {
            console.log('✅ Webhook delivery successful.');
        } else {
            console.error('❌ Webhook failed.');
        }

    } catch (error) {
        console.error('❌ Connection refused. Is the server running?');
        // console.error(error);
    }
}

main();
