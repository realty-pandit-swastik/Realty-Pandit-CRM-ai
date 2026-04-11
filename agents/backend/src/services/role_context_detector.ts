/**
 * Role Context Detector
 *
 * Determines WHY someone is messaging right now — not their static user type.
 * Same person can be a buyer today and a landlord tomorrow.
 *
 * Detection priority:
 * 1. Identity check (Agent/Owner tables → INTERNAL or SUPPLY)
 * 2. Active transactions (demand/supply/executive roles)
 * 3. Session state (mid-flow continuation)
 * 4. Contact type fallback + LLM disambiguation
 *
 * Returns role context + confidence + active transaction ID (if any).
 */

import prisma from '../db';
import { identifyContact } from './contact_identifier';
import { getTransactionContext, TransactionContext } from './transaction_service';
import { SessionStore, SessionData } from './session_store';
import { LLMService } from './llm';
import logger from '../utils/logger';

const sessionStore = new SessionStore();
const llm = new LLMService();

export interface RoleContextResult {
    role: 'DEMAND' | 'SUPPLY' | 'INTERNAL';
    confidence: number;        // 0-1
    active_transaction_id?: string;
    reasoning: string;
}

/**
 * Detect the role context for an incoming message.
 *
 * @param phone - Caller's phone number
 * @param message - The message text (used for LLM disambiguation)
 * @param contactType - Current contact_type from DB (may be stale)
 */
export async function detectRoleContext(
    phone: string,
    message: string,
    contactType: string
): Promise<RoleContextResult> {
    try {
        // ─── Step 1: Identity check (Agent/Owner tables) ──────────
        const identified = await identifyContact(phone);

        if (identified) {
            if (identified.contact_type === 'MANAGEMENT') {
                return {
                    role: 'INTERNAL',
                    confidence: 0.95,
                    reasoning: `Identified as internal team: ${identified.name} (${identified.role}/${identified.department})`,
                };
            }
            // Owner/Builder defaults to SUPPLY but could be messaging about a different thing
            if (identified.contact_type === 'REAL_ESTATE_BUILDER') {
                return {
                    role: 'SUPPLY',
                    confidence: 0.85,
                    reasoning: `Identified as builder: ${identified.name}`,
                };
            }
            // PartnerAgent could be listing (SUPPLY) or searching for clients (DEMAND)
            // Fall through to transaction check for disambiguation
        }

        // ─── Step 2: Active transaction check ─────────────────────
        const txContext = await getTransactionContext(phone);
        const roleFromTx = resolveRoleFromTransactions(txContext, contactType);

        if (roleFromTx) {
            return roleFromTx;
        }

        // ─── Step 3: Session state check ──────────────────────────
        const session = await sessionStore.getSession(phone);
        if (session) {
            const roleFromSession = resolveRoleFromSession(session);
            if (roleFromSession) {
                return roleFromSession;
            }
        }

        // ─── Step 4: Contact type fallback ────────────────────────
        if (contactType === 'BUYER_TENANT') {
            return {
                role: 'DEMAND',
                confidence: 0.7,
                reasoning: 'Contact type is BUYER_TENANT (no active transactions)',
            };
        }

        if (contactType === 'SELLER_LANDLORD') {
            return {
                role: 'SUPPLY',
                confidence: 0.7,
                reasoning: 'Contact type is SELLER_LANDLORD (no active transactions)',
            };
        }

        if (contactType === 'PARTNER_AGENT') {
            // Partners default to SUPPLY unless message suggests buying
            return {
                role: 'SUPPLY',
                confidence: 0.6,
                reasoning: 'Contact type is PARTNER_AGENT (defaulting to SUPPLY)',
            };
        }

        if (contactType === 'MANAGEMENT') {
            return {
                role: 'INTERNAL',
                confidence: 0.8,
                reasoning: 'Contact type is MANAGEMENT',
            };
        }

        // ─── Step 5: UNKNOWN — use LLM ───────────────────────────
        return await classifyRoleWithLLM(phone, message, txContext);

    } catch (error) {
        logger.error(`[RoleContextDetector] Error for ${phone}:`, error);
        // Safe fallback: DEMAND (most common user type)
        return {
            role: 'DEMAND',
            confidence: 0.3,
            reasoning: 'Error in role detection, defaulting to DEMAND',
        };
    }
}

// ─── Helpers ──────────────────────────────────────────────────

