import prisma from '../db';
import { phoneVariants } from '../utils/phone';

export interface ResolvedCaller {
    id: string;
    name: string;
    phone: string;
    email: string;
    role: 'employee' | 'manager' | 'super_boss';
    department: string | null;
    gender: 'male' | 'female' | 'unknown';
    preferred_language: 'hi' | 'en' | 'hi_en';
    tenant_id: string;
}

const EMPLOYEE_TOOLS = new Set([
    // Phase 1
    'get_my_leads',
    'get_my_appointments',
    'get_my_tasks',
    'search_lead',
    'schedule_callback',
    'log_call_note',
    'send_on_whatsapp',
    // Phase 2
    'search_inventory',
    'schedule_site_visit',
    'update_lead_status',
    'get_lead_history',
    'mark_task_done',
    // Catalog tools
    'search_and_show_properties',
    'send_booking_flow',
]);

const MANAGER_TOOLS = new Set([
    'get_team_performance',
    'get_unassigned_leads',
    'reassign_lead',
    'get_pipeline_overview',
    'get_stuck_deals',
]);

const SUPER_BOSS_TOOLS = new Set(['get_company_metrics']);

// Customer-safe tools — usable by ANY caller (incl. a non-agent buyer on a voice call). They only
// ever act on the caller's OWN WhatsApp number (send property cards / a booking flow to caller.phone).
const PUBLIC_TOOLS = new Set(['search_and_show_properties', 'send_booking_flow']);

export async function resolveCaller(phone: string): Promise<ResolvedCaller | null> {
    const variants = phoneVariants(phone);
    const agent = await prisma.agent.findFirst({
        where: { phone: { in: variants }, status: 'active' },
        select: {
            id: true, name: true, phone: true, email: true, role: true,
            department: true, gender: true, preferred_language: true, tenant_id: true,
        },
    });
    if (!agent || !agent.phone) return null;
    return agent as ResolvedCaller;
}

export function canAccess(caller: ResolvedCaller, toolName: string): boolean {
    // Customer-safe tools are open to everyone (agents + guests).
    if (PUBLIC_TOOLS.has(toolName)) return true;
    if (caller.role === 'super_boss') {
        return EMPLOYEE_TOOLS.has(toolName) || MANAGER_TOOLS.has(toolName) || SUPER_BOSS_TOOLS.has(toolName);
    }
    if (caller.role === 'manager') {
        return EMPLOYEE_TOOLS.has(toolName) || MANAGER_TOOLS.has(toolName);
    }
    if (caller.role === 'employee') {
        return EMPLOYEE_TOOLS.has(toolName);
    }
    return false;
}
