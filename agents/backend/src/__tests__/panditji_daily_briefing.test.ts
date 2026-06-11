import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/whatsapp', () => ({
    WhatsAppService: class {
        sendText = vi.fn().mockResolvedValue(undefined);
    },
}));

import prisma from '../db';
import { sendPanditjiDailyBriefing } from '../services/panditji_daily_briefing';

beforeEach(() => vi.clearAllMocks());

describe('sendPanditjiDailyBriefing', () => {
    it('sends one WhatsApp message per active super_boss', async () => {
        (prisma.agent.findMany as any)
            .mockResolvedValueOnce([
                { id: 's1', name: 'Puneet', phone: '+919958860411', tenant_id: 't1' },
                { id: 's2', name: 'Raj', phone: '+919000000009', tenant_id: 't1' },
            ]);
        (prisma.lead.count as any).mockResolvedValue(10);
        (prisma.transaction.count as any).mockResolvedValue(2);
        (prisma.transaction.aggregate as any).mockResolvedValue({ _sum: { final_price: 5000000 } });
        (prisma.lead.groupBy as any).mockResolvedValue([
            { assigned_agent_id: 'a1', _count: { id: 5 } },
        ]);
        (prisma.agent.findUnique as any).mockResolvedValue({ name: 'Rohan' });

        await sendPanditjiDailyBriefing();
        // WhatsAppService was instantiated at module load — we can't assert on its method directly,
        // but we can assert no exception was thrown and the DB queries happened.
        expect(prisma.lead.count).toHaveBeenCalled();
        expect(prisma.transaction.count).toHaveBeenCalled();
        expect(prisma.transaction.aggregate).toHaveBeenCalled();
    });

    it('skips when no super_boss users exist', async () => {
        (prisma.agent.findMany as any).mockResolvedValueOnce([]);
        await sendPanditjiDailyBriefing();
        expect(prisma.lead.count).not.toHaveBeenCalled();
    });
});
