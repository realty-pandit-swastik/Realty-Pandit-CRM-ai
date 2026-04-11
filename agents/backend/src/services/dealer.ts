
import prisma from '../db';

export class DealerService {
    public async assignLead(phone: string, agentId: string) {
        return prisma.contact.update({
            where: { phone_number: phone },
            data: { assigned_agent_id: agentId }
        });
    }

    public async getHotLeads(tenantId: string) {
        return prisma.contact.findMany({
            where: {
                tenant_id: tenantId,
                lead_status: { in: ['warm', 'hot'] }
            },
            orderBy: { updated_at: 'desc' }
        });
    }
}
