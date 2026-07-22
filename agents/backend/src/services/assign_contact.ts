// src/services/assign_contact.ts
//
// Phase 5C — single choke point for SIMPLE contact-agent writes. Sets BOTH assigned_agent_id and
// assignment_method so the routing METHOD is always recorded alongside the assignment. Pass `tx` to
// enrol in an existing $transaction. A null agentId also nulls the method (an explicit unassign).
//
// INVARIANT: this does NOT change WHO gets assigned vs the inline `contact.update` it replaces — it
// only additionally records HOW the agent was chosen. Complex multi-field upserts (leads create,
// portal contact.upsert) stamp assignment_method inline instead of calling this.

import prisma from '../db';

export type AssignmentMethod =
  | 'sub_user'        // matched to the listing owner via portal email/phone
  | 'uploader'        // matched to the property uploader / inventory manager
  | 'round_robin'     // employee or manager rotation as the default path
  | 'manager_review'  // portal lead whose owner-match failed → parked on a manager
  | 'manual'          // admin/employee explicit assign/reassign/create/transfer
  | 'partner'         // partner-referral routing to the partner's managing agent
  | 'other';          // fixed super_boss default + SLA/workflow escalation

/**
 * Assign (or unassign) a contact's agent and record the routing method in one write.
 * @param phone   contact PK (phone_number)
 * @param agentId the resolved agent id, or null to unassign
 * @param method  how the agent was chosen (ignored/nulled when agentId is null)
 * @param tx      optional Prisma transaction client to enrol in an existing $transaction
 */
export async function assignContact(
  phone: string,
  agentId: string | null,
  method: AssignmentMethod | null,
  tx?: any,
): Promise<void> {
  const db: any = tx ?? prisma;
  await db.contact.update({
    where: { phone_number: phone },
    data: {
      assigned_agent_id: agentId,
      assignment_method: agentId ? method : null,
    },
  });
}
