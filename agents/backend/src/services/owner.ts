/**
 * Owner Service - CRUD Operations for Unified Owner Model
 *
 * PHASE 13: Business Logic Layer
 * Manages owner lifecycle: creation, updates, suspension, subscription management
 */

import { OwnerScope, ExternalOwnerType, OwnerStatus, PlanType, SubscriptionStatus } from '@prisma/client';
import prisma from '../db';
import { permissionEngine, PlanPermissions } from './permission_engine';
import logger from '../utils/logger';

// DTOs (Data Transfer Objects)
export interface CreateOwnerDTO {
    contactPhone: string;
    scope: OwnerScope;
    externalType?: ExternalOwnerType;
    planType?: PlanType;
    contactName?: string;
    contactEmail?: string;
}

export interface UpdateOwnerDTO {
    status?: OwnerStatus;
    listing_limit?: number;
    priority_score?: number;
}

/**
 * Owner Service Class
 * Central service for all owner-related operations
 */
export class OwnerService {

    /**
     * Create a new owner with subscription
     * Validates contact exists and creates Owner + Subscription atomically
     */
    async createOwner(data: CreateOwnerDTO) {
        try {
            logger.info('[OwnerService] Creating owner:', data);

            // Validate contact exists or create it
            let contact = await prisma.contact.findUnique({
                where: { phone_number: data.contactPhone }
            });

            if (!contact) {
                // Create contact if it doesn't exist
                const tenant = await prisma.tenant.findFirst();
                if (!tenant) {
                    throw new Error('No tenant found');
                }

                contact = await prisma.contact.create({
                    data: {
                        phone_number: data.contactPhone,
                        tenant_id: tenant.id,
                        name: data.contactName || 'Unknown',
                        email: data.contactEmail,
                        source: 'website',
                        contact_type: data.externalType === ExternalOwnerType.REAL_ESTATE_BUILDER
                            ? 'REAL_ESTATE_BUILDER'
                            : data.scope === OwnerScope.EXTERNAL
                            ? 'PARTNER_AGENT'
                            : 'MANAGEMENT'
                    }
                });

                logger.info('[OwnerService] Created new contact:', contact.phone_number);
            }

            // Check if owner already exists
            const existingOwner = await prisma.owner.findUnique({
                where: { contact_phone: data.contactPhone }
            });

            if (existingOwner) {
                throw new Error(`Owner already exists for contact: ${data.contactPhone}`);
            }

            // Determine plan type
            const planType = data.planType || PlanType.FREE;
            const planPerms = PlanPermissions[planType];

            // Create Owner + Subscription in transaction
            const result = await prisma.$transaction(async (tx) => {
                // Create Owner
                const owner = await tx.owner.create({
                    data: {
                        scope: data.scope,
                        externalType: data.externalType,
                        contact_phone: data.contactPhone,
                        status: OwnerStatus.PENDING_VERIFICATION,
                        listing_limit: planPerms.listingLimit,
                        priority_score: planPerms.priorityBase
                    }
                });

                // Create Subscription
                const subscription = await tx.subscription.create({
                    data: {
                        owner_id: owner.id,
                        plan_type: planType,
                        status: planType === PlanType.FREE
                            ? SubscriptionStatus.ACTIVE
                            : SubscriptionStatus.PENDING_PAYMENT,
                        start_date: planType === PlanType.FREE ? new Date() : null,
                        end_date: permissionEngine.calculateSubscriptionEndDate(planType),
                        auto_renew: false
                    }
                });

                logger.info(`[OwnerService] Created owner ${owner.id} with ${planType} subscription`);

                return { owner, subscription };
            });

            return result;

        } catch (error) {
            logger.error('[OwnerService] Error creating owner:', error);
            throw error;
        }
    }

    /**
     * Get owner by ID with full details
     */
    async getOwnerById(ownerId: string) {
        const owner = await prisma.owner.findUnique({
            where: { id: ownerId },
            include: {
                contact: true,
                subscription: true,
                inventory: {
                    where: { status: 'active' },
                    select: { id: true, location: true, price: true, created_at: true }
                },
                projects: {
                    select: { id: true, name: true, project_status: true }
                }
            }
        });

        if (!owner) {
            throw new Error('Owner not found');
        }

        // Enrich with permissions
        const permissions = await permissionEngine.getPermissions(ownerId);

        return {
            ...owner,
            permissions,
            activeListingsCount: owner.inventory.length
        };
    }

    /**
     * Get owner by contact phone
     */
    async getOwnerByPhone(phone: string) {
        const owner = await prisma.owner.findUnique({
            where: { contact_phone: phone },
            include: {
                contact: true,
                subscription: true
            }
        });

        return owner;
    }

