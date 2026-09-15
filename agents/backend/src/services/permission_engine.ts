/**
 * Permission Engine - Centralized Permission Management
 *
 * PHASE 13: Business Logic Layer
 * Manages permissions, limits, and priorities for all Owner types across subscription plans
 */

import { PlanType, OwnerScope, ExternalOwnerType, Owner, Subscription } from '@prisma/client';
import prisma from '../db';

// Type definitions
export interface PlanPermissions {
    listingLimit: number;
    canSeeBuyerPhone: boolean;
    canAddProject: boolean;
    canViewAnalytics: boolean;
    priorityBase: number;
    dataRetentionDays: number;
    features: string[];
}

export interface OwnerPermissions extends PlanPermissions {
    priorityScore: number;
    isActive: boolean;
}

/**
 * Permission matrix for subscription plans
 * Defines what each plan can and cannot do
 */
export const PlanPermissions: Record<PlanType, PlanPermissions> = {
    FREE: {
        listingLimit: 10,
        canSeeBuyerPhone: false,
        canAddProject: false,
        canViewAnalytics: false,
        priorityBase: 50,
        dataRetentionDays: 30,
        features: ['basic_listing', 'lead_notifications']
    },
    BASIC: {
        listingLimit: 25,
        canSeeBuyerPhone: true,
        canAddProject: false,
        canViewAnalytics: false,
        priorityBase: 60,
        dataRetentionDays: 90,
        features: ['basic_listing', 'lead_notifications', 'buyer_contact']
    },
    PRO: {
        listingLimit: 50,
        canSeeBuyerPhone: true,
        canAddProject: false,
        canViewAnalytics: true,
        priorityBase: 70,
        dataRetentionDays: 365,
        features: ['basic_listing', 'lead_notifications', 'buyer_contact', 'analytics']
    },
    PREMIUM: {
        listingLimit: 999,
        canSeeBuyerPhone: true,
        canAddProject: true,  // Only for BUILDER type
        canViewAnalytics: true,
        priorityBase: 85,
        dataRetentionDays: 365,
        features: ['basic_listing', 'lead_notifications', 'buyer_contact', 'analytics', 'priority_matching', 'featured_listings']
    }
};

/**
 * Type-based priority bonuses
 * Builders get highest priority, followed by agencies, then individuals
 */
const TYPE_PRIORITY_BONUS: Record<ExternalOwnerType, number> = {
    REAL_ESTATE_BUILDER: 15,
    PROPERTY_AGENT: 10,
    INDIVIDUAL_AGENT: 0
};

/**
 * Permission Engine Class
 * Central authority for all permission checks and priority calculations
 */
export class PermissionEngine {
    /**
     * Get comprehensive permissions for an owner
     * Combines plan permissions with owner-specific constraints
     */
    async getPermissions(ownerId: string): Promise<OwnerPermissions> {
        const owner = await prisma.owner.findUnique({
            where: { id: ownerId },
            include: { subscription: true }
        });

        if (!owner) {
            throw new Error('Owner not found');
        }

        const planType = owner.subscription?.plan_type || PlanType.FREE;
        const planPerms = PlanPermissions[planType];

        // Special case: Only REAL_ESTATE_BUILDER with PREMIUM can add projects
        const canAddProject =
            owner.externalType === ExternalOwnerType.REAL_ESTATE_BUILDER &&
            planPerms.canAddProject;

        return {
            ...planPerms,
            canAddProject,
            priorityScore: this.calculatePriority(owner),
            isActive: owner.status === 'ACTIVE'
        };
    }

    /**
     * Calculate priority score for matching engine
     * Higher score = properties shown first to buyers
     *
     * Priority Hierarchy:
     * - Internal: 100 (always highest)
     * - Builder PREMIUM: 100 (85 base + 15 type)
     * - Agency PRO: 80 (70 base + 10 type)
     * - Agent PRO: 70
     * - Builder FREE: 65 (50 base + 15 type)
     * - Agent FREE: 50
     */
    calculatePriority(owner: Owner & { subscription?: Subscription | null }): number {
        // Internal owners always get top priority
        if (owner.scope === OwnerScope.INTERNAL) {
            return 100;
        }

        // External owners: plan base + type bonus
        const planType = owner.subscription?.plan_type || PlanType.FREE;
        const planBase = PlanPermissions[planType].priorityBase;
        const typeBonus = owner.externalType ? TYPE_PRIORITY_BONUS[owner.externalType] : 0;

        return planBase + typeBonus;
    }

    /**
     * Check if owner has a specific permission/feature
     */
    async checkPermission(ownerId: string, permission: string): Promise<boolean> {
        const perms = await this.getPermissions(ownerId);
        return perms.features.includes(permission);
    }

    /**
     * Check if owner can add more listings
     */
    async canAddListing(ownerId: string): Promise<{ allowed: boolean; reason?: string }> {
        const owner = await prisma.owner.findUnique({
            where: { id: ownerId },
            include: {
                subscription: true,
                inventory: { where: { status: 'active' } }
            }
        });

        if (!owner) {
            return { allowed: false, reason: 'Owner not found' };
        }

        if (owner.status !== 'ACTIVE') {
            return { allowed: false, reason: 'Owner account is not active' };
        }

        const perms = await this.getPermissions(ownerId);
        const activeListings = owner.inventory.length;

        if (activeListings >= perms.listingLimit) {
            return {
                allowed: false,
                reason: `Listing limit reached (${activeListings}/${perms.listingLimit}). Please upgrade your plan.`
            };
        }

        return { allowed: true };
    }

