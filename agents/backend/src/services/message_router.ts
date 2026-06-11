
/**
 * Master Orchestrator (Message Router)
 *
 * Central routing layer for the multi-agent system.
 * 1. Identifies user (contact_type)
 * 2. Classifies domain intent (property/legal/loan/service/appointment/general)
 * 3. Routes to the correct agent with full context
 * 4. Logs every agent action to AgentActionLog
 * 5. Updates session state and contact metadata
 *
 * Agents receive data through AgentContext and return AgentResponse.
 * The orchestrator handles all DB reads/writes before and after agent calls.
 */

import {
    BaseAgent,
    AgentContext,
    AgentResponse,
    AgentActionLogEntry,
    ContactData,
    SessionData,
    DomainIntent,
    TransactionData,
} from '../agents/types';
import { ClassifierAgent } from '../agents/classifier_agent';
import { SalesAgent } from '../agents/sales_agent';
import { PartnerAgentHandler } from '../agents/partner_agent';
import { AdminAgent } from '../agents/admin_agent';
import { CoordinationAgent } from '../agents/coordination_agent';
import { QAAgent } from '../agents/qa_agent';
import { SecurityAgent } from '../agents/security_agent';
import { SessionStore } from './session_store';
import { LLMService } from './llm';
import { detectRoleContext, RoleContextResult } from './role_context_detector';
import { getTransactionContext, findActiveTransactions } from './transaction_service';
import prisma from '../db';
import logger from '../utils/logger';

export class MessageRouter {
    // Agent registry
    private classifierAgent: ClassifierAgent;
    private salesAgent: SalesAgent;
    private partnerAgent: PartnerAgentHandler;
    private adminAgent: AdminAgent;
    private coordinationAgent: CoordinationAgent;
    private qaAgent: QAAgent;
    private securityAgent: SecurityAgent;
    private sessionStore: SessionStore;
    private llmService: LLMService;

    constructor() {
        this.classifierAgent = new ClassifierAgent();
        this.salesAgent = new SalesAgent();
        this.partnerAgent = new PartnerAgentHandler();
        this.adminAgent = new AdminAgent();
        this.coordinationAgent = new CoordinationAgent();
        this.qaAgent = new QAAgent();
        this.securityAgent = new SecurityAgent();
        this.sessionStore = new SessionStore();
        this.llmService = new LLMService();
    }

