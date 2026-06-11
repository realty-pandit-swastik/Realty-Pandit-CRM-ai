import { describe, it, expect } from 'vitest';
import { detectLanguageFromTranscript } from '../services/tool_language';

describe('detectLanguageFromTranscript', () => {
    it('detects pure English', () => {
        const t = 'Good morning. Please show me my leads today. Thanks.';
        expect(detectLanguageFromTranscript(t)).toBe('en');
    });

    it('detects pure romanized Hindi', () => {
        const t = 'Namaste Panditji, mujhe aaj ke appointments batao. Shukriya.';
        expect(detectLanguageFromTranscript(t)).toBe('hi');
    });

    it('detects Hinglish mix', () => {
        const t = 'Good morning Panditji, mere leads dikhao aur priority wale first please.';
        expect(detectLanguageFromTranscript(t)).toBe('hi_en');
    });

    it('defaults to hi_en when transcript is empty', () => {
        expect(detectLanguageFromTranscript('')).toBe('hi_en');
    });

    it('defaults to hi_en when no hint words found', () => {
        expect(detectLanguageFromTranscript('foo bar baz qux')).toBe('hi_en');
    });
});
