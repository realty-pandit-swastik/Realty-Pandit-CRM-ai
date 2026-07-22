// src/services/ownership_service.ts
//
// Centralizes ownership of partner agents + their derived assets (inventory, contacts,
// transactions). Implements the 2026-04-17 middleman model:
//
//   - Single-manager ownership: each partner agent has exactly one managing_agent (Agent.id).
//   - Cascade reassignment: super_boss reassigns a partner → all their assets flow to the new
//     manager in one DB transaction.
//   - Manager deactivation cascade: when an internal agent is deactivated, everything they
//     owned flows to the super_boss (fallback owner).
//
// The cache columns (`owning_manager_id` on Contact/Inventory/Transaction) are the SSOT used
// for visibility/sanitization at query time. This service is the ONLY place they get updated.
//
// NOTE: prisma is cast to `any` for tables added in 2026-04-17 migration
// (partnerReassignmentLog). Once the prisma client is regenerated on deploy, the cast drops out.

import prisma from '../db';
import logger from '../utils/logger';

export interface ReassignResult {
    partnerId: string;
    fromAgentId: string | null;
    toAgentId: string;
    counts: { inventory: number; contacts: number; transactions: number };
}

export interface DeactivationResult {
    fromAgentId: string;
    toAgentId: string;
    counts: { partners: number; inventory: number; contacts: number; transactions: number };
}

export interface TransferAssetsOptions {
    partners?: boolean;
    inventory?: boolean;
    contacts?: boolean;
    leads?: boolean;
    transactions?: boolean;
}

export interface TransferAssetsResult {
    fromAgentId: string;
    toAgentId: string;
    counts: { partners: number; inventory: number; contacts: number; leads: number; transactions: number };
}

export class OwnershipService {
    /**
     * Reassign a partner agent to a new internal manager. Cascades ownership of:
     *   - the PartnerAgent row itself (managing_agent_id)
     *   - all Inventory rows where referral_partner_id = this partner
     *   - all Contact rows where referral_partner_id = this partner
     *   - all Transaction rows where owning_manager_id = old manager AND the deal involves this partner
     *
     * Caller must ensure the requesting user has super_boss role (enforce via middleware).
     */
    async reassignPartner(
        partnerId: string,
        toAgentId: string,
        performedByAgentId: string,
        reason?: string,
    ): Promise<ReassignResult> {
        const partner = await prisma.partnerAgent.findUnique({
            where: { id: partnerId },
            select: { id: true, managing_agent_id: true, phone_number: true },
        });
        if (!partner) throw new Error(`Partner agent ${partnerId} not found`);

        const fromAgentId = partner.managing_agent_id;
        if (fromAgentId === toAgentId) {
            throw new Error(`Partner is already assigned to agent ${toAgentId}`);
        }

        const toAgent = await prisma.agent.findUnique({ where: { id: toAgentId }, select: { id: true } });
        if (!toAgent) throw new Error(`Target agent ${toAgentId} not found`);

        return await prisma.$transaction(async (tx) => {
            await tx.partnerAgent.update({
                where: { id: partnerId },
                data: { managing_agent_id: toAgentId },
            });

            const inv = await (tx as any).inventory.updateMany({
                where: { referral_partner_id: partnerId },
                data: { owning_manager_id: toAgentId },
            });

            const contacts = await (tx as any).contact.updateMany({
                where: { referral_partner_id: partnerId },
                data: { owning_manager_id: toAgentId },
            });

            // Transactions: update ones currently owned by old manager AND involving this partner.
            const transactions = await (tx as any).transaction.updateMany({
                where: {
                    owning_manager_id: fromAgentId ?? undefined,
                    OR: [
                        { demand_handler_type: 'PARTNER', demand_handler_id: partnerId },
                        { supply_handler_type: 'PARTNER', supply_handler_id: partnerId },
                    ],
                },
                data: { owning_manager_id: toAgentId },
            });

            await (tx as any).partnerReassignmentLog.create({
                data: {
                    partner_agent_id: partnerId,
                    from_agent_id: fromAgentId,
                    to_agent_id: toAgentId,
                    performed_by_agent_id: performedByAgentId,
                    reason: reason ?? null,
                },
            });

            logger.info(
                `[Ownership] reassigned partner=${partnerId} ${fromAgentId ?? 'null'} -> ${toAgentId} ` +
                `(inv=${inv.count} contacts=${contacts.count} txn=${transactions.count})`,
            );

            return {
                partnerId,
                fromAgentId,
                toAgentId,
                counts: { inventory: inv.count, contacts: contacts.count, transactions: transactions.count },
            };
        });
    }

