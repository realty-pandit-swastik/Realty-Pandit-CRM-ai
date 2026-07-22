import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
    default: {
        transaction: { findUnique: vi.fn(), update: vi.fn() },
        transactionLog: { create: vi.fn() },
        $transaction: vi.fn(),
    },
}));

import prisma from '../db';
import { transitionTransaction } from '../services/transaction_state_machine';
import { TransactionStatus } from '@prisma/client';

beforeEach(() => vi.clearAllMocks());

// GlitchTip #71: "Invalid transition: QUALIFIED → QUALIFIED" — dropping a deal onto the column it's
// already in (or a double-submit) threw. A same-stage transition is now a no-op.
describe('transitionTransaction — same-stage no-op', () => {
    it('returns the unchanged transaction and does NOT update/log when from === to', async () => {
        (prisma.transaction.findUnique as any).mockResolvedValue({ id: 't1', status: TransactionStatus.QUALIFIED });
        const result = await transitionTransaction('t1', TransactionStatus.QUALIFIED, 'agent1');
        expect((result as any).status).toBe(TransactionStatus.QUALIFIED);
        expect(prisma.transaction.update).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('still throws on a genuinely invalid transition (NEW → CLOSED_WON)', async () => {
        (prisma.transaction.findUnique as any).mockResolvedValue({ id: 't2', status: TransactionStatus.NEW });
        const promise = transitionTransaction('t2', TransactionStatus.CLOSED_WON, 'agent1');
        await expect(promise).rejects.toThrow(/Invalid transition/);
        // GlitchTip #97: it's a typed 400 ValidationError now, so routes return 400 (not 500)
        // and captureRouteError skips it. (2026-06-25)
        await expect(promise).rejects.toMatchObject({ statusCode: 400 });
    });
});
