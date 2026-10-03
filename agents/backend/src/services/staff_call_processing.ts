import { randomUUID } from 'crypto';
import prisma from '../db';
import transcriptionService from './transcription';
import callExtractor, { ExtractedCallData } from './call_extractor';
import logger from '../utils/logger';

/**
 * The extractor and the review screen speak lakhs; Contact/Transaction budgets and inventory prices
 * are rupees (matching compares them directly). Convert exactly where call data enters a CRM entity.
 */
export function lakhsToRupees(value: number | null | undefined): number | null | undefined {
    return value == null ? value : Math.round(Number(value) * 100000);
}

// All extraction remains a draft until staff approval (including high confidence calls).
export function autoSavedFields(_data: ExtractedCallData): Record<string, unknown> { return {}; }

export function reviewedContactFields(data: Record<string, any>) {
    return {
        contact_type: data.role === null ? 'UNKNOWN' : data.role || undefined,
        intent: data.intent === null ? null : data.intent?.toLowerCase() || undefined,
        property_type: data.propertyType === null ? null : data.propertyType || undefined,
        budget_min: data.budgetMin === null ? null : lakhsToRupees(data.budgetMin) ?? undefined,
        budget_max: data.budgetMax === null ? null : lakhsToRupees(data.budgetMax) ?? undefined,
        preferred_location: data.location === null ? null : data.location || undefined,
        ai_summary: data.summary === null ? null : data.summary || undefined,
    };
}

