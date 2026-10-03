import { beforeEach, expect, it, vi } from 'vitest';

// A broken Shortage Book (e.g. table missing in production) must never fail deal creation.
vi.mock('../db', () => ({ default: {
    transaction: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
    transactionLog: { create: vi.fn() },
    agent: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
} }));
vi.mock('../services/shortage_book', () => ({ refreshDealShortage: vi.fn().mockRejectedValue(new Error('table does not exist')) }));
vi.mock('../services/lead_stage_sync', () => ({ syncLeadStageForContact: vi.fn() }));
vi.mock('../services/executive_assigner', () => ({ assignExecutive: vi.fn().mockResolvedValue(null) }));

import prisma from '../db';
import { refreshDealShortage } from '../services/shortage_book';
import { createTransaction } from '../services/transaction_service';

beforeEach(() => vi.clearAllMocks());

it('createTransaction still succeeds when the shortage refresh throws', async () => {
    (prisma.transaction.create as any).mockResolvedValue({ id: 'deal-1', demand_contact_id: '919999900001', inventory_id: null });
    (refreshDealShortage as any).mockRejectedValue(new Error('table does not exist'));

    const result = await createTransaction({
        tenant_id: 't1', demand_contact_id: '919999900001', type: 'SALE', source: 'whatsapp',
    } as any, 'agent-1');

    expect(refreshDealShortage).toHaveBeenCalledWith('deal-1');
    expect(result.isDuplicate).toBe(false);
    expect(prisma.transactionLog.create).toHaveBeenCalled();
});
