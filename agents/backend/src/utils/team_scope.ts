// team_scope.ts — single source of truth for the "manager = their team, employee = own" rule.
// Returns the agent ids whose leads/inventory/deals this agent may SEE + EDIT:
//   super_boss → caller skips scoping entirely (sees all)
//   manager    → self + direct reports (agents whose reports_to_id = this agent)
//   employee   → self only
// (2026-06-27)

import prisma from '../db';

export async function getTeamIds(agent: { id: string; role: string }): Promise<string[]> {
    if (agent.role === 'manager') {
        const reports = await prisma.agent.findMany({
            where: { reports_to_id: agent.id },
            select: { id: true },
        });
        return [agent.id, ...reports.map((a: { id: string }) => a.id)];
    }
    return [agent.id];
}