export async function processStaffCall(callId: string): Promise<void> {
    const call = await prisma.staffCall.findUnique({ where: { id: callId } });
    if (!call?.recording_url) throw new Error('Call recording missing');
    const token = randomUUID();
    const claimed = await prisma.staffCall.updateMany({
        where: { id: callId, processing_attempts: { lt: 3 }, OR: [
            { status: 'PROCESSING', processing_claim_token: null },
            { status: 'TRANSCRIBED', processing_claimed_at: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
            { status: 'TRANSCRIBED', processing_claimed_at: null },
        ] },
        data: { status: 'TRANSCRIBED', processing_claim_token: token, processing_claimed_at: new Date(), processing_attempts: { increment: 1 }, processing_error: null },
    });
    if (!claimed.count) return;
    const heartbeat = setInterval(() => prisma.staffCall.updateMany({
        where: { id: callId, status: 'TRANSCRIBED', processing_claim_token: token },
        data: { processing_claimed_at: new Date() },
    }).catch(error => logger.warn('[StaffCall] Lease renewal failed', error)), 60_000);
    heartbeat.unref();
    try {
    const transcript = call.transcript || (await transcriptionService.transcribeAudio(
        call.recording_url, { language: 'auto' },
    ))?.text;
    if (!transcript?.trim()) throw new Error('Transcription failed or returned empty');
    const stillOwned = await prisma.staffCall.updateMany({ where: { id: callId, status: 'TRANSCRIBED', processing_claim_token: token }, data: { transcript, processing_claimed_at: new Date() } });
    if (!stillOwned.count) return;
    const extracted = await callExtractor.extractFromTranscript(transcript, call.phone_number);

    await prisma.$transaction(async (tx) => {
        const finalized = await tx.staffCall.updateMany({
            where: { id: callId, status: 'TRANSCRIBED', processing_claim_token: token },
            data: { ai_extraction: extracted as any, confidence_score: extracted.confidence, status: 'READY_FOR_REVIEW', processing_claim_token: null, processing_claimed_at: null },
        });
        if (!finalized.count) return;
        await tx.task.updateMany({ where: { task_type: 'CALL_PROCESSING_FAILURE', stage_metadata: { path: ['call_id'], equals: callId } }, data: { status: 'DONE' } });
        await tx.staffCall.update({ where: { id: callId }, data: {
            staff_edited_data: { source: 'ai_call', review_status: 'PENDING', draft_only: true } as any,
        } });
        const reviewTaskExists = await tx.task.findFirst({
            where: { task_type: 'CALL_REVIEW', stage_metadata: { path: ['call_id'], equals: callId } }, select: { id: true },
        });
        if (!reviewTaskExists) {
            const unclear = extracted.confidence < 0.7 || !extracted.intent || extracted.intent === 'OTHER';
            await tx.task.create({ data: {
                title: `Verify ${call.classification === 'INBOUND' ? 'inbound' : 'outbound'} call: ${call.phone_number}`,
                description: `AI notes are ready for review (${extracted.intent || 'no intent'}, confidence ${Math.round(extracted.confidence * 100)}%). Approve to add the requirement to the CRM.`,
                assigned_to: call.staff_agent_id, contact_phone: call.phone_number,
                due_date: new Date(Date.now() + 4 * 3600 * 1000), priority: unclear ? 'HIGH' : 'MEDIUM',
                tags: ['call-review'], task_type: 'CALL_REVIEW',
                stage_metadata: { call_id: callId, source: 'call_processor' },
            } });
        }
        await tx.interaction.create({ data: {
            tenant_id: call.tenant_id,
            phone_number: call.phone_number,
            channel: 'staff_call', direction: call.classification === 'INBOUND' ? 'inbound' : 'outbound',
            event_type: 'ai_extraction', content: extracted.summary,
            metadata: { call_id: callId, source: 'ai_call', review_status: 'PENDING', draft_only: true } as any,
        } });
    });
    } catch (error) { await failStaffCall(callId, error as Error, token); }
    finally { clearInterval(heartbeat); }
}

/** Interrupted final attempts become visible manual-retry work rather than stranded leases. */
export async function recoverExhaustedStaffCalls(): Promise<void> {
    const calls = await prisma.staffCall.findMany({ where: { status: 'TRANSCRIBED', processing_attempts: { gte: 3 }, OR: [
        { processing_claimed_at: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
        { processing_claimed_at: null },
    ] }, take: 10 });
    for (const call of calls) await failStaffCall(call.id, new Error('Final processing attempt was interrupted; manual retry required'), call.processing_claim_token ?? undefined);
}

export async function failStaffCall(callId: string, error: Error, token?: string): Promise<void> {
    const call = await prisma.staffCall.findUnique({ where: { id: callId } });
    if (!call || !['PROCESSING', 'TRANSCRIBED'].includes(call.status)) return;
    await prisma.$transaction(async (tx) => {
        const claimed = await tx.staffCall.updateMany({ where: { id: callId, status: { in: ['PROCESSING', 'TRANSCRIBED'] }, processing_claim_token: token ?? call.processing_claim_token ?? null }, data: { status: 'PROCESSING', processing_claim_token: null, processing_claimed_at: null, processing_error: error.message } });
        if (!claimed.count) return;
        if ((call.processing_attempts ?? 0) < 3) return;
        const existing = await tx.task.findFirst({ where: { task_type: 'CALL_PROCESSING_FAILURE', stage_metadata: { path: ['call_id'], equals: callId } } });
        if (existing) return;
        await tx.task.create({ data: {
            title: 'Review failed call processing',
            description: `Call ${callId} needs manual review: ${error.message}`,
            assigned_to: call.staff_agent_id, contact_phone: call.phone_number,
            due_date: new Date(), priority: 'HIGH', tags: ['call-review'],
            task_type: 'CALL_PROCESSING_FAILURE',
            stage_metadata: { call_id: callId, source: 'call_processor' },
        } });
    });
    logger.error(`[StaffCall] Processing failed: ${callId}`, error);
}

/** Close the verification task once a call is approved or rejected. */
export async function closeCallReviewTask(callId: string): Promise<void> {
    await prisma.task.updateMany({
        where: { task_type: 'CALL_REVIEW', status: { not: 'DONE' }, stage_metadata: { path: ['call_id'], equals: callId } },
        data: { status: 'DONE' },
    });
}
