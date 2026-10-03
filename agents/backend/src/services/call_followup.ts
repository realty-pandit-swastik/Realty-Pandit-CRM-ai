import { randomUUID } from 'crypto';
/**
 * What happens AFTER a staff member approves a call's extracted notes (POST /api/calls/:id/submit).
 *
 *  - BUY / RENT  → a lead (deal) for the caller. ensureDealForLead also refreshes the Shortage Book,
 *                  so "fewer than 3 matches" lands in the book automatically. Optionally the best
 *                  matches go to the caller on WhatsApp through the normal auto-share path
 *                  (relevance floor, de-dup, ai_paused and budget sanity all still apply).
 *  - SELL / LEASE → a task to capture the listing. Inventory is written only by the shared
 *                  workflow engine (owner, price, taxonomy), never straight from a transcript.
 *
 * Never throws: the review is already committed, so a failure here becomes a visible task instead.
 */
import prisma from '../db';
import logger from '../utils/logger';
import { ensureDealForLead } from './ensure_deal';
import { refreshDealShortage } from './shortage_book';
import { shareNextPropertyDetailed } from './property_sharing';
import { lakhsToRupees } from './staff_call_processing';
import { approvedCallFields } from './call_demand';

const MAX_AUTO_SHARES = 3;

export interface CallFollowupResult { dealId?: string; shared: number; listingTask?: boolean; failed?: boolean }

export async function applyApprovedCall(
    call: { id: string; phone_number: string; tenant_id?: string },
    data: Record<string, any>,
    agentId: string,
    autoShare: boolean,
    progress?: { result: CallFollowupResult; owns: () => Promise<boolean>; save: (result: CallFollowupResult) => Promise<void> },
): Promise<CallFollowupResult> {
    const result: CallFollowupResult = { ...progress?.result, shared: progress?.result.shared ?? 0 };
    delete result.failed;
    const intent = String(data.intent || '').toUpperCase();
    try {
        if (intent === 'BUY' || intent === 'RENT') {
            if (progress && !await progress.owns()) return { ...result, failed: true };
            const contact = await prisma.contact.findUnique({
                where: { phone_number: call.phone_number }, select: { assigned_agent_id: true, tenant_id: true },
            });
            if (call.tenant_id && contact?.tenant_id !== call.tenant_id) throw new Error('Contact unavailable');
            // The contact's own owner keeps the lead; an unassigned caller goes to whoever took the call.
            const deal = result.dealId ? { dealId: result.dealId, created: false } : await ensureDealForLead({
                contactPhone: call.phone_number,
                source: 'staff_call',
                createdByAgentId: agentId, // staff-verified requirement → QUALIFIED, no AI qualification call
                assignedAgentId: contact?.assigned_agent_id ?? agentId,
                demand: {
                    intent: intent === 'RENT' ? 'rent' : 'buy',
                    location: data.location || null,
                    budgetMin: lakhsToRupees(data.budgetMin) ?? null,
                    budgetMax: lakhsToRupees(data.budgetMax) ?? null,
                },
            });
            if (!result.dealId) {
                const fields = await approvedCallFields(data);
                await prisma.transaction.updateMany({ where: { id: deal.dealId, ...(call.tenant_id ? { tenant_id: call.tenant_id } : {}), source: 'staff_call' }, data: {
                    demand_intent: fields.intent, demand_location: fields.preferred_location,
                    demand_budget_min: fields.budget_min, demand_budget_max: fields.budget_max,
                    demand_taxonomy_node_id: fields.demand_taxonomy_node_id, demand_schema_values: fields.demand_schema_values,
                    demand_area_min: fields.area_min, demand_area_max: fields.area_max, demand_budget_type: fields.demand_budget_type,
                } });
            }
            result.dealId = deal.dealId;
            await progress?.save(result);
            // A brand-new deal refreshes the book itself; an existing one only learns of the edit here.
            if (!deal.created) {
                await refreshDealShortage(deal.dealId);
            }
            if (autoShare) {
                for (let i = result.shared; i < MAX_AUTO_SHARES; i++) {
                    if (progress && !await progress.owns()) return { ...result, failed: true };
                    const outcome = await shareNextPropertyDetailed(deal.dealId);
                    if (outcome.status !== 'shared') break;
                    result.shared++;
                    await progress?.save(result);
                }
            }
        } else if (intent === 'SELL' || intent === 'LEASE') {
            const existingTask = await prisma.task.findFirst({ where: { task_type: 'CALL_LISTING_CAPTURE', stage_metadata: { path: ['call_id'], equals: call.id } } });
            if (!existingTask) await prisma.task.create({ data: {
                title: `Add listing from call: ${data.location || call.phone_number}`,
                description: `${call.phone_number} wants to ${intent === 'LEASE' ? 'lease' : 'sell'} ${data.propertyType || 'a property'}${data.location ? ` in ${data.location}` : ''}. ${data.summary || ''}`.trim(),
                assigned_to: agentId, contact_phone: call.phone_number,
                due_date: new Date(Date.now() + 24 * 3600 * 1000), priority: 'HIGH',
                tags: ['call-review', 'listing'], task_type: 'CALL_LISTING_CAPTURE',
                // Budget fields are the asking price in LAKHS, exactly as extracted/edited on the review screen.
                stage_metadata: { call_id: call.id, intent, property_type: data.propertyType ?? null, location: data.location ?? null,
                    asking_lakhs_min: data.budgetMin ?? null, asking_lakhs_max: data.budgetMax ?? null },
            } });
            result.listingTask = true;
        }
    } catch (err) {
        result.failed = true;
        if (progress && !await progress.owns()) return result;
        logger.error(`[CallFollowup] Follow-up failed for call ${call.id}:`, err);
        const existingFailure = await prisma.task.findFirst({ where: { task_type: 'CALL_FOLLOWUP_FAILED', stage_metadata: { path: ['call_id'], equals: call.id } } });
        if (!existingFailure) await prisma.task.create({ data: {
            title: 'Call approved but follow-up failed',
            description: `Call ${call.id} (${call.phone_number}) was approved but the lead/shares could not be created: ${(err as Error).message}. Please add it manually.`,
            assigned_to: agentId, contact_phone: call.phone_number,
            due_date: new Date(), priority: 'HIGH', tags: ['call-review'],
            task_type: 'CALL_FOLLOWUP_FAILED', stage_metadata: { call_id: call.id },
        } }).catch((taskErr) => logger.error('[CallFollowup] Could not create failure task:', taskErr));
    }
    return result;
}

