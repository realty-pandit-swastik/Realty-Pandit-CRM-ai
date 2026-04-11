// src/middleware/contact_visibility.ts
//
// Builds Prisma WHERE clause for contact visibility based on agent role + hierarchy.
// Apply this filter to ALL contact queries across the system.
//
// Rules:
//   super_boss  -> sees ALL contacts
//   manager     -> sees contacts created by self + direct subordinates
//   employee    -> sees ONLY contacts they created
//   null agent  -> no access (returns impossible filter)

import prisma from '../db';

export interface VisibilityFilter {
  created_by?: string | null | object;
  OR?: object[];
}

/**
 * Build a Prisma WHERE clause fragment that restricts contact visibility.
 * @param agentId - ID of the requesting agent
 * @param agentRole - Role: 'super_boss' | 'manager' | 'employee'
 */
export function buildContactVisibilityFilter(
  agentId: string,
  agentRole: string
): VisibilityFilter {
  if (agentRole === 'super_boss') {
    return {}; // No restriction -- sees all
  }

  if (agentRole === 'manager') {
    return {
      OR: [
        { created_by: agentId },
        { created_by_agent: { reports_to_id: agentId } },
      ],
    };
  }

  // employee -- only their own
  return { created_by: agentId };
}

/**
 * Build visibility filter for use in full contact queries (includes partner agent contacts).
 * Partner agent contacts: visible to partner agent themselves + their managing_agent.
 * @param agentId - ID of the requesting agent
 * @param agentRole - Role of requesting agent
 */
export async function buildFullContactVisibilityFilter(
  agentId: string,
  agentRole: string
): Promise<VisibilityFilter> {
  if (agentRole === 'super_boss') {
    return {};
  }

  // Get partner agents managed by this agent
  const managedPartners = await prisma.partnerAgent.findMany({
    where: { managing_agent_id: agentId },
    select: { phone_number: true },
  });
  const managedPartnerPhones = managedPartners.map((p) => p.phone_number);

  const ownFilter = buildContactVisibilityFilter(agentId, agentRole);

  if (managedPartnerPhones.length === 0) {
    return ownFilter;
  }

  // Include contacts created by managed partner agents
  return {
    OR: [
      ownFilter,
      { created_by: null, phone_number: { in: managedPartnerPhones } },
    ],
  };
}

/**
 * Check if a specific contact is visible to an agent.
 * Used for single-contact access checks (e.g., after full phone number search).
 */
export async function isContactVisibleTo(
  phoneNumber: string,
  agentId: string,
  agentRole: string
): Promise<boolean> {
  if (agentRole === 'super_boss') return true;

  const contact = await prisma.contact.findUnique({
    where: { phone_number: phoneNumber },
    select: { created_by: true },
  });

  if (!contact) return false;

  // Own contact
  if (contact.created_by === agentId) return true;

  // Subordinate's contact (manager check)
  if (agentRole === 'manager') {
    const creator = await prisma.agent.findUnique({
      where: { id: contact.created_by ?? '__none__' },
      select: { reports_to_id: true },
    });
    if (creator?.reports_to_id === agentId) return true;
  }

  // Partner agent contact: check if this agent manages the partner
  const partnerLink = await prisma.partnerAgent.findFirst({
    where: {
      phone_number: phoneNumber,
      managing_agent_id: agentId,
    },
  });
  if (partnerLink) return true;

  return false;
}
