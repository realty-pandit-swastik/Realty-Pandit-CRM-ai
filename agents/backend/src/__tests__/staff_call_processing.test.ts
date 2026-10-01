import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
    staffCall: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    task: { create: vi.fn() },
    $transaction: vi.fn(),
}));
vi.mock('../db', () => ({ default: db }));
vi.mock('../services/transcription', () => ({ default: { transcribeAudio: vi.fn() } }));
vi.mock('../services/call_extractor', () => ({ default: { extractFromTranscript: vi.fn() } }));
vi.unmock('../services/audio_storage');

import { autoSavedFields, failStaffCall, processStaffCall, reviewedContactFields } from '../services/staff_call_processing';
import { cleanupOldRecordings } from '../services/audio_storage';

describe('staff call processing', () => {
    beforeEach(() => vi.clearAllMocks());

    it('auto-saves only clear extracted fields and keeps vague calls for review', () => {
        const clear = { intent: 'BUY' as const, role: 'BUYER' as const, location: 'Noida', summary: 'Buyer seeks a flat.', confidence: 0.85 };
        expect(autoSavedFields(clear)).toEqual({ intent: 'buy', preferred_location: 'Noida', ai_summary: clear.summary });
        expect(autoSavedFields({ ...clear, confidence: 0.4 })).toEqual({});
    });

    it('clears rejected AI fields on review while retaining explicit corrections', () => {
        const fields = reviewedContactFields({ intent: null, location: null, budgetMin: null, summary: 'Corrected summary' });
        expect(fields).toMatchObject({ intent: null, preferred_location: null, budget_min: null, ai_summary: 'Corrected summary' });
    });

    it('creates one assigned manual task on processing failure', async () => {
        db.staffCall.findUnique.mockResolvedValue({ id: 'call-1', staff_agent_id: 'agent-1', phone_number: '+911234567890', status: 'TRANSCRIBED' });
        db.staffCall.updateMany.mockResolvedValue({ count: 1 });
        db.$transaction.mockImplementation(async (fn) => fn(db));
        await failStaffCall('call-1', new Error('extractor offline'));
        expect(db.task.create).toHaveBeenCalledWith({ data: expect.objectContaining({ assigned_to: 'agent-1', task_type: 'CALL_PROCESSING_FAILURE' }) });
        db.staffCall.updateMany.mockResolvedValue({ count: 0 });
        await failStaffCall('call-1', new Error('extractor offline'));
        expect(db.task.create).toHaveBeenCalledTimes(1);
    });

    it('does not process a call already claimed by another worker', async () => {
        db.staffCall.findUnique.mockResolvedValue({ id: 'call-1', recording_url: 'uploads/staff_calls/call-1/recording.mp3' });
        db.staffCall.updateMany.mockResolvedValue({ count: 0 });
        await processStaffCall('call-1');
        expect(db.$transaction).not.toHaveBeenCalled();
        expect(db.staffCall.updateMany).toHaveBeenCalledWith({
            where: { id: 'call-1', status: 'PROCESSING' }, data: { status: 'TRANSCRIBED' },
        });
    });

    it('uses review and creation dates for the seven and 30 day cutoffs', async () => {
        db.staffCall.findMany.mockResolvedValue([]);
        const before = Date.now();
        await cleanupOldRecordings();
        const where = db.staffCall.findMany.mock.calls[0][0].where;
        const after = Date.now();
        const reviewed = where.OR[0].submitted_at.lte.getTime();
        const unreviewed = where.OR[1].created_at.lte.getTime();
        expect(reviewed).toBeGreaterThanOrEqual(before - 7 * 86400000);
        expect(reviewed).toBeLessThanOrEqual(after - 7 * 86400000);
        expect(unreviewed).toBeGreaterThanOrEqual(before - 30 * 86400000);
        expect(unreviewed).toBeLessThanOrEqual(after - 30 * 86400000);
    });
});
