/**
 * Subscription Service - Plan Management & Lifecycle
 *
 * PHASE 13: Business Logic Layer
 * Handles plan upgrades, downgrades, renewals, and expiry
 */

import { PlanType, SubscriptionStatus } from '@prisma/client';
import prisma from '../db';
import { PlanPermissions, permissionEngine } from './permission_engine';
import logger from '../utils/logger';

/**
 * Subscription Service Class
 * Manages subscription lifecycle and plan transitions
 */
export class SubscriptionService {

    /**
     * Upgrade owner to a new plan
     * Handles payment processing (future), limits, and notifications
     */
    async upgradePlan(ownerId: string, newPlan: PlanType): Promise<void> {
        try {
            logger.info(`[SubscriptionService] Upgrading owner ${ownerId} to ${newPlan}`);

            const owner = await prisma.owner.findUnique({
                where: { id: ownerId },
                include: {
                    subscription: true,
                    inventory: { where: { status: 'active' } }
                }
            });

            if (!owner || !owner.subscription) {
                throw new Error('Owner or subscription not found');
            }

            const oldPlan = owner.subscription.plan_type;
            const oldLimit = PlanPermissions[oldPlan].listingLimit;
            const newLimit = PlanPermissions[newPlan].listingLimit;

            // Validate upgrade/downgrade constraints
            if (oldPlan === newPlan) {
                throw new Error(`Already on ${newPlan} plan`);
            }

            // Check if downgrade would exceed new listing limit
            const activeListingsCount = owner.inventory.length;
            if (newLimit < oldLimit && activeListingsCount > newLimit) {
                throw new Error(
                    `Cannot downgrade: ${activeListingsCount} active listings exceed ${newPlan} plan limit of ${newLimit}. ` +
                    `Please deactivate ${activeListingsCount - newLimit} listings first.`
                );
            }

            // Calculate new priority score
            const newPriorityScore = permissionEngine.calculatePriority({
                ...owner,
                subscription: { ...owner.subscription, plan_type: newPlan }
            });

            // Calculate subscription dates
            const startDate = new Date();
            const endDate = permissionEngine.calculateSubscriptionEndDate(newPlan, startDate);

            // Update subscription and owner in interactive transaction (proper rollback)
            await prisma.$transaction(async (tx) => {
                await tx.subscription.update({
                    where: { owner_id: ownerId },
                    data: {
                        plan_type: newPlan,
                        status: newPlan === PlanType.FREE
                            ? SubscriptionStatus.ACTIVE
                            : SubscriptionStatus.PENDING_PAYMENT,
                        start_date: startDate,
                        end_date: endDate
                    }
                });
                await tx.owner.update({
                    where: { id: ownerId },
                    data: {
                        listing_limit: newLimit,
                        priority_score: newPriorityScore
                    }
                });
            });

            logger.info(`[SubscriptionService] Successfully upgraded owner ${ownerId} from ${oldPlan} to ${newPlan}`);

            // TODO: Send WhatsApp notification
            // TODO: Update priority scores for existing listings
            // TODO: If paid plan, integrate with payment gateway

        } catch (error) {
            logger.error('[SubscriptionService] Error upgrading plan:', error);
            throw error;
        }
    }

    /**
     * Downgrade owner to a lower plan
     * Same as upgrade but validates listing limits
     */
    async downgradePlan(ownerId: string, newPlan: PlanType): Promise<void> {
        return this.upgradePlan(ownerId, newPlan);
    }

    /**
     * Renew subscription (extends end date)
     * For paid plans with auto-renewal or manual renewal
     */
    async renewSubscription(ownerId: string): Promise<void> {
        logger.info(`[SubscriptionService] Renewing subscription for owner ${ownerId}`);

        const owner = await prisma.owner.findUnique({
            where: { id: ownerId },
            include: { subscription: true }
        });

        if (!owner || !owner.subscription) {
            throw new Error('Owner or subscription not found');
        }

        const planType = owner.subscription.plan_type;

        if (planType === PlanType.FREE) {
            throw new Error('FREE plan does not require renewal');
        }

        // Calculate new end date (30 days from current end date or now, whichever is later)
        const now = new Date();
        const currentEndDate = owner.subscription.end_date || now;
        const renewalStartDate = currentEndDate > now ? currentEndDate : now;
        const newEndDate = new Date(renewalStartDate);
        newEndDate.setDate(newEndDate.getDate() + 30);

        await prisma.subscription.update({
            where: { owner_id: ownerId },
            data: {
                status: SubscriptionStatus.ACTIVE,
                end_date: newEndDate
            }
        });

        logger.info(`[SubscriptionService] Renewed subscription for owner ${ownerId} until ${newEndDate}`);

        // TODO: Send WhatsApp confirmation
    }

