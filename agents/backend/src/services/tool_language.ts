import prisma from '../db';
import { phoneVariants } from '../utils/phone';
import logger from '../utils/logger';

// Simple word-level classifier — good enough as a dynamic learner that
// overwrites every call. Over many calls it converges to the caller's
// dominant mode.

const ENGLISH_HINT_WORDS = new Set([
    'the','is','you','your','please','thanks','thank','good','morning','evening','afternoon',
    'night','hello','hi','yes','no','ok','okay','sure','done','call','show','send','tell','me','my',
    'leads','task','tasks','appointments','schedule','callback','property','client','check','update',
    'today','now','next','first','last','all','for','with','about','help','need','want','would',
]);

const HINDI_HINT_WORDS = new Set([
    'main','aap','ka','ki','ke','hai','hain','hoon','tha','thi','kya','kaun','kab','kaise','kahan',
    'namaste','shukriya','dhanyawad','bhai','ji','haan','nahi','bilkul','abhi','kal','aaj',
    'mujhe','tumhe','unhe','batao','dikhao','bhejo','lagao','karna','kar','raha','rahi',
    'mere','tere','unke','iske','uske','wala','wali','kuch','sab','thoda','zyada','kam',
]);

export function detectLanguageFromTranscript(transcript: string): 'hi' | 'en' | 'hi_en' {
    if (!transcript || transcript.trim().length === 0) return 'hi_en';

    const words = transcript.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    let en = 0, hi = 0;
    for (const w of words) {
        if (ENGLISH_HINT_WORDS.has(w)) en++;
        else if (HINDI_HINT_WORDS.has(w)) hi++;
    }

    const total = en + hi;
    if (total === 0) return 'hi_en';

    const enShare = en / total;
    const hiShare = hi / total;

    if (enShare > 0.8) return 'en';
    if (hiShare > 0.8) return 'hi';
    return 'hi_en';
}

export async function updateAgentLanguagePreference(phone: string, transcript: string): Promise<void> {
    const lang = detectLanguageFromTranscript(transcript);
    const variants = phoneVariants(phone);
    try {
        const updated = await prisma.agent.updateMany({
            where: { phone: { in: variants }, status: 'active' },
            data: { preferred_language: lang },
        });
        if (updated.count > 0) {
            logger.info(`[LangLearn] ${phone} → preferred_language=${lang}`);
        }
    } catch (err) {
        logger.error(`[LangLearn] failed to update ${phone}:`, err);
    }
}
