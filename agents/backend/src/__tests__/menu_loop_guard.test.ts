import { describe, it, expect, vi, beforeEach } from 'vitest';

const findFirst = vi.fn();
const taskCreate = vi.fn().mockResolvedValue({ id: 'task1' });
const agentFindFirst = vi.fn().mockResolvedValue({ id: 'sb1' });
vi.mock('../db', () => ({
    default: {
        interaction: { findFirst: (...a: any[]) => findFirst(...a) },
        task: { create: (...a: any[]) => taskCreate(...a) },
        agent: { findFirst: (...a: any[]) => agentFindFirst(...a) },
    },
}));

import { lastOutboundWasSameMenu, escalateStuckMenu } from '../utils/menu_loop_guard';

describe('menu_loop_guard', () => {
    beforeEach(() => { findFirst.mockReset(); taskCreate.mockClear(); });

    it('lastOutboundWasSameMenu true when previous outbound == menu', async () => {
        findFirst.mockResolvedValue({ content: 'MENU TEXT' });
        expect(await lastOutboundWasSameMenu('+91999', 'MENU TEXT')).toBe(true);
    });
    it('false when previous outbound differs / none', async () => {
        findFirst.mockResolvedValue({ content: 'something else' });
        expect(await lastOutboundWasSameMenu('+91999', 'MENU TEXT')).toBe(false);
        findFirst.mockResolvedValue(null);
        expect(await lastOutboundWasSameMenu('+91999', 'MENU TEXT')).toBe(false);
    });
    it('escalateStuckMenu creates a HIGH task and returns a human-handoff reply', async () => {
        const r = await escalateStuckMenu(
            { contact: { phone_number: '+91999', assigned_agent_id: null, tenant_id: 't', name: 'X' } } as any,
            'MENU TEXT',
        );
        expect(taskCreate).toHaveBeenCalledTimes(1);
        expect(r.action).toBe('reply');
        expect(r.reply_script).toContain('team member');
    });
});
