
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_URL = 'http://localhost:3002/inventory';

async function runTest() {
    console.log('🧪 Testing Inventory Onboarding Flow...');
    const sessionId = uuidv4();

    try {
        // 1. Start Session
        console.log('\n[1] Starting Session...');
        let res = await axios.post(`${API_URL}/session/start`, {
            sessionId: sessionId,
            intent: 'RENT_OUT'
        });
        console.log(`Bot: ${res.data.reply.text}`);
        console.log(`State: ${res.data.state}`);

        // 2. Step: Category -> Residential
        console.log('\n[2] User: Residential');
        res = await axios.post(`${API_URL}/step`, {
            inventorySessionId: sessionId,
            payload: { category: 'RESIDENTIAL' }
        });
        console.log(`Bot: ${res.data.reply.text}`);

        // 3. Step: Type -> Flat
        console.log('\n[3] User: Flat');
        res = await axios.post(`${API_URL}/step`, {
            inventorySessionId: sessionId,
            payload: { type: 'FLAT' }
        });
        console.log(`Bot: ${res.data.reply.text}`);

        // 4. Step: Specs -> 2BHK 1200sqft
        console.log('\n[4] User: 2BHK, 1200 sqft');
        res = await axios.post(`${API_URL}/step`, {
            inventorySessionId: sessionId,
            payload: { bedrooms: 2, area: 1200 }
        });
        console.log(`Bot: ${res.data.reply.text}`);

        // 5. Step: Amenities -> Yes
        console.log('\n[5] User: Yes, all available');
        res = await axios.post(`${API_URL}/step`, {
            inventorySessionId: sessionId,
            payload: { amenities: ['Parking', 'Lift'] }
        });
        console.log(`Bot: ${res.data.reply.text}`);

        // 6. Step: Media -> Skip
        console.log('\n[6] User: Skip');
        res = await axios.post(`${API_URL}/step`, {
            inventorySessionId: sessionId,
            payload: { media: [] }
        });
        console.log(`Bot: ${res.data.reply.text}`);

        // 7. Step: Extra -> None
        console.log('\n[7] User: None');
        res = await axios.post(`${API_URL}/step`, {
            inventorySessionId: sessionId,
            payload: { extra: '' }
        });
        console.log(`Bot (Summary): ${res.data.reply.text}`);

        // 8. Commit
        console.log('\n[8] User: Yes (Confirm)');
        res = await axios.post(`${API_URL}/commit`, {
            inventorySessionId: sessionId,
            confirmed: true
        });
        console.log(`Bot: ${res.data.reply.text}`);

        if (res.data.status === 'CREATED') {
            console.log('\n✅ TEST PASSED: Inventory Created Successfully!');
        } else {
            console.error('\n❌ TEST FAILED: Commit not success.');
        }

    } catch (error) {
        console.error('❌ Error testing flow:', (error as Error).message);
    }
}

// Check if server is up before running
setTimeout(runTest, 2000);
