
import prisma from '../db';
import logger from '../utils/logger';
import { permissionEngine } from './permission_engine';
import { Owner, Subscription } from '@prisma/client';

/**
 * Priority Scoring for Marketplace Matching
 * PHASE 13: Updated to use unified Owner model with PermissionEngine
 *
 * Priority Hierarchy:
 * - Internal: 100 (always highest)
 * - Builder PREMIUM: 100 (85 base + 15 type)
 * - Agency PRO: 80 (70 base + 10 type)
 * - Agent PRO: 70
 * - Builder FREE: 65 (50 base + 15 type)
 * - Agent FREE: 50
 */
interface ScoredProperty {
    property: any;
    priorityScore: number;
}

export class MatchingService {

    /**
     * Calculate priority score based on Owner and Subscription
     * PHASE 13: Uses PermissionEngine for consistent priority calculation
     */
    private calculatePriority(property: any): number {
        if (!property.owner) {
            logger.warn('[MatchingService] Property missing owner relation:', property.id);
            return 0;
        }

        // Use centralized permission engine for priority calculation
        return permissionEngine.calculatePriority(property.owner);
    }

    /**
     * Find matching inventory for a buyer based on requirements
     * Results are sorted by: 1) Priority Score (Internal > ADVANCE_PRO > PRO > FREE), 2) Recency
     */
    public async findMatches(buyerContext: any) {
        logger.info('[MatchingService] Finding matches for:', buyerContext);

        const { budget_min, budget_max, preferred_location, property_type } = buyerContext;

        // Build Query
        const query: any = {
            status: 'active',
            intent: 'SELL' // Default for Buyers
        };

        if (property_type) {
            query.type = { contains: property_type, mode: 'insensitive' };
        }

        if (preferred_location) {
            query.location = { contains: preferred_location, mode: 'insensitive' };
        }

        // Budget Logic (Simple range check)
        // Note: Real world would need unit conversion. Assuming normalized base units for now.
        if (budget_max) {
            query.price = { lte: budget_max };
        }

        // PHASE 13: Fetch with Owner relation for unified ownership
        const allMatches = await prisma.inventory.findMany({
            where: query,
            include: {
                owner: {
                    include: {
                        subscription: true,
                        contact: {
                            select: {
                                name: true,
                                phone_number: true
                            }
                        }
                    }
                }
            },
            take: 50 // Fetch more to have enough after sorting
        });

        // Score and sort by priority
        const scoredMatches: ScoredProperty[] = allMatches.map(property => ({
            property,
            priorityScore: this.calculatePriority(property)
        }));

        // Sort: Highest priority first, then by recency
        scoredMatches.sort((a, b) => {
            if (b.priorityScore !== a.priorityScore) {
                return b.priorityScore - a.priorityScore;
            }
            // Secondary sort by created_at (newest first)
            return new Date(b.property.created_at).getTime() - new Date(a.property.created_at).getTime();
        });

        // Take top 5 matches
        const topMatches = scoredMatches.slice(0, 5).map(scored => scored.property);

        logger.info(`[MatchingService] Found ${allMatches.length} total matches, returning top ${topMatches.length} by priority.`);
        logger.info('[MatchingService] Priority breakdown:', {
            internal_and_builder_premium: scoredMatches.filter(s => s.priorityScore === 100).length,
            agency_pro: scoredMatches.filter(s => s.priorityScore === 80).length,
            agent_pro: scoredMatches.filter(s => s.priorityScore === 70).length,
            builder_free: scoredMatches.filter(s => s.priorityScore === 65).length,
            agent_basic: scoredMatches.filter(s => s.priorityScore === 60).length,
            agent_free: scoredMatches.filter(s => s.priorityScore === 50).length
        });

        return topMatches;
    }
}
