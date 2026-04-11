
import axios from 'axios';
import { WhatsAppService } from '../services/whatsapp';

async function testFeatures() {
    console.log('🧪 Testing Rich Media & Inventory API...');

    // 1. Test Inventory API
    try {
        const res = await axios.get('http://localhost:3002/inventory');
        console.log(`✅ GET /inventory status: ${res.status}`);
        if (Array.isArray(res.data)) {
            console.log(`✅ Inventory Count: ${res.data.length}`);
        } else {
            console.error('❌ Inventory response is not an array');
        }
    } catch (e) {
        console.error('❌ GET /inventory failed. Is server running?');
    }

    // 2. Test WhatsApp Image
    const wa = new WhatsAppService();
    console.log('[Test] Sending Mock Image...');
    await wa.sendImage("919999999999", "https://example.com/house.jpg", "A beautiful house");
    console.log('✅ Mock Image log check completed (check console output above)');
}

testFeatures();
