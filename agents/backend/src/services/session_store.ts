
import prisma from '../db';

export interface SessionData {
    workflow: string;
    state: string;
    context: Record<string, any>;
}

/**
 * DB-backed session store. Persists workflow state across server restarts.
 * Replaces any in-memory session tracking.
 */
export class SessionStore {

    /**
     * Get the active session for a phone number, or null if none exists.
     */
    async getSession(phoneNumber: string): Promise<SessionData | null> {
        const session = await prisma.conversationSession.findFirst({
            where: { phone_number: phoneNumber, active: true },
            orderBy: { updated_at: 'desc' }
        });

        if (!session) return null;

        return {
            workflow: session.workflow,
            state: session.state,
            context: (session.context as Record<string, any>) || {}
        };
    }

    /**
     * Create or update the active session for a phone number.
     */
    async setSession(phoneNumber: string, data: SessionData): Promise<void> {
        const existing = await prisma.conversationSession.findFirst({
            where: { phone_number: phoneNumber, active: true }
        });

        if (existing) {
            await prisma.conversationSession.update({
                where: { id: existing.id },
                data: {
                    workflow: data.workflow,
                    state: data.state,
                    context: data.context
                }
            });
        } else {
            await prisma.conversationSession.create({
                data: {
                    phone_number: phoneNumber,
                    workflow: data.workflow,
                    state: data.state,
                    context: data.context
                }
            });
        }
    }

    /**
     * Update just the state and context of an existing session.
     */
    async updateState(phoneNumber: string, state: string, context?: Record<string, any>): Promise<void> {
        const existing = await prisma.conversationSession.findFirst({
            where: { phone_number: phoneNumber, active: true }
        });

        if (existing) {
            const updateData: any = { state };
            if (context !== undefined) {
                updateData.context = { ...(existing.context as any || {}), ...context };
            }
            await prisma.conversationSession.update({
                where: { id: existing.id },
                data: updateData
            });
        }
    }

    /**
     * End the active session (mark as inactive).
     */
    async endSession(phoneNumber: string): Promise<void> {
        await prisma.conversationSession.updateMany({
            where: { phone_number: phoneNumber, active: true },
            data: { active: false }
        });
    }
}