    /**
     * Handle subscription expiry
     * Cron job: Find expired subscriptions and downgrade to FREE
     */
    async handleExpiry(): Promise<{ processed: number; errors: string[] }> {
        logger.info('[SubscriptionService] Running subscription expiry check...');

        const errors: string[] = [];
        let processed = 0;

        try {
            // Find all expired subscriptions (end_date < now AND status = ACTIVE)
            const now = new Date();
            const expiredSubscriptions = await prisma.subscription.findMany({
                where: {
                    end_date: { lt: now },
                    status: SubscriptionStatus.ACTIVE,
                    plan_type: { not: PlanType.FREE }
                },
                include: {
                    owner: {
                        include: {
                            inventory: { where: { status: 'active' } }
                        }
                    }
                }
            });

            logger.info(`[SubscriptionService] Found ${expiredSubscriptions.length} expired subscriptions`);

            for (const subscription of expiredSubscriptions) {
                try {
                    const ownerId = subscription.owner_id;
                    const activeListings = subscription.owner.inventory.length;
                    const freeLimit = PlanPermissions[PlanType.FREE].listingLimit;

                    logger.info(`[SubscriptionService] Processing expired subscription for owner ${ownerId}`);

                    await prisma.$transaction(async (tx) => {
                        // Update subscription to EXPIRED
                        await tx.subscription.update({
                            where: { owner_id: ownerId },
                            data: {
                                status: SubscriptionStatus.EXPIRED
                            }
                        });

                        // Downgrade to FREE plan
                        await tx.subscription.update({
                            where: { owner_id: ownerId },
                            data: {
                                plan_type: PlanType.FREE,
                                status: SubscriptionStatus.ACTIVE,
                                start_date: now,
                                end_date: null
                            }
                        });

                        // Update owner limits
                        await tx.owner.update({
                            where: { id: ownerId },
                            data: {
                                listing_limit: freeLimit,
                                priority_score: PlanPermissions[PlanType.FREE].priorityBase
                            }
                        });

                        // If active listings > FREE limit, deactivate excess listings (oldest first)
                        if (activeListings > freeLimit) {
                            const excessCount = activeListings - freeLimit;

                            // Get oldest listings
                            const listingsToDeactivate = await tx.inventory.findMany({
                                where: {
                                    owner_id: ownerId,
                                    status: 'active'
                                },
                                orderBy: { created_at: 'asc' },
                                take: excessCount
                            });

                            // Deactivate them
                            await tx.inventory.updateMany({
                                where: {
                                    id: { in: listingsToDeactivate.map(l => l.id) }
                                },
                                data: { status: 'withdrawn' }
                            });

                            logger.warn(`[SubscriptionService] Deactivated ${excessCount} excess listings for owner ${ownerId}`);
                        }
                    });

                    processed++;
                    logger.info(`[SubscriptionService] Successfully downgraded owner ${ownerId} to FREE plan`);

                    // TODO: Send WhatsApp notification about expiry and downgrade

                } catch (error) {
                    const errorMsg = `Error processing expired subscription for owner ${subscription.owner_id}: ${(error as Error).message}`;
                    logger.error(errorMsg);
                    errors.push(errorMsg);
                }
            }

            logger.info(`[SubscriptionService] Expiry check complete. Processed: ${processed}, Errors: ${errors.length}`);

            return { processed, errors };

        } catch (error) {
            logger.error('[SubscriptionService] Fatal error in expiry check:', error);
            throw error;
        }
    }

    /**
     * Cancel subscription (user-initiated)
     * Immediately downgrades to FREE plan
     */
    async cancelSubscription(ownerId: string, reason?: string): Promise<void> {
        logger.info(`[SubscriptionService] Cancelling subscription for owner ${ownerId}. Reason: ${reason || 'Not provided'}`);

        const owner = await prisma.owner.findUnique({
            where: { id: ownerId },
            include: { subscription: true }
        });

        if (!owner || !owner.subscription) {
            throw new Error('Owner or subscription not found');
        }

        if (owner.subscription.plan_type === PlanType.FREE) {
            throw new Error('Already on FREE plan');
        }

        // Downgrade to FREE immediately
        await this.upgradePlan(ownerId, PlanType.FREE);

        logger.info(`[SubscriptionService] Cancelled subscription and downgraded owner ${ownerId} to FREE plan`);

        // TODO: Send WhatsApp confirmation
    }

    /**
     * Get subscription details
     */
    async getSubscription(ownerId: string) {
        const subscription = await prisma.subscription.findUnique({
            where: { owner_id: ownerId },
            include: {
                owner: {
                    include: {
                        contact: true
                    }
                }
            }
        });

        if (!subscription) {
            throw new Error('Subscription not found');
        }

        const permissions = await permissionEngine.getPermissions(ownerId);
        const daysRemaining = subscription.end_date
            ? Math.ceil((subscription.end_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null;

        return {
            ...subscription,
            permissions,
            daysRemaining,
            isExpired: daysRemaining !== null && daysRemaining < 0,
            isExpiringSoon: daysRemaining !== null && daysRemaining <= 7 && daysRemaining > 0
        };
    }

    /**
     * Get subscription price for a plan
     */
    getPrice(planType: PlanType): number {
        return permissionEngine.getSubscriptionPrice(planType);
    }
}

// Singleton instance
export const subscriptionService = new SubscriptionService();
