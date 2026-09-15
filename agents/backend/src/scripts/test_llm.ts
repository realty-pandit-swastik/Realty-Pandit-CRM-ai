
import { LLMService } from '../services/llm';
import { SystemPromptService } from '../services/system_prompt';
import dotenv from 'dotenv';

dotenv.config();

async function testLLM() {
    console.log('🧪 Testing Gemini AI Integration...');

    const llm = new LLMService();

    // 1. Test Greeting
    console.log('\n[Test 1] Time-Aware Greeting');
    const greeting = SystemPromptService.getTimeAwareGreeting();
    console.log(`Greeting: ${greeting}`);

    // 2. Test Language Mirroring (Hindi)
    console.log('\n[Test 2] Language Mirroring (Hindi Input)');
    const hindiPrompt = await SystemPromptService.getCoreBehavior();
    const hindiResponse = await llm.generateResponse(hindiPrompt, "Mujhe ek 2 BHK flat chahiye rent par.");
    console.log(`User: Mujhe ek 2 BHK flat chahiye rent par.`);
    console.log(`AI: ${hindiResponse}`);

    // 3. Test Intent Classification
    console.log('\n[Test 3] Intent Classification');
    const intent = await llm.classifyIntent("I want to sell my property in Noida.");
    console.log(`Input: "I want to sell my property in Noida."`);
    console.log(`Classified As: ${intent}`);
}

testLLM();
