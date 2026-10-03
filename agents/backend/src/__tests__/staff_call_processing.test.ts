import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
    staffCall: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    task: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    contact: { findUnique: vi.fn(), update: vi.fn() },
    interaction: { create: vi.fn() },
    $transaction: vi.fn(),
}));
vi.mock('../db', () => ({ default: db }));
vi.mock('../services/transcription', () => ({ default: { transcribeAudio: vi.fn() } }));
vi.mock('../services/call_extractor', () => ({ default: { extractFromTranscript: vi.fn() } }));
vi.unmock('../services/audio_storage');

import transcriptionService from '../services/transcription';
import callExtractor from '../services/call_extractor';
import { autoSavedFields, closeCallReviewTask, failStaffCall, lakhsToRupees, processStaffCall, recoverExhaustedStaffCalls, reviewedContactFields } from '../services/staff_call_processing';
import { cleanupOldRecordings } from '../services/audio_storage';

describe('staff call processing', () => {
    beforeEach(() => vi.clearAllMocks());

    it('never auto-saves authoritative requirements before review', () => {
        const clear = { intent: 'BUY' as const, role: 'BUYER' as const, location: 'Noida', summary: 'Buyer seeks a flat.', confidence: 0.85 };
        expect(autoSavedFields(clear)).toEqual({});
        expect(autoSavedFields({ ...clear, confidence: 0.4 })).toEqual({});
    });

    it('clears rejected AI fields on review while retaining explicit corrections', () => {
        const fields = reviewedContactFields({ intent: null, location: null, budgetMin: null, summary: 'Corrected summary' });
        expect(fields).toMatchObject({ intent: null, preferred_location: null, budget_min: null, ai_summary: 'Corrected summary' });
    });

    it('creates one assigned manual task on processing failure', async () => {
        db.staffCall.findUnique.mockResolvedValue({ id: 'call-1', staff_agent_id: 'agent-1', phone_number: '+911234567890', status: 'TRANSCRIBED', processing_attempts: 3 });
        db.staffCall.updateMany.mockResolvedValue({ count: 1 });
        db.$transaction.mockImplementation(async (fn) => fn(db));
        db.task.findFirst.mockResolvedValue(null);
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
            where: expect.objectContaining({ id: 'call-1', processing_attempts: { lt: 3 }, OR: expect.any(Array) }), data: expect.objectContaining({ status: 'TRANSCRIBED', processing_claim_token: expect.any(String) }),
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
    it('retention windows are configurable and fall back to 7 / 30 days on bad values', async () => {
        db.staffCall.findMany.mockResolvedValue([]);
        process.env.CALL_AUDIO_RETENTION_REVIEWED_DAYS = '1';
        process.env.CALL_AUDIO_RETENTION_UNREVIEWED_DAYS = 'abc';
        try {
            const before = Date.now();
            await cleanupOldRecordings();
            const where = db.staffCall.findMany.mock.calls[0][0].where;
            expect(where.OR[0].submitted_at.lte.getTime()).toBeGreaterThanOrEqual(before - 86400000);
            expect(where.OR[0].submitted_at.lte.getTime()).toBeLessThanOrEqual(Date.now() - 86400000);
            expect(where.OR[1].created_at.lte.getTime()).toBeLessThanOrEqual(Date.now() - 30 * 86400000);
        } finally {
            delete process.env.CALL_AUDIO_RETENTION_REVIEWED_DAYS;
            delete process.env.CALL_AUDIO_RETENTION_UNREVIEWED_DAYS;
        }
    });

    it('converts extracted lakhs to rupees where call data enters the contact', () => {
        expect(lakhsToRupees(50)).toBe(5000000);
        expect(lakhsToRupees(1.5)).toBe(150000);
        expect(lakhsToRupees(null)).toBeNull();
        expect(lakhsToRupees(undefined)).toBeUndefined();
        const saved = autoSavedFields({ intent: 'BUY', role: 'BUYER', budgetMin: 40, budgetMax: 60, summary: 's', confidence: 0.9 });
        expect(saved).toEqual({});
        expect(reviewedContactFields({ budgetMin: 40, budgetMax: 60 })).toMatchObject({ budget_min: 4000000, budget_max: 6000000 });
        expect(reviewedContactFields({ budgetMax: 120 })).toMatchObject({ budget_max: 12000000 });
        expect(reviewedContactFields({ budgetMax: null })).toMatchObject({ budget_max: null });
    });

    it('creates exactly one verification task when a call reaches review, HIGH when intent is unclear', async () => {
        db.staffCall.findUnique.mockResolvedValue({
            id: 'call-9', recording_url: 'uploads/staff_calls/call-9/recording.mp3', phone_number: '+911234567890',
            tenant_id: 't1', staff_agent_id: 'agent-1', classification: 'INBOUND', transcript: null,
        });
        db.staffCall.updateMany.mockResolvedValue({ count: 1 });
        db.contact.findUnique.mockResolvedValue({ phone_number: '+911234567890' });
        db.$transaction.mockImplementation(async (fn) => fn(db));
        (transcriptionService.transcribeAudio as any).mockResolvedValue({ text: 'hello' });
        (callExtractor.extractFromTranscript as any).mockResolvedValue({ intent: 'OTHER', role: 'UNKNOWN', summary: 'unclear', confidence: 0.4 });

        db.task.findFirst.mockResolvedValue(null);
        await processStaffCall('call-9');
        expect(db.contact.update).not.toHaveBeenCalled();
        expect(db.staffCall.update).toHaveBeenCalledWith(expect.objectContaining({ data: { staff_edited_data: { source: 'ai_call', review_status: 'PENDING', draft_only: true } } }));
        expect(db.task.create).toHaveBeenCalledWith({ data: expect.objectContaining({
            task_type: 'CALL_REVIEW', assigned_to: 'agent-1', priority: 'HIGH', stage_metadata: { call_id: 'call-9', source: 'call_processor' },
        }) });

        db.task.create.mockClear();
        db.task.findFirst.mockResolvedValue({ id: 'existing' });
        await processStaffCall('call-9');
        expect(db.task.create).not.toHaveBeenCalled();
    });

    it('stale transcription workers cannot extract or save after losing their claim', async () => {
        db.staffCall.findUnique.mockResolvedValue({ id: 'c1', recording_url: 'uploads/staff_calls/c1/recording.mp3', transcript: 'Synthetic transcript' });
        db.staffCall.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValue({ count: 0 });
        await processStaffCall('c1');
        expect(callExtractor.extractFromTranscript).not.toHaveBeenCalled();
        expect(db.task.create).not.toHaveBeenCalled();
    });
    it('interrupted final attempts become visible manual-retry failures', async () => {
        const call = { id: 'c1', status: 'TRANSCRIBED', processing_attempts: 3, processing_claim_token: 'expired-token', staff_agent_id: 'a1', phone_number: '+919800000001' };
        db.staffCall.findMany.mockResolvedValue([call]);
        db.staffCall.findUnique.mockResolvedValue(call);
        db.staffCall.updateMany.mockResolvedValue({ count: 1 });
        db.task.findFirst.mockResolvedValue(null);
        db.$transaction.mockImplementation(async fn => fn(db));
        await recoverExhaustedStaffCalls();
        expect(db.staffCall.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ processing_claim_token: 'expired-token' }), data: expect.objectContaining({ status: 'PROCESSING', processing_claim_token: null }) }));
        expect(db.task.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ task_type: 'CALL_PROCESSING_FAILURE', assigned_to: 'a1' }) }));
    });

    it('closes the verification task for a call', async () => {
        await closeCallReviewTask('call-9');
        expect(db.task.updateMany).toHaveBeenCalledWith({
            where: { task_type: 'CALL_REVIEW', status: { not: 'DONE' }, stage_metadata: { path: ['call_id'], equals: 'call-9' } },
            data: { status: 'DONE' },
        });
    });
});
