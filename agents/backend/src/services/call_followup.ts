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

const MAX_AUTO_SHARES = 3;

export interface CallFollowupResult { dealId?: string; shared: number; listingTask?: boolean; failed?: boolean }

export async function applyApprovedCall(
    call: { id: string; phone_number: string },
    data: Record<string, any>,
    agentId: string,
    autoShare: boolean,
): Promise<CallFollowupResult> {
    const result: CallFollowupResult = { shared: 0 };
    const intent = String(data.intent || '').toUpperCase();
    try {
        if (intent === 'BUY' || intent === 'RENT') {
            const contact = await prisma.contact.findUnique({
                where: { phone_number: call.phone_number }, select: { assigned_agent_id: true },
            });
            // The contact's own owner keeps the lead; an unassigned caller goes to whoever took the call.
            const deal = await ensureDealForLead({
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
            result.dealId = deal.dealId;
            // A brand-new deal refreshes the book itself; an existing one only learns of the edit here.
            if (!deal.created) {
                await refreshDealShortage(deal.dealId).catch((err) => logger.warn(`[CallFollowup] Shortage refresh skipped for ${deal.dealId}: ${err.message}`));
            }
            if (autoShare) {
                for (let i = 0; i < MAX_AUTO_SHARES; i++) {
                    const outcome = await shareNextPropertyDetailed(deal.dealId);
                    if (outcome.status !== 'shared') break;
                    result.shared++;
                }
            }
        } else if (intent === 'SELL' || intent === 'LEASE') {
            await prisma.task.create({ data: {
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
        logger.error(`[CallFollowup] Follow-up failed for call ${call.id}:`, err);
        await prisma.task.create({ data: {
            title: 'Call approved but follow-up failed',
            description: `Call ${call.id} (${call.phone_number}) was approved but the lead/shares could not be created: ${(err as Error).message}. Please add it manually.`,
            assigned_to: agentId, contact_phone: call.phone_number,
            due_date: new Date(), priority: 'HIGH', tags: ['call-review'],
            task_type: 'CALL_FOLLOWUP_FAILED', stage_metadata: { call_id: call.id },
        } }).catch((taskErr) => logger.error('[CallFollowup] Could not create failure task:', taskErr));
    }
    return result;
}