    /**
     * Central message router. Routes by contact_type + domain intent to the correct agent.
     * Manages persistent sessions and detects language preference.
     * Logs every agent action for audit trail.
     * FEATURE 3: Accepts conversationContext for WhatsApp continuation
     */
    public async route(contact: any, message: string, channel: string, conversationContext?: any): Promise<any> {
        const contactType = contact.contact_type || 'UNKNOWN';
        const phone = contact.phone_number;
        const startTime = Date.now();

        logger.info(`[MasterOrchestrator] Routing ${phone} (type: ${contactType}) via ${channel}`);

        // Security: Rate limit check (non-blocking — logs suspicious activity)
        if (this.securityAgent.checkRateLimit(phone)) {
            logger.warn(`[MasterOrchestrator] Rate limit triggered for ${phone}`);
            return {
                action: 'reply',
                reply_script: "You're sending messages too quickly. Please wait a moment and try again.",
                quality_hint: 'confident',
            };
        }

        // FEATURE 3: Log if continuing from website chat
        if (conversationContext?.source === 'website_chat') {
            logger.info(`[MasterOrchestrator] Continuing from website chat (${conversationContext.historyCount} messages)`);
        }

        // ─── Fast-path: explicit callback request in free text ────────
        // Detects "call me back", "callback chahiye", "वापस कॉल", "phone karo", etc.
        // Creates a HIGH priority task assigned to the lead's agent (or super_boss
        // fallback). Without this, free-text callback asks vanished into the LLM
        // reply flow with no actionable surface for the team.
        const callbackRegex = /\b(call ?back|callback|call me|call me back|mujhe call|phone karo|phone kar|kal call|वापस ?कॉल|कॉल ?करो|callback chahiye|callback chah)\b/i;
        if (callbackRegex.test(message) && contactType !== 'PARTNER_AGENT' && contactType !== 'MANAGEMENT') {
            try {
                const tenant = await prisma.tenant.findFirst({ select: { id: true } });
                if (tenant) {
                    const { createLeadActionTask } = await import('./workflow_task_service');
                    await createLeadActionTask({
                        phone,
                        action: 'CALLBACK_REQUEST',
                        tenantId: tenant.id,
                        sourceChannel: 'whatsapp-text',
                        rawNote: `Free-text request: "${message.substring(0, 200)}"`,
                    });
                    logger.info(`[MasterOrchestrator] Text-callback fast-path matched for ${phone}`);
                    return {
                        action: 'reply',
                        reply_script: 'Thanks — our manager will call you within 15 minutes. 🙏',
                        quality_hint: 'confident',
                    };
                }
            } catch (err) {
                logger.warn(`[MasterOrchestrator] Text-callback fast-path failed (non-blocking):`, (err as Error).message);
            }
        }

        // ─── Consolidated LLM Classification (R013: 3 calls → 1 for UNKNOWN) ────
        // For UNKNOWN contacts, classify contact_type + domain_intent + language in ONE call.
        // Results are cached and reused below, saving ~66% Gemini API calls.
        let preClassification: { contactType: string; domainIntent: string; language: string; confidence: number } | null = null;

        if (contactType === 'UNKNOWN') {
            preClassification = await this.llmService.classifyFull(message);
            logger.info(`[MasterOrchestrator] Pre-classification (single call): type=${preClassification.contactType}, domain=${preClassification.domainIntent}, lang=${preClassification.language}, conf=${preClassification.confidence}`);

            // Store language immediately (skip separate detectLanguage call)
            if (!contact.preferred_language && preClassification.language) {
                prisma.contact.update({
                    where: { phone_number: phone },
                    data: { preferred_language: preClassification.language },
                }).catch(() => {});
            }
        } else {
            // For known contacts, detect language non-blocking (separate call, cached)
            this.detectAndStoreLanguage(phone, message, contact.preferred_language);
        }

        // Get or create session
        let session = await this.sessionStore.getSession(phone);
        const workflowName = this.getWorkflowName(contactType);

        // If contact type changed (re-classified), reset session
        if (session && session.workflow !== workflowName) {
            await this.sessionStore.endSession(phone);
            session = null;
        }

        // Create session if needed
        if (!session) {
            await this.sessionStore.setSession(phone, {
                workflow: workflowName,
                state: 'INITIAL',
                context: {
                    channel,
                    started_at: new Date().toISOString(),
                    // FEATURE 3: Include conversation context if available
                    ...(conversationContext && { conversationContext }),
                },
            });
            session = { workflow: workflowName, state: 'INITIAL', context: { channel } };
        } else {
            // Update session context with latest channel and conversation context
            await this.sessionStore.updateState(phone, session.state, {
                channel,
                last_message_at: new Date().toISOString(),
                // FEATURE 3: Include conversation context if available
                ...(conversationContext && { conversationContext }),
            });
        }

        // Classify domain intent
        // Skip LLM call for BUYER/TENANT/LANDLORD (always PROPERTY)
        // For UNKNOWN: use pre-classification result (already done above in classifyFull)
        let domainIntent: DomainIntent = 'GENERAL';
        if (contactType === 'UNKNOWN' && preClassification) {
            // Use consolidated result — no extra LLM call
            domainIntent = preClassification.domainIntent as DomainIntent;
            logger.info(`[MasterOrchestrator] Domain intent (from classifyFull): ${domainIntent}`);
        } else if (contactType === 'BUYER' || contactType === 'TENANT' || contactType === 'LANDLORD') {
            // Default to PROPERTY for buyers/tenants/landlords — no LLM call needed
            domainIntent = 'PROPERTY';
            // Quick keyword check for appointment intent
            const appointmentKeywords = ['appointment', 'schedule', 'visit', 'meeting', 'book', 'reschedule', 'cancel visit'];
            const msgLower = message.toLowerCase();
            if (appointmentKeywords.some(kw => msgLower.includes(kw))) {
                domainIntent = 'APPOINTMENT';
            }
            logger.info(`[MasterOrchestrator] Domain intent (keyword): ${domainIntent}`);
        } else {
            try {
                const intent = await this.llmService.classifyDomainIntent(message);
                domainIntent = intent as DomainIntent;
                logger.info(`[MasterOrchestrator] Domain intent: ${domainIntent}`);
            } catch (err) {
                logger.warn('[MasterOrchestrator] Domain intent classification failed, using GENERAL');
            }
        }

        // ─── Transaction-aware routing (Phase TX) ──────────────
        // Detect role context: DEMAND, SUPPLY, or INTERNAL
        // Skip LLM for BUYER/TENANT/LANDLORD — assign role directly
        let roleContext: RoleContextResult | null = null;
        let activeTransactions: TransactionData[] = [];
        let currentTransaction: TransactionData | null = null;

        if (contactType !== 'UNKNOWN') {
            try {
                // Direct assignment for known contact types (no LLM call)
                if (contactType === 'BUYER' || contactType === 'TENANT') {
                    roleContext = { role: 'DEMAND', confidence: 1, reasoning: `contact_type=${contactType}` };
                } else if (contactType === 'LANDLORD') {
                    roleContext = { role: 'SUPPLY', confidence: 1, reasoning: 'contact_type=LANDLORD' };
                } else {
                    roleContext = await detectRoleContext(phone, message, contactType);
                }
                activeTransactions = await findActiveTransactions(phone);

                // Determine current transaction (most recent active, or from role detection)
                if (roleContext.active_transaction_id) {
                    currentTransaction = activeTransactions.find(
                        t => t.id === roleContext!.active_transaction_id
                    ) || null;
                }
                if (!currentTransaction && activeTransactions.length > 0) {
                    currentTransaction = activeTransactions[0]; // Most recently updated
                }

                logger.info(`[MasterOrchestrator] Role: ${roleContext.role} (${roleContext.confidence}), ` +
                    `Active TX: ${activeTransactions.length}, Current TX: ${currentTransaction?.id || 'none'}`);
            } catch (err) {
                logger.error('[MasterOrchestrator] Role/Transaction detection failed (non-blocking):', err);
            }
        }

        // Build agent context
        const agentContext: AgentContext = {
            contact: this.toContactData(contact),
            message,
            channel: channel as AgentContext['channel'],
            session: session as SessionData,
            domainIntent,
            roleContext: roleContext?.role,
            currentTransaction,
            activeTransactions,
            ...(conversationContext && { crossAgentData: { conversationContext } }),
            // R013: Pass pre-classification so ClassifierAgent can skip its own LLM call
            ...(preClassification && {
                crossAgentData: {
                    ...(conversationContext && { conversationContext }),
                    preClassification,
                },
            }),
        };

        // Select and route to agent (Transaction-aware)
        const agent = this.selectAgent(contactType, domainIntent, roleContext, currentTransaction, contactType);
        let result: AgentResponse;

        try {
            result = await agent.handle(agentContext);
            logger.info(`[MasterOrchestrator] ${agent.name} responded: action=${result.action}`);
        } catch (error: any) {
            logger.error(`[MasterOrchestrator] ${agent.name} failed:`, error);
            result = {
                action: 'reply',
                reply_script: "Namaste! I'm Panditji, your property assistant. I encountered a brief issue — please try again.",
                quality_hint: 'needs_human',
            };

            // Log failed action
            this.logAgentAction({
                agent_name: agent.name,
                task_type: 'handle_message',
                phone_number: phone,
                input_summary: message.substring(0, 200),
                status: 'failed',
                error_message: error.message,
                duration_ms: Date.now() - startTime,
            });

            return result;
        }

        // Apply metadata updates to contact (seller data collection, lifecycle changes)
        if (result.metadata) {
            await this.applyMetadataUpdates(phone, result.metadata);
        }

        // Update session state from agent result
        if (result.next_state) {
            await this.sessionStore.updateState(phone, result.next_state, {
                last_action: result.action,
                contact_type: result.contact_type || contactType,
            });
        }

        // If contact was re-classified (from UNKNOWN), update DB and session
        if (result.contact_type && result.contact_type !== 'UNKNOWN' && contactType === 'UNKNOWN') {
            const updateData: any = { contact_type: result.contact_type };
            if (result.metadata?.intent) {
                updateData.intent = result.metadata.intent;
            }
            await prisma.contact.update({
                where: { phone_number: phone },
                data: updateData,
            });

            await this.sessionStore.endSession(phone);
            await this.sessionStore.setSession(phone, {
                workflow: this.getWorkflowName(result.contact_type),
                state: 'INITIAL',
                context: { channel, classified_from: 'unknown', confidence: result.confidence },
            });
        }

        // Log successful agent action (fire-and-forget)
        this.logAgentAction({
            agent_name: agent.name,
            task_type: 'handle_message',
            phone_number: phone,
            input_summary: message.substring(0, 200),
            output_summary: result.reply_script?.substring(0, 200),
            status: result.action === 'escalate' ? 'escalated' : 'success',
            duration_ms: Date.now() - startTime,
        });

        // QA Agent post-hook: async quality check (fire-and-forget, never blocks response)
        // PERF: Sample 20% of responses to conserve Gemini API quota (prevents 429s)
        if (result.reply_script && Math.random() < 0.2) {
            this.qaAgent.checkResponseQuality({
                phone_number: phone,
                agent_name: agent.name,
                user_message: message,
                ai_response: result.reply_script,
                contact_type: contactType,
            }).catch(err => {
                logger.error('[MasterOrchestrator] QA post-hook failed (non-blocking):', err);
            });
        }

        return result;
    }

