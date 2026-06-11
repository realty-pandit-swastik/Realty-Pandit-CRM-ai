import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
    default: {
        agent: { findFirst: vi.fn() },
    },
}));

import { resolveCaller, canAccess } from '../services/tool_permission';
import prisma from '../db';

beforeEach(() => vi.clearAllMocks());

describe('resolveCaller', () => {
    it('returns agent record when phone matches', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue({
            id: 'a1', name: 'Rohan', role: 'employee', status: 'active',
            phone: '+919958860411', email: 'r@x.com', department: null,
            gender: 'male', preferred_language: 'hi_en', tenant_id: 't1',
        });
        const caller = await resolveCaller('919958860411');
        expect(caller).toMatchObject({ id: 'a1', role: 'employee' });
    });

    it('returns null for unknown number', async () => {
        (prisma.agent.findFirst as any).mockResolvedValue(null);
        const caller = await resolveCaller('919000000000');
        expect(caller).toBeNull();
    });
});

describe('canAccess', () => {
    const employee = { role: 'employee' } as any;
    const manager = { role: 'manager' } as any;
    const superBoss = { role: 'super_boss' } as any;

    it('employee can use own-data tools', () => {
        expect(canAccess(employee, 'get_my_leads')).toBe(true);
        expect(canAccess(employee, 'schedule_callback')).toBe(true);
        expect(canAccess(employee, 'send_on_whatsapp')).toBe(true);
    });

    it('employee cannot use manager or super_boss tools', () => {
        expect(canAccess(employee, 'reassign_lead')).toBe(false);
        expect(canAccess(employee, 'get_unassigned_leads')).toBe(false);
        expect(canAccess(employee, 'get_team_performance')).toBe(false);
        expect(canAccess(employee, 'get_company_metrics')).toBe(false);
    });

    it('manager can use manager + employee tools but not super_boss', () => {
        expect(canAccess(manager, 'reassign_lead')).toBe(true);
        expect(canAccess(manager, 'get_team_performance')).toBe(true);
        expect(canAccess(manager, 'get_my_leads')).toBe(true);
        expect(canAccess(manager, 'get_company_metrics')).toBe(false);
    });

    it('super_boss can use everything', () => {
        expect(canAccess(superBoss, 'get_company_metrics')).toBe(true);
        expect(canAccess(superBoss, 'reassign_lead')).toBe(true);
        expect(canAccess(superBoss, 'get_my_leads')).toBe(true);
    });

    it('unknown tool name returns false', () => {
        expect(canAccess(superBoss, 'nuke_database')).toBe(false);
    });

    it('employee can use Phase 2 workflow tools', () => {
        expect(canAccess(employee, 'search_inventory')).toBe(true);
        expect(canAccess(employee, 'schedule_site_visit')).toBe(true);
        expect(canAccess(employee, 'update_lead_status')).toBe(true);
        expect(canAccess(employee, 'get_lead_history')).toBe(true);
        expect(canAccess(employee, 'mark_task_done')).toBe(true);
    });

    it('manager can use get_stuck_deals', () => {
        expect(canAccess(manager, 'get_stuck_deals')).toBe(true);
    });

    it('employee cannot use get_stuck_deals', () => {
        expect(canAccess(employee, 'get_stuck_deals')).toBe(false);
    });
});
