/**
 * Builder Onboarding Workflow - TASK-129
 * AI-powered registration flow for builders via WhatsApp
 */

import { LLMService } from '../services/llm';
import { ownerService } from '../services/owner';
import prisma from '../db';
import logger from '../utils/logger';
import { OwnerScope, ExternalOwnerType, PlanType } from '@prisma/client';

export class BuilderOnboardingWorkflow {
    private llmService: LLMService;

    constructor() {
        this.llmService = new LLMService();
    }

    /**
     * Detect if message indicates builder intent
     */
    isBuilderIntent(message: string): boolean {
        const msg = message.toLowerCase();
        const keywords = [
            'i am a builder',
            'i am builder',
            'we are builders',
            'we are a developer',
            'i have a project',
            'new project',
            'builder registration',
            'developer registration',
            'want to list project',
            'commercial project',
            'residential project'
        ];
        return keywords.some(kw => msg.includes(kw));
    }

    /**
     * Handle builder onboarding conversation
     * Collects: Builder name, company name, project name, location, RERA number
     */
    async handle(contact: any, message: string): Promise<any> {
        const phone = contact.phone_number;

        // Check if already registered as builder
        const existingOwner = await ownerService.getOwnerByPhone(phone);
        if (existingOwner && existingOwner.external_type === ExternalOwnerType.REAL_ESTATE_BUILDER) {
            return {
                action: 'reply',
                reply_script: `You're already registered as a builder! 🏢\n\nAccess your dashboard at: ${process.env.WEBSITE_URL || 'http://localhost:7575'}/builder/dashboard\n\nOr tell me about a new project you want to add.`
            };
        }

        // Get or create onboarding session
        let session = await this.getOnboardingSession(phone);

        if (!session) {
            // Start new onboarding
            session = await this.startOnboarding(phone);
            return {
                action: 'reply',
                reply_script: `Welcome to Realty Pandit Builder Platform! 🏗️\n\nI'm Panditji, and I'll help you get started.\n\nFirst, please share your *builder/company name*.\nExample: "Godrej Properties" or "XYZ Developers"`
            };
        }

        // Continue onboarding based on current step
        return await this.processStep(session, message);
    }

    /**
     * Get active onboarding session
     */
    private async getOnboardingSession(phone: string) {
        return await prisma.builderOnboardingSession.findFirst({
            where: {
                phone_number: phone,
                status: 'IN_PROGRESS'
            }
        });
    }

    /**
     * Start new onboarding session
     */
    private async startOnboarding(phone: string) {
        return await prisma.builderOnboardingSession.create({
            data: {
                phone_number: phone,
                status: 'IN_PROGRESS',
                step: 'COMPANY_NAME',
                collected_data: {}
            }
        });
    }

    /**
     * Process each step of onboarding
     */
    private async processStep(session: any, message: string): Promise<any> {
        const data = session.collected_data as any || {};

        switch (session.step) {
            case 'COMPANY_NAME':
                // Extract company name from message
                data.companyName = message.trim();
                await this.updateSession(session.id, 'CONTACT_PERSON', data);

                return {
                    action: 'reply',
                    reply_script: `Great! *${data.companyName}* 🏢\n\nNow, please share your name (contact person).\nExample: "Rahul Sharma"`
                };

            case 'CONTACT_PERSON':
                data.contactName = message.trim();
                await this.updateSession(session.id, 'EMAIL', data);

                return {
                    action: 'reply',
                    reply_script: `Thank you, ${data.contactName}! 👋\n\nPlease share your email address.\n(You can type "skip" if you don't have one)`
                };

            case 'EMAIL':
                if (message.toLowerCase() !== 'skip') {
                    data.email = message.trim();
                }
                await this.updateSession(session.id, 'CITY', data);

                return {
                    action: 'reply',
                    reply_script: `Almost there! 🎯\n\nWhich city do you primarily operate in?\nExample: "Noida", "Gurgaon", "Mumbai"`
                };

            case 'CITY':
                data.city = message.trim();
                await this.updateSession(session.id, 'PLAN_SELECTION', data);

                return {
                    action: 'reply',
                    reply_script: `Perfect! ${data.city} 📍\n\n*Select your plan:*\n\n1️⃣ FREE (10 units) - ₹0/month\n2️⃣ BASIC (50 units) - ₹2,999/month\n3️⃣ PRO (200 units) - ₹9,999/month\n4️⃣ PREMIUM (Unlimited) - ₹19,999/month\n\nReply with the plan number (1, 2, 3, or 4)`
                };

            case 'PLAN_SELECTION':
                const planMap: Record<string, PlanType> = {
                    '1': PlanType.FREE,
                    '2': PlanType.BASIC,
                    '3': PlanType.PRO,
                    '4': PlanType.PREMIUM
                };
                const selectedPlan = planMap[message.trim()] || PlanType.FREE;
                data.planType = selectedPlan;

                // Create Owner + Subscription
                try {
                    const result = await ownerService.createOwner({
                        contactPhone: session.phone_number,
                        scope: OwnerScope.EXTERNAL,
                        externalType: ExternalOwnerType.REAL_ESTATE_BUILDER,
                        planType: selectedPlan,
                        contactName: data.contactName,
                        contactEmail: data.email
                    });

                    // Update contact with company name
                    await prisma.contact.update({
                        where: { phone_number: session.phone_number },
                        data: {
                            name: data.companyName,
                            email: data.email || undefined,
                            contact_type: 'MANAGEMENT' // Builders are also management contacts
                        }
                    });

                    // Mark session as complete
                    await prisma.builderOnboardingSession.update({
                        where: { id: session.id },
                        data: {
                            status: 'COMPLETED',
                            owner_id: result.owner.id
                        }
                    });

                    logger.info('[BuilderOnboarding] Registration complete:', {
                        phone: session.phone_number,
                        companyName: data.companyName,
                        plan: selectedPlan
                    });

                    return {
                        action: 'reply',
                        reply_script: `🎉 *Registration Successful!*\n\n*Company:* ${data.companyName}\n*Plan:* ${selectedPlan}\n*Contact:* ${data.contactName}\n\nYour builder dashboard is ready!\n\n🌐 Dashboard: ${process.env.WEBSITE_URL || 'http://localhost:7575'}/builder/dashboard\n\n*Next Steps:*\n1. Login to your dashboard\n2. Add your first project\n3. Start receiving buyer leads!\n\nYou can also add projects directly via WhatsApp. Just say *"add new project"*`
                    };

                } catch (error) {
                    logger.error('[BuilderOnboarding] Registration failed:', error);
                    return {
                        action: 'reply',
                        reply_script: `❌ Registration failed: ${(error as Error).message}\n\nPlease try again or contact support.`
                    };
                }

            default:
                return {
                    action: 'reply',
                    reply_script: `I didn't understand that. Please try again or type "restart" to start over.`
                };
        }
    }

    /**
     * Update session step and data
     */
    private async updateSession(sessionId: string, nextStep: string, data: any) {
        return await prisma.builderOnboardingSession.update({
            where: { id: sessionId },
            data: {
                step: nextStep,
                collected_data: data
            }
        });
    }

    /**
     * Cancel/restart onboarding
     */
    async cancelOnboarding(phone: string) {
        await prisma.builderOnboardingSession.updateMany({
            where: {
                phone_number: phone,
                status: 'IN_PROGRESS'
            },
            data: {
                status: 'CANCELLED'
            }
        });
    }
}

export const builderOnboardingWorkflow = new BuilderOnboardingWorkflow();
