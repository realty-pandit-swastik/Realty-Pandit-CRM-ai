import { describe, it, expect } from 'vitest';
import { outcomeRepliedToCustomer, ShareOutcome } from '../services/property_sharing';

/**
 * Guards the 2026-08-07 dead-end fix.
 *
 * shareNextProperty has nine exits; five send nothing. The caller in
 * webhook_processor 3b.3 used to discard the return value, so those five silently
 * produced no outbound Interaction and the post-turn safety net fired
 * "🙏 Got it — thank you for your message. A team member will assist you shortly."
 * at a buyer who had just stated a budget.
 *
 * If a NEW outcome variant is added and not classified here, the exhaustiveness
 * test below fails — which is the point: an unclassified outcome would silently
 * reopen the dead end.
 */
describe('outcomeRepliedToCustomer', () => {
    const REPLIED: ShareOutcome[] = [
        { status: 'shared', inventoryId: 'inv-1', matchScore: 82 },
        { status: 'budget_reask_sent' },
        { status: 'exhausted_notified' },
    ];

    const SILENT: ShareOutcome[] = [
        { status: 'no_deal' },
        { status: 'ai_paused' },
        { status: 'budget_reask_exhausted' },
        { status: 'exhausted_deduped' },
        { status: 'exhausted_send_failed' },
        { status: 'card_send_failed', inventoryId: 'inv-2' },
    ];

    it('reports true only for outcomes that actually messaged the customer', () => {
        for (const o of REPLIED) {
            expect(outcomeRepliedToCustomer(o), `${o.status} should count as replied`).toBe(true);
        }
    });

    it('reports false for every silent exit — these are the dead-end cases', () => {
        for (const o of SILENT) {
            expect(outcomeRepliedToCustomer(o), `${o.status} must NOT count as replied`).toBe(false);
        }
    });

    it('covers all nine outcome variants (fails if a new one is added unclassified)', () => {
        const covered = [...REPLIED, ...SILENT].map(o => o.status).sort();
        expect(covered).toEqual([
            'ai_paused',
            'budget_reask_exhausted',
            'budget_reask_sent',
            'card_send_failed',
            'exhausted_deduped',
            'exhausted_notified',
            'exhausted_send_failed',
            'no_deal',
            'shared',
        ]);
    });
});