    /**
     * Update owner details
     */
    async updateOwner(ownerId: string, data: UpdateOwnerDTO) {
        logger.info(`[OwnerService] Updating owner ${ownerId}:`, data);

        const owner = await prisma.owner.update({
            where: { id: ownerId },
            data,
            include: {
                contact: true,
                subscription: true
            }
        });

        return owner;
    }

    /**
     * Activate owner account (after verification)
     */
    async activateOwner(ownerId: string) {
        logger.info(`[OwnerService] Activating owner ${ownerId}`);

        return await this.updateOwner(ownerId, {
            status: OwnerStatus.ACTIVE
        });
    }

    /**
     * Suspend owner account
     * Deactivates all listings and blocks new activity
     */
    async suspendOwner(ownerId: string, reason: string) {
        logger.info(`[OwnerService] Suspending owner ${ownerId}. Reason: ${reason}`);

        await prisma.$transaction(async (tx) => {
            // Update owner status
            await tx.owner.update({
                where: { id: ownerId },
                data: { status: OwnerStatus.SUSPENDED }
            });

            // Deactivate all active listings
            await tx.inventory.updateMany({
                where: {
                    owner_id: ownerId,
                    status: 'active'
                },
                data: { status: 'withdrawn' }
            });

            logger.info(`[OwnerService] Suspended owner ${ownerId} and deactivated listings`);
        });

        // TODO: Send WhatsApp notification to owner
    }

    /**
     * Unsuspend owner account
     */
    async unsuspendOwner(ownerId: string) {
        logger.info(`[OwnerService] Unsuspending owner ${ownerId}`);

        return await this.updateOwner(ownerId, {
            status: OwnerStatus.ACTIVE
        });
    }

    /**
     * Delete owner (soft delete by setting status to EXPIRED)
     * NOTE: Hard delete would violate foreign key constraints
     */
    async deleteOwner(ownerId: string) {
        logger.warn(`[OwnerService] Deleting owner ${ownerId}`);

        // Check for active listings or pending commissions
        const owner = await prisma.owner.findUnique({
            where: { id: ownerId },
            include: {
                inventory: { where: { status: 'active' } },
                commissions: { where: { status: 'PENDING' } }
            }
        });

        if (!owner) {
            throw new Error('Owner not found');
        }

        if (owner.inventory.length > 0) {
            throw new Error(`Cannot delete owner with ${owner.inventory.length} active listings`);
        }

        if (owner.commissions.length > 0) {
            throw new Error(`Cannot delete owner with ${owner.commissions.length} pending commissions`);
        }

        // Soft delete
        return await this.updateOwner(ownerId, {
            status: OwnerStatus.EXPIRED
        });
    }

    /**
     * Get all owners with filtering
     */
    async listOwners(filters: {
        scope?: OwnerScope;
        externalType?: ExternalOwnerType;
        status?: OwnerStatus;
        planType?: PlanType;
        limit?: number;
        offset?: number;
    } = {}) {
        const where: any = {};

        if (filters.scope) where.scope = filters.scope;
        if (filters.externalType) where.externalType = filters.externalType;
        if (filters.status) where.status = filters.status;

        if (filters.planType) {
            where.subscription = {
                plan_type: filters.planType
            };
        }

        const owners = await prisma.owner.findMany({
            where,
            include: {
                contact: true,
                subscription: true,
                _count: {
                    select: {
                        inventory: { where: { status: 'active' } },
                        projects: true
                    }
                }
            },
            take: filters.limit || 50,
            skip: filters.offset || 0,
            orderBy: {
                created_at: 'desc'
            }
        });

        return owners;
    }

    /**
     * Get owner statistics
     */
    async getOwnerStats(ownerId: string) {
        const owner = await prisma.owner.findUnique({
            where: { id: ownerId },
            include: {
                _count: {
                    select: {
                        inventory: { where: { status: 'active' } },
                        projects: true,
                        commissions: { where: { status: 'PENDING' } }
                    }
                }
            }
        });

        if (!owner) {
            throw new Error('Owner not found');
        }

        const permissions = await permissionEngine.getPermissions(ownerId);

        return {
            activeListings: owner._count.inventory,
            listingLimit: permissions.listingLimit,
            listingUtilization: (owner._count.inventory / permissions.listingLimit) * 100,
            projectsCount: owner._count.projects,
            pendingCommissions: owner._count.commissions,
            priorityScore: permissions.priorityScore,
            planType: owner.subscription?.plan_type || 'FREE'
        };
    }
}

// Singleton instance
export const ownerService = new OwnerService();