/** Durable outbox ownership. Both BullMQ and Redis-down fallback recover this work. */
export async function runCallFollowup(callId: string): Promise<CallFollowupResult | null> {
    const token = randomUUID();
    const claimed = await prisma.staffCall.updateMany({ where: {
        id: callId, status: 'APPROVED', followup_attempts: { lt: 3 }, OR: [
            { followup_status: 'PENDING' },
            { followup_status: 'RUNNING', followup_claimed_at: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
        ],
    }, data: { followup_status: 'RUNNING', followup_claim_token: token, followup_claimed_at: new Date(), followup_attempts: { increment: 1 } } });
    if (!claimed.count) return null;
    const call = await prisma.staffCall.findUnique({ where: { id: callId } });
    if (!call) return null;
    const owns = async () => {
        const renewed = await prisma.staffCall.updateMany({ where: { id: callId, followup_status: 'RUNNING', followup_claim_token: token }, data: { followup_claimed_at: new Date() } });
        return renewed.count === 1;
    };
    // Keep a healthy worker's lease alive during slow matching/provider requests.
    const heartbeat = setInterval(() => owns().catch(error => logger.warn('[CallFollowup] Lease renewal failed', error)), 60_000);
    heartbeat.unref();
    try {
        const data = (call.staff_edited_data as any)?.final_data || {};
        // Listing tasks and outbox completion share a transaction, preventing duplicate tasks
        // if a process dies immediately after the task is written.
        if (['SELL', 'LEASE'].includes(String(data.intent))) {
            return await prisma.$transaction(async tx => {
                const owns = await tx.staffCall.updateMany({ where: { id: callId, followup_claim_token: token, followup_status: 'RUNNING' }, data: { followup_status: 'DONE', followup_claim_token: null, followup_claimed_at: null, followup_result: { shared: 0, listingTask: true } } });
                if (!owns.count) return null;
                const existing = await tx.task.findFirst({ where: { task_type: 'CALL_LISTING_CAPTURE', stage_metadata: { path: ['call_id'], equals: callId } } });
                if (!existing) await tx.task.create({ data: {
                    title: `Capture verified listing: ${call.phone_number}`,
                    description: `${data.intent}: ${data.propertyType || 'property'}, ${data.location || 'location to confirm'}. ${data.summary || ''}`,
                    assigned_to: call.staff_agent_id, contact_phone: call.phone_number, due_date: new Date(), priority: 'HIGH',
                    task_type: 'CALL_LISTING_CAPTURE', tags: ['call-review', 'listing'],
                    stage_metadata: { call_id: callId, verified_data: data },
                } });
                return { shared: 0, listingTask: true };
            });
        }
        const result = await applyApprovedCall(call, data, call.staff_agent_id, call.auto_share, {
            result: (call.followup_result as any) || { shared: 0 }, owns,
            save: async result => { await prisma.staffCall.updateMany({ where: { id: callId, followup_status: 'RUNNING', followup_claim_token: token }, data: { followup_result: result as any } }); },
        });
        const completed = await prisma.staffCall.updateMany({ where: { id: callId, followup_claim_token: token }, data: {
            followup_status: result.failed ? (call.followup_attempts >= 3 ? 'FAILED' : 'PENDING') : 'DONE',
            followup_claim_token: null, followup_claimed_at: null,
            followup_error: result.failed ? 'Follow-up failed; see assigned task' : null, followup_result: result as any,
        } });
        if (completed.count && !result.failed) await prisma.task.updateMany({ where: { task_type: 'CALL_FOLLOWUP_FAILED', stage_metadata: { path: ['call_id'], equals: callId } }, data: { status: 'DONE' } });
        return result;
    } catch (error) {
        await prisma.staffCall.updateMany({ where: { id: callId, followup_claim_token: token }, data: {
            followup_status: call.followup_attempts >= 3 ? 'FAILED' : 'PENDING', followup_claim_token: null, followup_claimed_at: null, followup_error: (error as Error).message,
        } });
        throw error;
    } finally {
        clearInterval(heartbeat);
    }
}

export async function recoverCallFollowups(): Promise<void> {
    // A crash during the final attempt must leave visible, manually retryable work.
    await prisma.staffCall.updateMany({ where: { status: 'APPROVED', followup_status: 'RUNNING', followup_attempts: { gte: 3 }, followup_claimed_at: { lt: new Date(Date.now() - 60 * 60 * 1000) } }, data: { followup_status: 'FAILED', followup_claim_token: null, followup_claimed_at: null, followup_error: 'Final follow-up attempt was interrupted; retry after checking delivery history' } });
    const pending = await prisma.staffCall.findMany({ where: { status: 'APPROVED', followup_attempts: { lt: 3 }, OR: [
        { followup_status: 'PENDING' }, { followup_status: 'RUNNING', followup_claimed_at: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
    ] }, select: { id: true }, take: 10 });
    for (const call of pending) await runCallFollowup(call.id).catch(error => logger.error(`[CallFollowup] Recovery ${call.id} failed`, error));
}
