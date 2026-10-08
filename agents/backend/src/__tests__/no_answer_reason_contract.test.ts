import { describe, it, expect } from 'vitest';

/**
 * Cross-package contract for the no-answer reason.
 *
 * The reason code list lives in TWO independently deployed apps (backend route + CRM
 * dropdown) with no shared module, and the CRM makes the field REQUIRED — so a drift or
 * rename silently degrades every logged no-answer. This test runs in the backend suite (the
 * only package with a test runner) and imports the frontend helper directly, because both are
 * plain TS with no DOM/React dependency.
 *
 * It also covers the label mappers, which the CRM cannot test on its own (no test script).
 */
import { VALID_NO_ANSWER_REASONS } from '../routes/deals';
import {
    NO_ANSWER_REASON_CODES,
    NO_ANSWER_REASON_LABEL,
    NO_ANSWER_REASONS,
    noAnswerReasonLabel,
    type NoAnswerReason,
} from '../../../frontend/src/lib/callOutcomes';

describe('no-answer reason — backend/frontend parity', () => {
    it('the backend allowlist and the CRM dropdown are the same codes in the same order', () => {
        expect([...VALID_NO_ANSWER_REASONS]).toEqual([...NO_ANSWER_REASON_CODES]);
    });

    it('the dropdown offers exactly one entry per code, labelled', () => {
        expect(NO_ANSWER_REASONS).toHaveLength(NO_ANSWER_REASON_CODES.length);
        expect(new Set(NO_ANSWER_REASONS.map(r => r.code)).size).toBe(NO_ANSWER_REASON_CODES.length);
        for (const r of NO_ANSWER_REASONS) {
            expect(r.label, `${r.code} needs a label`).toBeTruthy();
            expect(NO_ANSWER_REASON_LABEL[r.code]).toBe(r.label);
        }
    });
});

describe('noAnswerReasonLabel', () => {
    it('labels the "<BASE>:<REASON>" form the backend writes', () => {
        expect(noAnswerReasonLabel('NO_ANSWER:BUSY')).toBe('Busy / waiting');
        expect(noAnswerReasonLabel('CLOSED_UNREACHABLE:WRONG_NUMBER')).toBe('Wrong number / doesn’t exist');
        expect(noAnswerReasonLabel('NO_ANSWER:SWITCHED_OFF')).toBe('Switched off');
        expect(noAnswerReasonLabel('NO_ANSWER:NOT_REACHABLE')).toBe('Not reachable');
        expect(noAnswerReasonLabel('NO_ANSWER:DISCONNECTED')).toBe('Disconnected / hanged / cut');
    });

    it('labels a bare reason code (rows written before the prefix existed)', () => {
        expect(noAnswerReasonLabel('BUSY')).toBe('Busy / waiting');
        expect(noAnswerReasonLabel('busy')).toBe('Busy / waiting');
    });

    it('falls back to a readable form for every other value in the column', () => {
        // Legacy log-call outcomes.
        expect(noAnswerReasonLabel('NO_ANSWER')).toBe('no answer');
        expect(noAnswerReasonLabel('ANSWERED_INTERESTED')).toBe('answered interested');
        // The reminder service writes a human sentence here.
        expect(noAnswerReasonLabel('Reminder for 8 Oct, 10:49 pm')).toBe('reminder for 8 oct, 10:49 pm');
        // The WRONG_OR_SPAM reason — must NOT be relabelled as a no-answer.
        expect(noAnswerReasonLabel('SPAM')).toBe('spam');
        expect(noAnswerReasonLabel('BANKER_VALUER')).toBe('banker valuer');
    });

    it('returns null for empty values so callers can skip rendering', () => {
        expect(noAnswerReasonLabel(null)).toBeNull();
        expect(noAnswerReasonLabel(undefined)).toBeNull();
        expect(noAnswerReasonLabel('')).toBeNull();
    });

    it('cannot be fooled into echoing an Object.prototype member', () => {
        // Guards the display column against a crafted stored value.
        for (const evil of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
            const out = noAnswerReasonLabel(evil);
            expect(out, evil).not.toContain('function');
            expect(typeof out).toBe('string');
        }
    });

    it('leaves an unknown suffix as readable text instead of blanking it', () => {
        expect(noAnswerReasonLabel('NO_ANSWER:SOMETHING_NEW')).toBe('no answer:something new');
    });
});

describe('noAnswerReasonLabel accepts every code the backend can send', () => {
    it('maps each allow-listed code to a distinct human label', () => {
        const labels = VALID_NO_ANSWER_REASONS.map(
            (c) => noAnswerReasonLabel(`NO_ANSWER:${c}`) as string,
        );
        expect(labels.every(l => typeof l === 'string' && l.length > 0)).toBe(true);
        expect(new Set(labels).size).toBe(VALID_NO_ANSWER_REASONS.length);
        // Never fall through to the raw-code fallback.
        for (const c of VALID_NO_ANSWER_REASONS) {
            expect(noAnswerReasonLabel(`NO_ANSWER:${c}`)).toBe(NO_ANSWER_REASON_LABEL[c as NoAnswerReason]);
        }
    });
});