function resolveRoleFromTransactions(
    txContext: TransactionContext,
    contactType: string
): RoleContextResult | null {
    const { activeAsDemand, activeAsSupply, activeAsExecutive } = txContext;

    // Executive role takes highest priority (internal team)
    if (activeAsExecutive.length > 0) {
        return {
            role: 'INTERNAL',
            confidence: 0.95,
            active_transaction_id: activeAsExecutive[0].id,
            reasoning: `Internal executive with ${activeAsExecutive.length} active deal(s)`,
        };
    }

    // Only demand transactions → DEMAND
    if (activeAsDemand.length > 0 && activeAsSupply.length === 0) {
        return {
            role: 'DEMAND',
            confidence: 0.9,
            active_transaction_id: activeAsDemand[0].id,
            reasoning: `Active as demand in ${activeAsDemand.length} transaction(s)`,
        };
    }

    // Only supply transactions → SUPPLY
    if (activeAsSupply.length > 0 && activeAsDemand.length === 0) {
        return {
            role: 'SUPPLY',
            confidence: 0.9,
            active_transaction_id: activeAsSupply[0].id,
            reasoning: `Active as supply in ${activeAsSupply.length} transaction(s)`,
        };
    }

    // Both demand AND supply → use contact_type to disambiguate
    if (activeAsDemand.length > 0 && activeAsSupply.length > 0) {
        if (contactType === 'BUYER_TENANT') {
            return {
                role: 'DEMAND',
                confidence: 0.7,
                active_transaction_id: activeAsDemand[0].id,
                reasoning: `Has both demand (${activeAsDemand.length}) and supply (${activeAsSupply.length}) transactions; contact_type favors DEMAND`,
            };
        }
        if (contactType === 'SELLER_LANDLORD' || contactType === 'PARTNER_AGENT') {
            return {
                role: 'SUPPLY',
                confidence: 0.7,
                active_transaction_id: activeAsSupply[0].id,
                reasoning: `Has both roles; contact_type favors SUPPLY`,
            };
        }
        // Ambiguous — most recent transaction wins
        const mostRecentDemand = activeAsDemand[0].updated_at;
        const mostRecentSupply = activeAsSupply[0].updated_at;
        if (mostRecentDemand >= mostRecentSupply) {
            return {
                role: 'DEMAND',
                confidence: 0.6,
                active_transaction_id: activeAsDemand[0].id,
                reasoning: 'Dual role; most recent activity is as demand',
            };
        }
        return {
            role: 'SUPPLY',
            confidence: 0.6,
            active_transaction_id: activeAsSupply[0].id,
            reasoning: 'Dual role; most recent activity is as supply',
        };
    }

    // No active transactions
    return null;
}

function resolveRoleFromSession(session: SessionData): RoleContextResult | null {
    const workflow = session.workflow.toLowerCase();
    const state = session.state.toLowerCase();

    // Seller listing flow
    if (workflow === 'seller' || state.includes('listing') || state.includes('property_collection')) {
        return {
            role: 'SUPPLY',
            confidence: 0.85,
            reasoning: `Mid-flow: ${workflow}/${state} (seller/listing)`,
        };
    }

    // Buyer searching flow
    if (workflow === 'buyer' || state.includes('qualification') || state.includes('matching')) {
        return {
            role: 'DEMAND',
            confidence: 0.85,
            reasoning: `Mid-flow: ${workflow}/${state} (buyer/search)`,
        };
    }

    // Management flow
    if (workflow === 'management' || workflow === 'admin') {
        return {
            role: 'INTERNAL',
            confidence: 0.9,
            reasoning: `Mid-flow: ${workflow} session`,
        };
    }

    // Partner agent flow
    if (workflow === 'partner_agent') {
        return {
            role: 'SUPPLY',
            confidence: 0.8,
            reasoning: `Mid-flow: partner agent session`,
        };
    }

    return null;
}

async function classifyRoleWithLLM(
    phone: string,
    message: string,
    txContext: TransactionContext
): Promise<RoleContextResult> {
    try {
        const prompt = `You are a real estate platform assistant. Classify the intent of this message.

The person's phone is ${phone}. They have:
- ${txContext.activeAsDemand.length} active transactions as buyer/tenant
- ${txContext.activeAsSupply.length} active transactions as seller/landlord
- ${txContext.activeAsExecutive.length} active transactions as executive

Their message: "${message}"

Classify as exactly one of: DEMAND, SUPPLY, INTERNAL
- DEMAND = wants to buy/rent a property (buyer/tenant)
- SUPPLY = wants to sell/rent out a property (seller/landlord/agent)
- INTERNAL = team member, admin command

Reply with ONLY the classification (DEMAND, SUPPLY, or INTERNAL) on the first line.`;

        const response = await llm.generateResponse(prompt, message);
        const classification = response.trim().split('\n')[0].trim().toUpperCase();

        if (classification === 'DEMAND' || classification === 'SUPPLY' || classification === 'INTERNAL') {
            return {
                role: classification as 'DEMAND' | 'SUPPLY' | 'INTERNAL',
                confidence: 0.6,
                reasoning: `LLM classification from message content`,
            };
        }

        // LLM returned unexpected value — default to DEMAND
        return {
            role: 'DEMAND',
            confidence: 0.4,
            reasoning: `LLM returned "${classification}", defaulting to DEMAND`,
        };
    } catch (error) {
        logger.error('[RoleContextDetector] LLM classification failed:', error);
        return {
            role: 'DEMAND',
            confidence: 0.3,
            reasoning: 'LLM classification failed, defaulting to DEMAND',
        };
    }
}
