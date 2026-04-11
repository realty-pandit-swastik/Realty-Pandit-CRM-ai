
import prisma from '../../db';
import logger from '../../utils/logger';

export interface SessionData {
    id: string;
    state: string;
    data: any;
    lastUpdated: number;
}

export interface SessionStore {
    getSession(id: string): Promise<SessionData | null>;
    saveSession(id: string, data: SessionData): Promise<void>;
    deleteSession(id: string): Promise<void>;
}

/**
 * DB-backed session store using ConversationSession table.
 * Survives PM2 restarts unlike InMemorySessionStore.
 *
 * Maps inventory session IDs (e.g. phone numbers or "inv_<phone>")
 * to ConversationSession rows with workflow = 'inventory'.
 */
class DBSessionStore implements SessionStore {
    private extractPhone(sessionId: string): string {
        // Strip "inv_" prefix if present
        return sessionId.startsWith('inv_') ? sessionId.slice(4) : sessionId;
    }

    async getSession(id: string): Promise<SessionData | null> {
        try {
            const phone = this.extractPhone(id);
            const row = await prisma.conversationSession.findFirst({
                where: {
                    phone_number: phone,
                    workflow: 'inventory',
                    active: true,
                },
                orderBy: { updated_at: 'desc' },
            });

            if (!row) return null;

            const ctx = (row.context || {}) as any;
            return {
                id,
                state: row.state,
                data: ctx,
                lastUpdated: row.updated_at.getTime(),
            };
        } catch (error) {
            logger.error('[DBSessionStore] getSession failed:', error);
            return null;
        }
    }

    async saveSession(id: string, data: SessionData): Promise<void> {
        try {
            const phone = this.extractPhone(id);

            // Find existing active inventory session for this phone
            const existing = await prisma.conversationSession.findFirst({
                where: {
                    phone_number: phone,
                    workflow: 'inventory',
                    active: true,
                },
            });

            if (existing) {
                await prisma.conversationSession.update({
                    where: { id: existing.id },
                    data: {
                        state: data.state,
                        context: data.data,
                    },
                });
            } else {
                // Need tenant_id — get from contact or use first tenant
                const contact = await prisma.contact.findUnique({ where: { phone_number: phone } });
                const tenantId = contact?.tenant_id || (await prisma.tenant.findFirst())?.id;

                if (!tenantId) {
                    logger.error('[DBSessionStore] No tenant found, cannot create session');
                    return;
                }

                // Ensure contact exists
                if (!contact) {
                    await prisma.contact.create({
                        data: {
                            phone_number: phone,
                            tenant_id: tenantId,
                            name: 'Unknown',
                            source: 'whatsapp',
                            contact_type: 'UNKNOWN',
                        },
                    });
                }

                await prisma.conversationSession.create({
                    data: {
                        phone_number: phone,
                        workflow: 'inventory',
                        state: data.state,
                        context: data.data,
                        active: true,
                    },
                });
            }
        } catch (error) {
            logger.error('[DBSessionStore] saveSession failed:', error);
        }
    }

    async deleteSession(id: string): Promise<void> {
        try {
            const phone = this.extractPhone(id);
            await prisma.conversationSession.updateMany({
                where: {
                    phone_number: phone,
                    workflow: 'inventory',
                    active: true,
                },
                data: { active: false },
            });
        } catch (error) {
            logger.error('[DBSessionStore] deleteSession failed:', error);
        }
    }
}

export const sessionStore = new DBSessionStore();