    /**
     * Transaction-aware agent selection.
     *
     * Routing priority:
     * 1. UNKNOWN → ClassifierAgent (must identify first)
     * 2. Role Context (INTERNAL/DEMAND/SUPPLY) + Transaction state + Domain Intent
     *
     * This replaces the old static contact_type routing.
     */
    private selectAgent(
        contactType: string,
        domainIntent: DomainIntent,
        roleContext?: RoleContextResult | null,
        currentTransaction?: TransactionData | null,
        rawContactType?: string,
    ): BaseAgent {
        // UNKNOWN contacts always go to classifier first
        if (contactType === 'UNKNOWN') {
            return this.classifierAgent;
        }

        // If role context available, use Transaction-aware routing
        if (roleContext) {
            return this.selectAgentByRoleContext(roleContext, domainIntent, currentTransaction, rawContactType);
        }

        // Fallback: legacy contact_type routing (shouldn't happen, but safe)
        if (contactType === 'MANAGEMENT') return this.adminAgent;
        if (contactType === 'PARTNER_AGENT' || contactType === 'REAL_ESTATE_BUILDER') return this.partnerAgent;
        return this.salesAgent;
    }

    /**
     * Route based on role context + transaction state + domain intent.
     *
     * INTERNAL: → AdminAgent (commands, reports, deal summaries)
     * DEMAND:   → Based on transaction status + domain intent
     * SUPPLY:   → PartnerAgent/SalesAgent (listing) + CoordinationAgent (appointments)
     */
    private selectAgentByRoleContext(
        roleContext: RoleContextResult,
        domainIntent: DomainIntent,
        currentTransaction?: TransactionData | null,
        rawContactType?: string,
    ): BaseAgent {
        const txStatus = currentTransaction?.status;

        switch (roleContext.role) {
            case 'INTERNAL':
                return this.adminAgent;

            case 'DEMAND':
                // Appointment intent with active transaction → CoordinationAgent
                if (domainIntent === 'APPOINTMENT' && currentTransaction) {
                    return this.coordinationAgent;
                }
                // Transaction at VISIT_SCHEDULED → CoordinationAgent (visit management)
                if (txStatus === 'VISIT_SCHEDULED') {
                    return this.coordinationAgent;
                }
                // All other demand scenarios → SalesAgent
                // (NEW, MATCHED, VISITED, NEGOTIATION, or no transaction)
                return this.salesAgent;

            case 'SUPPLY':
                // Appointment intent with active transaction → CoordinationAgent
                if (domainIntent === 'APPOINTMENT' && currentTransaction) {
                    return this.coordinationAgent;
                }
                // Individual owners (LANDLORD) go to SalesAgent — NOT PartnerAgent
                // PartnerAgent is ONLY for external brokers/dealers (PARTNER_AGENT) and builders
                if (rawContactType === 'LANDLORD') {
                    return this.salesAgent;
                }
                // Partner agents and builders use partner handler
                return this.partnerAgent;

            default:
                return this.salesAgent;
        }
    }

