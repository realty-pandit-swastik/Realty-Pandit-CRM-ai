/**
 * Contact Identifier — Smart phone-based identification.
 *
 * Before defaulting to UNKNOWN, checks Agent, PartnerAgent, and Owner tables
 * to identify who is messaging on WhatsApp.
 *
 * Handles phone format mismatch: WhatsApp sends "919958860411" but DB may
 * store "+919958860411". Checks both formats.
 */

import prisma from '../db';
import logger from '../utils/logger';
import { phoneVariants } from '../utils/phone';

export interface IdentifiedContact {
    contact_type: 'MANAGEMENT' | 'PARTNER_AGENT' | 'REAL_ESTATE_BUILDER';
    name: string | null;
    email: string | null;
    source_table: string;
    source_id: string;
    department?: string | null;
    role?: string | null;
    gender?: string | null;
    preferred_language?: string | null;
}

/**
 * Identify an incoming phone number against known entity tables.
 * Returns null if phone not found in any table.
 */
export async function identifyContact(phone: string): Promise<IdentifiedContact | null> {
    const variants = phoneVariants(phone);

    try {
        // 1. Check Agent table (internal team: management, sales agents, employees)
        const agent = await prisma.agent.findFirst({
            where: { phone: { in: variants }, status: 'active' },
            select: { id: true, name: true, email: true, department: true, role: true, gender: true, preferred_language: true },
        });

        if (agent) {
            // ALL internal agents (super_boss, manager, employee) are MANAGEMENT
            // They are team members and should be recognized by Panditji
            logger.info(`[ContactIdentifier] ${phone} → Agent (MGMT): ${agent.name} (${agent.role}/${agent.department})`);
            return {
                contact_type: 'MANAGEMENT',
                name: agent.name,
                email: agent.email,
                source_table: 'Agent',
                source_id: agent.id,
                department: agent.department,
                role: agent.role,
                gender: agent.gender,
                preferred_language: agent.preferred_language,
            };
        }

        // 2. Check PartnerAgent table (external agents/dealers)
        // phone_number is @unique, so try each variant
        for (const v of variants) {
            const partnerAgent = await prisma.partnerAgent.findUnique({
                where: { phone_number: v },
                select: { id: true, name: true, email: true, status: true },
            });

            if (partnerAgent && partnerAgent.status === 'ACTIVE') {
                logger.info(`[ContactIdentifier] ${phone} → PartnerAgent: ${partnerAgent.name}`);
                return {
                    contact_type: 'PARTNER_AGENT',
                    name: partnerAgent.name,
                    email: partnerAgent.email,
                    source_table: 'PartnerAgent',
                    source_id: partnerAgent.id,
                };
            }
        }

        // 3. Check Owner table (builders)
        for (const v of variants) {
            const owner = await prisma.owner.findUnique({
                where: { contact_phone: v },
                select: {
                    id: true,
                    externalType: true,
                    status: true,
                    contact: { select: { name: true, email: true } },
                },
            });

            if (owner && owner.externalType === 'REAL_ESTATE_BUILDER' && owner.status === 'ACTIVE') {
                logger.info(`[ContactIdentifier] ${phone} → Builder: ${owner.contact?.name}`);
                return {
                    contact_type: 'REAL_ESTATE_BUILDER',
                    name: owner.contact?.name || null,
                    email: owner.contact?.email || null,
                    source_table: 'Owner',
                    source_id: owner.id,
                };
            }
        }

        // Not found in any table
        return null;
    } catch (error) {
        logger.error(`[ContactIdentifier] Error identifying ${phone}:`, error);
        return null;
    }
}