    /**
     * When an internal agent is deactivated, flow all their owned assets to the super_boss.
     * If superBossId is omitted, the first active agent with role='super_boss' is used.
     */
    async cascadeOnAgentDeactivation(agentId: string, superBossId?: string): Promise<DeactivationResult> {
        const superBoss = superBossId
            ? await prisma.agent.findUnique({ where: { id: superBossId }, select: { id: true } })
            : await prisma.agent.findFirst({
                  where: { role: 'super_boss', status: 'active' },
                  select: { id: true },
              });
        if (!superBoss) throw new Error('No active super_boss found to receive assets');
        if (superBoss.id === agentId) throw new Error('Cannot deactivate the super_boss via this flow');

        return await prisma.$transaction(async (tx) => {
            const partners = await tx.partnerAgent.updateMany({
                where: { managing_agent_id: agentId },
                data: { managing_agent_id: superBoss.id },
            });
            const inv = await (tx as any).inventory.updateMany({
                where: { owning_manager_id: agentId },
                data: { owning_manager_id: superBoss.id },
            });
            const invAssigned = await (tx as any).inventory.updateMany({
                where: { assigned_agent_id: agentId },
                data: { assigned_agent_id: superBoss.id },
            });
            // Bug fix 2026-05-12: was `tx.leads` (plural) — Prisma client property is the
            // singular model name (Lead → tx.lead). Typo caused a 500 on every deactivation.
            const leadsAssigned = await (tx as any).lead.updateMany({
                where: { assigned_agent_id: agentId },
                data: { assigned_agent_id: superBoss.id },
            });
            const contactsOwned = await (tx as any).contact.updateMany({
                where: { owning_manager_id: agentId },
                data: { owning_manager_id: superBoss.id },
            });
            // Bug C fix 2026-05-12: cascade now also clears `assigned_agent_id` so
            // contacts assigned to a deactivated agent don't become invisible orphans.
            const contactsAssigned = await (tx as any).contact.updateMany({
                where: { assigned_agent_id: agentId },
                data: { assigned_agent_id: superBoss.id },
            });
            const transactions = await (tx as any).transaction.updateMany({
                where: { owning_manager_id: agentId },
                data: { owning_manager_id: superBoss.id },
            });
            await tx.agent.update({
                where: { id: agentId },
                data: { status: 'inactive' },
            });

            logger.warn(
                `[Ownership] cascaded deactivation agent=${agentId} -> super=${superBoss.id} ` +
                `(partners=${partners.count} inv_owned=${inv.count} inv_assigned=${invAssigned.count} ` +
                `leads=${leadsAssigned.count} contacts_owned=${contactsOwned.count} ` +
                `contacts_assigned=${contactsAssigned.count} txn=${transactions.count})`,
            );

            return {
                fromAgentId: agentId,
                toAgentId: superBoss.id,
                counts: {
                    partners: partners.count,
                    inventory: inv.count + invAssigned.count,
                    leads: leadsAssigned.count,
                    contacts: contactsOwned.count + contactsAssigned.count,
                    transactions: transactions.count,
                },
            };
        });
    }