    /**
     * Map contact_type to workflow name for session management.
     */
    private getWorkflowName(contactType: string): string {
        const map: Record<string, string> = {
            'UNKNOWN': 'unknown',
            'BUYER': 'sales_buyer',
            'TENANT': 'sales_tenant',
            'LANDLORD': 'sales_seller',
            'PARTNER_AGENT': 'partner',
            'MANAGEMENT': 'admin',
            'REAL_ESTATE_BUILDER': 'partner',
        };
        return map[contactType] || 'unknown';
    }

    /**
     * Convert raw Prisma contact to typed ContactData for agents.
     */
    private toContactData(contact: any): ContactData {
        return {
            phone_number: contact.phone_number,
            tenant_id: contact.tenant_id,
            name: contact.name,
            email: contact.email,
            contact_type: contact.contact_type,
            intent: contact.intent,
            property_type: contact.property_type,
            budget_min: contact.budget_min ? Number(contact.budget_min) : null,
            budget_max: contact.budget_max ? Number(contact.budget_max) : null,
            preferred_location: contact.preferred_location,
            demand_bhk: (contact.demand_schema_values as any)?.bhk ? (parseInt(String((contact.demand_schema_values as any).bhk), 10) || null) : null, // demand_bhk col dropped 2026-05-29 → read schema_values.bhk
            timeline: contact.timeline,
            lead_status: contact.lead_status || 'cold',
            lifecycle_stage: contact.lifecycle_stage || 'NEW',
            assigned_agent_id: contact.assigned_agent_id,
            last_channel: contact.last_channel,
            last_interaction: contact.last_interaction,
            ai_summary: contact.ai_summary,
            preferred_language: contact.preferred_language,
        };
    }

