
import prisma from '../db';
import logger from '../utils/logger';
import { PlanType } from '@prisma/client';

/**
 * Commission Service - PHASE 13: Updated for Unified Owner Model
 *
 * Commission Logic:
 * - FREE plan owners: 2% commission to platform
 * - All other plans (BASIC, PRO, PREMIUM): No commission
 * - Applies to ALL external owner types (agents, agencies, builders)
 */

export interface CommissionResult {
    required: boolean;
    amount?: number;
    rate?: number;
    message?: string;
}

export class CommissionService {

    /**
     * Calculate commission for a deal
     * PHASE 13: Uses Owner model instead of PartnerAgent
     */
    async calculateCommission(ownerId: string, dealValue: number): Promise<CommissionResult> {
        const owner = await prisma.owner.findUnique({
            where: { id: ownerId },
            include: {
                subscription: true,
                contact: true
            }
        });

        if (!owner) {
            throw new Error('Owner not found');
        }

        // Commission applies ONLY to FREE plan
        const planType = owner.subscription?.plan_type || PlanType.FREE;

        if (planType !== PlanType.FREE) {
            return {
                required: false,
                message: `No commission required for ${planType} plan`
            };
        }

        // FREE plan: 2% commission
        const rate = 2.0;
        const amount = (dealValue * rate) / 100;

        logger.info(`[Commission] Calculated commission for owner ${owner.contact.name}: ${amount} (${rate}% of ${dealValue})`);

        return { required: true, amount, rate };
    }

    /**
     * Process deal closure and record commission
     * PHASE 13: Updated to use Owner model
     */
    async processDealClosure(visitId: string, dealValue: number, propertyId: string): Promise<CommissionResult> {
        // Get property to find owner
        const property = await prisma.inventory.findUnique({
            where: { id: propertyId },
            include: {
                owner: {
                    include: {
                        subscription: true,
                        contact: true
                    }
                }
            }
        });

        if (!property || !property.owner) {
            throw new Error("Property or Owner not found");
        }

        const ownerId = property.owner.id;
        const commissionResult = await this.calculateCommission(ownerId, dealValue);

        // If commission is required, record it
        if (commissionResult.required && commissionResult.amount) {
            await prisma.commission.create({
                data: {
                    owner_id: ownerId,
                    visit_id: visitId,
                    property_id: propertyId,
                    deal_value: dealValue,
                    commission_rate: commissionResult.rate!,
                    commission_amount: commissionResult.amount,
                    status: 'PENDING',
                    notes: `Commission for deal closure. Value: ₹${dealValue}`
                }
            });

            logger.info(`[Commission] Recorded pending commission of ₹${commissionResult.amount} for owner ${property.owner.contact.name}`);
        }

        return commissionResult;
    }

    /**
     * Get all pending commissions for an owner
     */
    async getPendingCommissions(ownerId: string) {
        return await prisma.commission.findMany({
            where: {
                owner_id: ownerId,
                status: 'PENDING'
            },
            orderBy: {
                created_at: 'desc'
            }
        });
    }

    /**
     * Mark commission as paid
     */
    async markAsPaid(commissionId: string): Promise<void> {
        await prisma.commission.update({
            where: { id: commissionId },
            data: {
                status: 'PAID',
                paid_at: new Date()
            }
        });

        logger.info(`[Commission] Marked commission ${commissionId} as PAID`);
    }
}
