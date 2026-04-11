
import axios from 'axios';

async function main() {
    const url = 'http://127.0.0.1:3002/webhooks/voice';

    // Mock Vapi "End of Call Report" Payload
    const payload = {
        message: {
            type: "end-of-call-report",
            call: {
                id: "call_" + Math.random().toString(36).substring(7),
                status: "completed",
                startedAt: new Date().toISOString(),
                endedAt: new Date().toISOString(),
                durationSeconds: 120
            },
            customer: {
                number: "919876543210"
            },
            transcript: "Assistant: Hello, are you looking to buy or rent? User: I want to buy a 3BHK in Noida.",
            analysis: {
                summary: "User is interested in buying a 3BHK flat in Noida. Budget not specified yet."
            },
            recordingUrl: "https://vapi.ai/recordings/sample.mp3"
        }
    };

    try {
        console.log('Sending Voice Webhook...');
        const response = await axios.post(url, payload);
        console.log(`Status: ${response.status}`);
        console.log('✅ Voice Webhook Sent Successfully');
    } catch (error: any) {
        console.error('❌ Error sending webhook:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

main();