    /**
     * Apply metadata updates from agent response to the contact record.
     * Agents return metadata with field updates; the orchestrator writes them.
     */
    private async applyMetadataUpdates(phone: string, metadata: Record<string, any>): Promise<void> {
        const updateData: any = {};
        const allowedFields = [
            'property_type', 'preferred_location', 'lead_status',
            'ai_summary', 'intent', 'lifecycle_stage',
            'budget_min', 'budget_max', 'timeline',
        ];

        for (const field of allowedFields) {
            if (metadata[field] !== undefined) {
                updateData[field] = metadata[field];
            }
        }

        if (Object.keys(updateData).length > 0) {
            try {
                await prisma.contact.update({
                    where: { phone_number: phone },
                    data: updateData,
                });
                logger.info(`[MasterOrchestrator] Updated contact ${phone}: ${JSON.stringify(updateData)}`);
            } catch (err) {
                logger.error(`[MasterOrchestrator] Failed to update contact ${phone}:`, err);
            }
        }
    }

    /**
     * Log agent action to the audit trail (fire-and-forget).
     * Non-blocking — never crashes the main flow if logging fails.
     */
    private logAgentAction(entry: AgentActionLogEntry): void {
        prisma.agentActionLog.create({
            data: {
                agent_name: entry.agent_name,
                task_type: entry.task_type,
                phone_number: entry.phone_number,
                input_summary: entry.input_summary,
                output_summary: entry.output_summary,
                quality_score: entry.quality_score,
                duration_ms: entry.duration_ms,
                status: entry.status,
                error_message: entry.error_message,
            },
        }).catch(err => {
            // Non-blocking — don't crash if logging fails
            logger.error('[MasterOrchestrator] Failed to log agent action:', err);
        });
    }

    /**
     * Detect language preference and store it (non-blocking).
     */
    private async detectAndStoreLanguage(phoneNumber: string, message: string, currentLanguage: string | null): Promise<void> {
        try {
            if (!currentLanguage) {
                const language = await this.llmService.detectLanguage(message);
                await prisma.contact.update({
                    where: { phone_number: phoneNumber },
                    data: { preferred_language: language },
                });
                logger.info(`[MasterOrchestrator] Language detected for ${phoneNumber}: ${language}`);
            }
        } catch (error) {
            // Non-critical, log and continue
            logger.error('[MasterOrchestrator] Language detection error:', error);
        }
    }
}
