/**
 * Multi-Agent Architecture Types
 *
 * All agents implement BaseAgent and communicate via AgentContext/AgentResponse.
 * Agents do NOT import Prisma directly — they receive data through AgentContext
 * and return structured AgentResponse. The Master Orchestrator (MessageRouter)
 * handles all DB reads/writes before and after agent calls.
 */

// ─── Agent Context (What agents receive) ────────────────────────

export interface AgentContext {
    /** Contact record from SSOT */
    contact: ContactData;
    /** The user's message text */
    message: string;
    /** Communication channel */
    channel: 'whatsapp' | 'voice' | 'website' | 'email';
    /** Current session state */
    session: SessionData;
    /** Recent conversation history (last N messages) */
    conversationHistory?: ConversationMessage[];
    /** Data passed from other agents (cross-agent communication) */
    crossAgentData?: Record<string, any>;
    /** Domain intent classified by Master Orchestrator */
    domainIntent?: DomainIntent;
    /** Role context: DEMAND (buyer/tenant), SUPPLY (seller/landlord), INTERNAL (team) */
    roleContext?: 'DEMAND' | 'SUPPLY' | 'INTERNAL';
    /** Current active transaction (if any) */
    currentTransaction?: TransactionData | null;
    /** All active transactions for this contact */
    activeTransactions?: TransactionData[];
}

export interface TransactionData {
    id: string;
    type: 'SALE' | 'RENT';
    status: string;
    demand_contact_id: string;
    supply_contact_id?: string | null;
    executive_agent_id?: string | null;
    inventory_id?: string | null;
    demand_property_type?: string | null;
    demand_location?: string | null;
    demand_budget_min?: number | null;
    demand_budget_max?: number | null;
    demand_bedrooms?: string | null;
    demand_notes?: string | null;
    final_price?: number | null;
    source: string;
    created_at: Date;
    updated_at: Date;
}

export interface ContactData {
    phone_number: string;
    tenant_id: string;
    name?: string | null;
    email?: string | null;
    contact_type: string;
    intent?: string | null;
    property_type?: string | null;
    budget_min?: number | null;
    budget_max?: number | null;
    preferred_location?: string | null;
    demand_bhk?: number | null; // [LEGACY type field] column dropped 2026-05-29 — read demand_schema_values.bhk
    demand_schema_values?: Record<string, any> | null; // canonical demand SoT (bhk/amenities/…)
    timeline?: string | null;
    lead_status: string;
    lifecycle_stage?: string;
    assigned_agent_id?: string | null;
    last_channel?: string | null;
    last_interaction?: Date | null;
    ai_summary?: string | null;
    preferred_language?: string | null;
}

export interface SessionData {
    workflow: string;
    state: string;
    context?: Record<string, any>;
}

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
    channel?: string;
}

// ─── Agent Response (What agents return) ────────────────────────

export interface AgentResponse {
    /** What the agent decided to do */
    action: 'reply' | 'escalate' | 'transfer' | 'schedule' | 'monitor';
    /** The reply text to send to the user */
    reply_script?: string;
    /** Transfer to another agent (agent name) */
    transfer_to?: AgentName;
    /** Escalate to a human role */
    escalate_to?: 'super_boss' | 'manager' | 'employee';
    /** Next workflow state to persist */
    next_state?: string;
    /** Contact type classification (for Unknown workflow) */
    contact_type?: string;
    /** Classification confidence (0-100) */
    confidence?: number;
    /** Agent's self-assessed quality hint */
    quality_hint?: 'confident' | 'uncertain' | 'needs_human';
    /** Arbitrary metadata for logging/debugging */
    metadata?: Record<string, any>;
    /** Media attachments to send (property images, documents) via WhatsApp */
    media?: Array<{ url: string; caption?: string; type?: 'image' | 'document' }>;
}

// ─── Base Agent Interface ───────────────────────────────────────

export interface BaseAgent {
    /** Unique agent name for logging and routing */
    readonly name: AgentName;
    /** Handle a message and return a response */
    handle(context: AgentContext): Promise<AgentResponse>;
}

// ─── Agent Names (Registry) ────────────────────────────────────

export type AgentName =
    | 'master'          // Master Orchestrator (MessageRouter)
    | 'classifier'      // Unknown Identification
    | 'sales'           // Buyer + Seller combined
    | 'partner'         // External Partner Agents
    | 'admin'           // Management Commands
    | 'inventory'       // Property Listing Collection
    | 'matching'        // Property Matching Engine
    | 'appointment'     // Calendar & Scheduling
    | 'coordination'    // Buyer<->Seller Bridge
    | 'followup'        // Proactive Follow-ups
    | 'marketing'       // Campaigns & Broadcasts
    | 'notification'    // Unified Notification (WhatsApp/Email/Voice)
    | 'security'        // Rate Limiting & Anomaly Detection
    | 'qa';             // Quality Assurance & Monitoring

// ─── Domain Intent (Classified by Master) ──────────────────────

export type DomainIntent =
    | 'PROPERTY'        // Buy, sell, rent, search properties
    | 'LEGAL'           // Rental agreement, stamp duty, documentation
    | 'LOAN'            // EMI, home loan, eligibility
    | 'SERVICE'         // Packers, painters, cleaning, repairs
    | 'APPOINTMENT'     // Schedule/confirm/reschedule a visit
    | 'GENERAL';        // Greetings, help, unknown

// ─── Agent Action Log (For audit trail) ────────────────────────

export interface AgentActionLogEntry {
    agent_name: AgentName;
    task_type: string;
    phone_number?: string;
    input_summary?: string;
    output_summary?: string;
    quality_score?: number;
    duration_ms?: number;
    status: 'success' | 'failed' | 'escalated';
    error_message?: string;
}

// ─── Lifecycle Stages ──────────────────────────────────────────

export type LifecycleStage =
    | 'NEW'
    | 'QUALIFIED'
    | 'VISIT_SCHEDULED'
    | 'VISITED'
    | 'NEGOTIATION'
    | 'CLOSED_WON'
    | 'CLOSED_LOST'
    | 'ON_HOLD';

// Map from lead_status to lifecycle_stage
export const LEAD_STATUS_TO_LIFECYCLE: Record<string, LifecycleStage> = {
    'cold': 'NEW',
    'warm': 'QUALIFIED',
    'hot': 'NEGOTIATION',
    'closed': 'CLOSED_WON',
    'lost': 'CLOSED_LOST',
};
