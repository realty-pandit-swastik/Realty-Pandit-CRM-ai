import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../db';
import { ForbiddenError, ValidationError } from '../middleware/error_handler';
import { buildFullContactVisibilityFilter } from '../middleware/contact_visibility';

type Actor = { id: string; role: string; tenant_id: string };
export type TaskScope = { actor: Actor; ids: string[]; tenantIds: string[]; tasks: Prisma.TaskWhereInput; projects: Prisma.WorkProjectWhereInput };

export async function resolveTaskScope(actor: Actor): Promise<TaskScope> {
    if (!['super_boss', 'manager', 'employee'].includes(actor.role)) throw new ForbiddenError();
    // Task/WorkProject have no tenant column. Their agent ownership supplies the boundary.
    const agents = await prisma.agent.findMany({ where: { tenant_id: actor.tenant_id }, select: { id: true, reports_to_id: true } });
    const tenantIds = agents.map(agent => agent.id);
    const ids = agents.filter(agent => actor.role === 'super_boss' || agent.id === actor.id ||
        (actor.role === 'manager' && agent.reports_to_id === actor.id)).map(agent => agent.id);
    const projects: Prisma.WorkProjectWhereInput = {
        AND: [{ owner_id: { in: tenantIds } }, { OR: [
            { owner_id: { in: ids } }, ...ids.map(id => ({ team_members: { array_contains: [id] } })),
        ] }],
    };
    const tasks: Prisma.TaskWhereInput = { AND: [
        { assigned_to: { in: ids } },
        { OR: [{ contact_phone: null }, { contact: { tenant_id: actor.tenant_id } }] },
        { OR: [{ property_id: null }, { property: { tenant_id: actor.tenant_id } }] },
        { OR: [{ project_id: null }, { project: { owner_id: { in: tenantIds } } }] },
    ] };
    return { actor, ids, tenantIds, tasks, projects };
}

const taskFields = z.object({
    title: z.string().trim().min(1).max(500).optional(), description: z.string().max(20000).nullable().optional(),
    assigned_to: z.string().min(1).optional(), due_date: z.iso.datetime({ offset: true }).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']).optional(),
    tags: z.array(z.string().max(100)).max(50).optional(),
    project_id: z.string().min(1).nullable().optional(), contact_phone: z.string().max(64).nullable().optional(),
    property_id: z.string().min(1).nullable().optional(),
});

export async function validateTaskReferences(input: unknown, scope: TaskScope) {
    // Date-only strings are the existing web TaskBoard contract.
    const parsed = taskFields.extend({ due_date: z.union([z.iso.datetime({ offset: true }), z.iso.date()]).optional() }).safeParse(input);
    if (!parsed.success) throw new ValidationError('Invalid task fields or date.');
    const data = parsed.data;
    if (data.assigned_to && !scope.ids.includes(data.assigned_to)) throw new ForbiddenError('Assignee is outside your team.');
    if (data.project_id && !await prisma.workProject.findFirst({ where: { id: data.project_id, AND: [scope.projects] } })) {
        throw new ForbiddenError('Project is outside your access.');
    }
    if (data.contact_phone) {
        const visibility = await buildFullContactVisibilityFilter(scope.actor.id, scope.actor.role);
        if (!await prisma.contact.findFirst({ where: { phone_number: data.contact_phone, tenant_id: scope.actor.tenant_id, AND: [visibility] } })) {
            throw new ForbiddenError('Contact is outside your access.');
        }
    }
    if (data.property_id && !await prisma.inventory.findFirst({ where: {
        id: data.property_id, tenant_id: scope.actor.tenant_id,
        ...(scope.actor.role === 'super_boss' ? {} : { OR: [
            { assigned_agent_id: { in: scope.ids } }, { uploaded_by_agent_id: { in: scope.ids } },
            { shared_with_ids: { has: scope.actor.id } },
        ] }),
    } })) throw new ForbiddenError('Property is outside your access.');
}

export function validateProjectReferences(input: Record<string, unknown>, scope: TaskScope) {
    const parsed = z.object({
        name: z.string().trim().min(1).max(500).optional(),
        description: z.string().max(20000).nullable().optional(),
        owner_id: z.string().min(1).optional(), team_members: z.array(z.string()).max(500).optional(),
        status: z.enum(['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED']).optional(),
        start_date: z.union([z.iso.datetime({ offset: true }), z.iso.date()]).optional(),
        end_date: z.union([z.iso.datetime({ offset: true }), z.iso.date()]).nullable().optional(),
    }).safeParse(input);
    if (!parsed.success) throw new ValidationError('Invalid project fields or date.');
    if (parsed.data.owner_id && !scope.ids.includes(parsed.data.owner_id)) throw new ForbiddenError('Owner is outside your team.');
    if (parsed.data.team_members?.some(id => !scope.ids.includes(id))) throw new ForbiddenError('Members are outside your team.');
}
