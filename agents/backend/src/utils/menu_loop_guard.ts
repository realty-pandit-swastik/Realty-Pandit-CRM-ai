/**
 * Menu-loop circuit breaker (2026-05-19).
 *
 * A handler must never re-send a menu it just sent. Before returning a
 * numbered menu, call lastOutboundWasSameMenu(); if true, return
 * escalateStuckMenu() instead — the customer gets a human-handoff message
 * and a HIGH follow-up task is assigned, so the conversation can never spin
 * forever (covers any menu, including future ones that forget numeric
 * parsing). See docs/plans/2026-05-19-menu-loop-shared-parser.md
 */
import prisma from '../db';
import logger from './logger';
import type { AgentContext, AgentResponse } from '../agents/types';

/** True if the most recent outbound WhatsApp message to `phone` is exactly `menuText`. */
export async function lastOutboundWasSameMenu(phone: string, menuText: string): Promise<boolean> {
    try {
        const last = await prisma.interaction.findFirst({
            where: { phone_number: phone, direction: 'outbound', channel: 'whatsapp' },
            orderBy: { created_at: 'desc' },
            select: { content: true },
        });
        return !!last && (last.content || '').trim() === menuText.trim();
    } catch (e) {
        logger.warn(`[MenuLoopGuard] check failed for ${phone}: ${(e as Error).message}`);
        return false; // fail open — never block a reply because the check errored
    }
}

/** Human-handoff response + HIGH follow-up task. Never throws. */
export async function escalateStuckMenu(context: AgentContext, menuText: string): Promise<AgentResponse> {
    const c: any = context.contact || {};
    try {
        let assignee: string | null = c.assigned_agent_id || null;
        if (!assignee) {
            const sb = await prisma.agent.findFirst({
                where: { role: 'super_boss', status: 'active' }, select: { id: true },
            });
            assignee = sb?.id || null;
        }
        if (assignee) {
            await prisma.task.create({
                data: {
                    title: `Bot menu loop — needs human: ${c.name || c.phone_number}`,
                    description: `Customer did not pick a valid option on a repeated menu. Menu: "${menuText.slice(0, 160)}". Please follow up.`,
                    contact_phone: c.phone_number,
                    assigned_to: assignee,
                    priority: 'HIGH',
                    status: 'TODO',
                    task_type: 'CALLBACK',
                    due_date: new Date(Date.now() + 60 * 60 * 1000),
                },
            });
        }
        logger.warn(`[MenuLoopGuard] Stuck menu for ${c.phone_number} → escalated to ${assignee || 'NONE'}`);
    } catch (e) {
        logger.error(`[MenuLoopGuard] escalation failed for ${c.phone_number}: ${(e as Error).message}`);
    }
    return {
        action: 'reply',
        reply_script: "🙏 Let me connect you with a team member who will help you right away. Someone will reach out shortly.",
        quality_hint: 'needs_human',
        metadata: { menu_loop_escalation: true },
    };
}