    /**
     * Transfer some or all of an agent's assets to another agent. Used by the
     * 2026-05-12 "Reassign before deactivate" workflow — admin selects exactly
     * which buckets to move (and could split across multiple successors by
     * calling this method repeatedly with different bucket selections).
     *
     * Does NOT change the source agent's status — keep that explicit at the
     * route layer. Safe to call on active agents (e.g. load-balancing).
     */
    async transferAssets(
        fromAgentId: string,
        toAgentId: string,
        performedByAgentId: string,
        options: TransferAssetsOptions = {
            partners: true, inventory: true, contacts: true, leads: true, transactions: true,
        },
    ): Promise<TransferAssetsResult> {
        if (fromAgentId === toAgentId) {
            throw new Error('Cannot transfer to the same agent');
        }
        const target = await prisma.agent.findUnique({ where: { id: toAgentId }, select: { id: true, status: true } });
        if (!target) throw new Error(`Target agent ${toAgentId} not found`);
        if (target.status !== 'active') throw new Error(`Target agent is ${target.status}; pick an active agent`);

        return await prisma.$transaction(async (tx) => {
            let partners = 0, invOwned = 0, invAssigned = 0, leads = 0, contactsOwned = 0, contactsAssigned = 0, txns = 0;

            if (options.partners) {
                const r = await tx.partnerAgent.updateMany({
                    where: { managing_agent_id: fromAgentId },
                    data: { managing_agent_id: toAgentId },
                });
                partners = r.count;
            }
            if (options.inventory) {
                const r1 = await (tx as any).inventory.updateMany({
                    where: { owning_manager_id: fromAgentId },
                    data: { owning_manager_id: toAgentId },
                });
                const r2 = await (tx as any).inventory.updateMany({
                    where: { assigned_agent_id: fromAgentId },
                    data: { assigned_agent_id: toAgentId },
                });
                invOwned = r1.count;
                invAssigned = r2.count;
            }
            if (options.leads) {
                const r = await (tx as any).lead.updateMany({
                    where: { assigned_agent_id: fromAgentId },
                    data: { assigned_agent_id: toAgentId },
                });
                leads = r.count;
            }
            if (options.contacts) {
                const r1 = await (tx as any).contact.updateMany({
                    where: { owning_manager_id: fromAgentId },
                    data: { owning_manager_id: toAgentId },
                });
                const r2 = await (tx as any).contact.updateMany({
                    where: { assigned_agent_id: fromAgentId },
                    data: { assigned_agent_id: toAgentId, assignment_method: 'manual' }, // Phase 5C — admin transfer
                });
                contactsOwned = r1.count;
                contactsAssigned = r2.count;
            }
            if (options.transactions) {
                const r = await (tx as any).transaction.updateMany({
                    where: { owning_manager_id: fromAgentId },
                    data: { owning_manager_id: toAgentId },
                });
                txns = r.count;
            }

            logger.info(
                `[Ownership] transferAssets ${fromAgentId} -> ${toAgentId} by ${performedByAgentId} ` +
                `(partners=${partners} inv_owned=${invOwned} inv_assigned=${invAssigned} ` +
                `leads=${leads} contacts_owned=${contactsOwned} contacts_assigned=${contactsAssigned} txn=${txns})`,
            );

            return {
                fromAgentId,
                toAgentId,
                counts: {
                    partners,
                    inventory: invOwned + invAssigned,
                    contacts: contactsOwned + contactsAssigned,
                    leads,
                    transactions: txns,
                },
            };
        });
    }

    /**
     * Resolve the owning manager for a partner agent (their managing_agent_id).
     * Returns null if the partner has no manager assigned (fallback to super_boss at the
     * permission layer, not here).
     */
    async resolveOwningManagerForPartner(partnerId: string): Promise<string | null> {
        const p = await prisma.partnerAgent.findUnique({
            where: { id: partnerId },
            select: { managing_agent_id: true },
        });
        return p?.managing_agent_id ?? null;
    }

    /**
     * Summarize how many assets an internal agent currently owns. Used by the admin UI
     * to preview the cascade impact before confirming deactivation/reassignment.
     */
    async getOwnershipSummary(agentId: string) {
        // Bug C fix 2026-05-12: include `assigned_agent_id` counts so the cascade
        // preview matches what `cascadeOnAgentDeactivation` actually transfers.
        const [
            partners,
            invOwned,
            invAssigned,
            contactsOwned,
            contactsAssigned,
            leadsAssigned,
            transactions,
        ] = await Promise.all([
            prisma.partnerAgent.count({ where: { managing_agent_id: agentId } }),
            (prisma as any).inventory.count({ where: { owning_manager_id: agentId } }),
            (prisma as any).inventory.count({ where: { assigned_agent_id: agentId } }),
            (prisma as any).contact.count({ where: { owning_manager_id: agentId } }),
            (prisma as any).contact.count({ where: { assigned_agent_id: agentId } }),
            (prisma as any).lead.count({ where: { assigned_agent_id: agentId } }),
            (prisma as any).transaction.count({ where: { owning_manager_id: agentId } }),
        ]);
        return {
            partners,
            inventory: invOwned + invAssigned,
            contacts: contactsOwned + contactsAssigned,
            leads: leadsAssigned,
            transactions,
        };
    }
}

export const ownershipService = new OwnershipService();
