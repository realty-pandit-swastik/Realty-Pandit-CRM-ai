import prisma from '../db';
import transcriptionService from './transcription';
import callExtractor, { ExtractedCallData } from './call_extractor';
import logger from '../utils/logger';

// Only unambiguous, high-confidence values enter the CRM before staff review.
export function autoSavedFields(data: ExtractedCallData): Record<string, unknown> {
    if (data.confidence < 0.7) return {};
    return {
        ...(data.intent && data.intent !== 'OTHER' ? { intent: data.intent.toLowerCase() } : {}),
        ...(data.propertyType ? { property_type: data.propertyType } : {}),
        ...(data.location ? { preferred_location: data.location } : {}),
        ...(Number.isFinite(data.budgetMin) && data.budgetMin! > 0 ? { budget_min: data.budgetMin } : {}),
        ...(Number.isFinite(data.budgetMax) && data.budgetMax! > 0 ? { budget_max: data.budgetMax } : {}),
        ...(data.summary ? { ai_summary: data.summary } : {}),
    };
}

export function reviewedContactFields(data: Record<string, any>) {
    return {
        contact_type: data.role === null ? 'UNKNOWN' : data.role || undefined,
        intent: data.intent === null ? null : data.intent?.toLowerCase() || undefined,
        property_type: data.propertyType === null ? null : data.propertyType || undefined,
        budget_min: data.budgetMin === null ? null : data.budgetMin ?? undefined,
        budget_max: data.budgetMax === null ? null : data.budgetMax ?? undefined,
        preferred_location: data.location === null ? null : data.location || undefined,
        ai_summary: data.summary === null ? null : data.summary || undefined,
    };
}

export async function processStaffCall(callId: string): Promise<void> {
    const call = await prisma.staffCall.findUnique({ where: { id: callId } });
    if (!call?.recording_url) throw new Error('Call recording missing');
    const claimed = await prisma.staffCall.updateMany({
        where: { id: callId, status: 'PROCESSING' }, data: { status: 'TRANSCRIBED' },
    });
    if (!claimed.count) return;

    const transcript = call.transcript || (await transcriptionService.transcribeAudio(
        call.recording_url, { language: 'auto' },
    ))?.text;
    if (!transcript?.trim()) throw new Error('Transcription failed or returned empty');

    await prisma.staffCall.update({ where: { id: callId }, data: { transcript } });
    const extracted = await callExtractor.extractFromTranscript(transcript, call.phone_number);
    const fields = autoSavedFields(extracted);

    await prisma.$transaction(async (tx) => {
        const finalized = await tx.staffCall.updateMany({
            where: { id: callId, status: 'TRANSCRIBED' },
            data: { ai_extraction: extracted as any, confidence_score: extracted.confidence, status: 'READY_FOR_REVIEW' },
        });
        if (!finalized.count) return;
        const contact = await tx.contact.findUnique({ where: { phone_number: call.phone_number } });
        if (!contact) throw new Error('Call contact missing');
        const priorValues = Object.fromEntries(Object.keys(fields).map((key) => [key, (contact as any)[key] ?? null]));
        if (Object.keys(fields).length) {
            await tx.contact.update({ where: { phone_number: call.phone_number }, data: fields });
        }
        await tx.staffCall.update({
            where: { id: callId },
            data: {
                staff_edited_data: { source: 'ai_call', review_status: 'PENDING', auto_saved_fields: fields, prior_values: priorValues } as any,
            },
        });
        await tx.interaction.create({ data: {
            tenant_id: call.tenant_id,
            phone_number: call.phone_number,
            channel: 'staff_call', direction: call.classification === 'INBOUND' ? 'inbound' : 'outbound',
            event_type: 'ai_extraction', content: extracted.summary,
            metadata: { call_id: callId, source: 'ai_call', review_status: 'PENDING', auto_saved_fields: fields, prior_values: priorValues } as any,
        } });
    });
}

export async function failStaffCall(callId: string, error: Error): Promise<void> {
    const call = await prisma.staffCall.findUnique({ where: { id: callId } });
    if (!call || call.status === 'REJECTED') return;
    await prisma.$transaction(async (tx) => {
        const claimed = await tx.staffCall.updateMany({ where: { id: callId, status: { in: ['PROCESSING', 'TRANSCRIBED'] } }, data: { status: 'REJECTED' } });
        if (!claimed.count) return;
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