    /**
     * Check if owner can add a project (builders only)
     */
    async canAddProject(ownerId: string): Promise<{ allowed: boolean; reason?: string }> {
        const owner = await prisma.owner.findUnique({
            where: { id: ownerId },
            include: { subscription: true }
        });

        if (!owner) {
            return { allowed: false, reason: 'Owner not found' };
        }

        if (owner.externalType !== ExternalOwnerType.REAL_ESTATE_BUILDER) {
            return { allowed: false, reason: 'Only builders can add projects' };
        }

        const perms = await this.getPermissions(ownerId);

        if (!perms.canAddProject) {
            return {
                allowed: false,
                reason: 'Project creation requires PREMIUM plan. Please upgrade.'
            };
        }

        return { allowed: true };
    }

    /**
     * Get data masking rules for lead/buyer data
     * FREE plan owners cannot see buyer phone numbers
     */
    async getDataMaskingRules(ownerId: string): Promise<{
        maskPhone: boolean;
        maskEmail: boolean;
        maskName: boolean;
    }> {
        const perms = await this.getPermissions(ownerId);

        return {
            maskPhone: !perms.canSeeBuyerPhone,
            maskEmail: !perms.canSeeBuyerPhone,
            maskName: !perms.canSeeBuyerPhone
        };
    }

    /**
     * Calculate subscription end date based on plan
     */
    calculateSubscriptionEndDate(planType: PlanType, startDate: Date = new Date()): Date | null {
        if (planType === PlanType.FREE) {
            return null; // No expiry for free plan
        }

        // All paid plans: 30 days from start
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 30);
        return endDate;
    }

    /**
     * Get subscription price (for future payment integration)
     */
    getSubscriptionPrice(planType: PlanType): number {
        const prices: Record<PlanType, number> = {
            FREE: 0,
            BASIC: 999,    // ₹999/month
            PRO: 2499,     // ₹2499/month
            PREMIUM: 4999  // ₹4999/month
        };

        return prices[planType];
    }
}

// Singleton instance
export const permissionEngine = new PermissionEngine();

/**
 * Helper function: Mask phone number for data privacy
 * Example: +919876543210 → +91XXXXXX210
 */
export function maskPhone(phone: string): string {
    if (!phone || phone.length < 10) return 'XXXXXXXXXX';

    const countryCode = phone.substring(0, 3); // +91
    const lastDigits = phone.substring(phone.length - 3); // 210
    const maskedMiddle = 'X'.repeat(phone.length - 6);

    return `${countryCode}${maskedMiddle}${lastDigits}`;
}

/**
 * Helper function: Mask email for data privacy
 * Example: buyer@gmail.com → b***r@gmail.com
 */
export function maskEmail(email: string): string {
    if (!email || !email.includes('@')) return 'hidden@example.com';

    const [local, domain] = email.split('@');
    if (local.length <= 2) {
        return `${local[0]}***@${domain}`;
    }

    const maskedLocal = `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}`;
    return `${maskedLocal}@${domain}`;
}

/**
 * Helper function: Mask name for data privacy
 * Example: John Doe → J*** D***
 */
export function maskName(name: string): string {
    if (!name) return 'Hidden User';

    const parts = name.split(' ');
    const masked = parts.map(part => {
        if (part.length <= 1) return part;
        return `${part[0]}${'*'.repeat(Math.min(part.length - 1, 3))}`;
    });

    return masked.join(' ');
}

// ========================================================================
// Role-layer helpers (2026-04-17 — middleman model, locked Stage-2 decision)
//
// Stacks ON TOP of the existing plan-based masking above. Plan rules still apply
// (e.g. FREE partner still has FREE-tier restrictions). The role layer further
// strips owner/source from responses when the viewer is not the owning manager.
// ========================================================================

import { sanitizationService, Viewer } from './sanitization_service';
export { Viewer } from './sanitization_service';

/**
 * Build a Viewer object from an authenticated internal agent.
 * `role` must be one of 'super_boss' | 'manager' | 'employee'.
 */
export function viewerFromAgent(agentId: string, role: string): Viewer {
    return { role: 'agent', agentId, isSuperBoss: role === 'super_boss' };
}

/**
 * Build a Viewer object from an authenticated partner agent.
 */
export function viewerFromPartner(partnerAgentId: string): Viewer {
    return { role: 'partner', partnerAgentId };
}

/**
 * Apply role-based masking to a single row (inventory or contact shape) before returning
 * it in a response. Safe to call on any row — non-owning viewers get owner/source stripped;
 * the owning manager + super_boss get the row untouched.
 */
export function applyRoleMask<T extends Record<string, any>>(row: T, viewer: Viewer): T {
    return sanitizationService.sanitizeInventory(row, viewer);
}

/**
 * List variant of applyRoleMask.
 */
export function applyRoleMaskList<T extends Record<string, any>>(rows: T[], viewer: Viewer): T[] {
    return sanitizationService.sanitizeInventoryList(rows, viewer);
}
