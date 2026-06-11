// src/services/commission_service.ts
//
// Manual post-deal commission capture (2026-04-17 — middleman model).
// No rigid splits enforced — each party enters what they earned; we sum the pool.
//
// Parties (CommissionPartyType enum in schema):
//   - INTERNAL_AGENT  (agent_id required)
//   - PARTNER_AGENT   (partner_agent_id required)
//   - PLATFORM        (neither agent_id nor partner_agent_id)
//
// prisma is cast to `any` for dealCommissionEntry until the prisma client regenerates on deploy.

import prisma from '../db';
import { Prisma } from '@prisma/client';
import logger from '../utils/logger';

export type PartyType = 'INTERNAL_AGENT' | 'PARTNER_AGENT' | 'PLATFORM';

export interface CommissionInput {
    partyType: PartyType;
    agentId?: string;
    partnerAgentId?: string;
    amount: number | string;
    currency?: string;
    notes?: string;
    enteredBy: string;
}

export interface CommissionEntry {
    id: string;
    transaction_id: string;
    party_type: PartyType;
    agent_id: string | null;
    partner_agent_id: string | null;
    amount: Prisma.Decimal;
    currency: string;
    notes: string | null;
    entered_by_agent_id: string;
    entered_at: Date;
}

export interface CommissionSummary {
    total: Prisma.Decimal;
    entries: CommissionEntry[];
    byParty: {
        INTERNAL_AGENT: Prisma.Decimal;
        PARTNER_AGENT: Prisma.Decimal;
        PLATFORM: Prisma.Decimal;
    };
}

export class CommissionService {
    async recordEntry(transactionId: string, input: CommissionInput): Promise<CommissionEntry> {
        const txn = await prisma.transaction.findUnique({
            where: { id: transactionId },
            select: { id: true },
        });
        if (!txn) throw new Error(`Transaction ${transactionId} not found`);

        if (input.partyType === 'INTERNAL_AGENT' && !input.agentId) {
            throw new Error('agentId is required for INTERNAL_AGENT entries');
        }
        if (input.partyType === 'PARTNER_AGENT' && !input.partnerAgentId) {
            throw new Error('partnerAgentId is required for PARTNER_AGENT entries');
        }

        const amount = new Prisma.Decimal(input.amount);
        if (amount.lte(0)) throw new Error('Commission amount must be positive');

        const entry = await (prisma as any).dealCommissionEntry.create({
            data: {
                transaction_id: transactionId,
                party_type: input.partyType,
                agent_id: input.agentId ?? null,
                partner_agent_id: input.partnerAgentId ?? null,
                amount,
                currency: input.currency ?? 'INR',
                notes: input.notes ?? null,
                entered_by_agent_id: input.enteredBy,
            },
        });

        logger.info(
            `[Commission] entry recorded txn=${transactionId} party=${input.partyType} ` +
            `amount=${amount.toFixed(2)} by=${input.enteredBy}`,
        );
        return entry as CommissionEntry;
    }

    async summarize(transactionId: string): Promise<CommissionSummary> {
        const entries = (await (prisma as any).dealCommissionEntry.findMany({
            where: { transaction_id: transactionId },
            orderBy: { entered_at: 'asc' },
        })) as CommissionEntry[];

        const zero = new Prisma.Decimal(0);
        const byParty = {
            INTERNAL_AGENT: zero,
            PARTNER_AGENT: zero,
            PLATFORM: zero,
        };
        let total = zero;
        for (const e of entries) {
            total = total.plus(e.amount);
            byParty[e.party_type] = byParty[e.party_type].plus(e.amount);
        }
        return { total, entries, byParty };
    }
}

export const commissionService = new CommissionService();
