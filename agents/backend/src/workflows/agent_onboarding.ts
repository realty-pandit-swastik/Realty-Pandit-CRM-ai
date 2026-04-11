/**
 * Agent/Dealer Onboarding Workflow - PHASE 16
 * Registration flow for agents/dealers via WhatsApp
 */

import { ownerService } from '../services/owner';
import prisma from '../db';
import logger from '../utils/logger';
import { OwnerScope, ExternalOwnerType, PlanType } from '@prisma/client';

export class AgentOnboardingWorkflow {

    /**
     * Detect if message indicates agent/dealer intent
     */
    isAgentIntent(message: string): boolean {
        const msg = message.toLowerCase();
        const keywords = [
            'i am an agent',
            'i am a agent',
            'i am agent',
            'i am a dealer',
            'i am dealer',
            'i am a broker',
            'i am broker',
            'dealer registration',
            'agent registration',
            'broker registration',
            'want to list property as agent',
            'partner agent',
            'want to become agent',
            'agent banna hai',
            'dealer banna hai',
            'broker banna hai',
            'property dealer',
            'real estate agent',
            'main agent hun',
            'main dealer hun',
            'main broker hun',
            'agent signup',
            'dealer signup',
        ];
        return keywords.some(kw => msg.includes(kw));
    }

    /**
     * Handle agent onboarding conversation
     */
    async handle(contact: any, message: string): Promise<any> {
        const phone = contact.phone_number;

        // Check if already registered
        const existingOwner = await ownerService.getOwnerByPhone(phone);
        if (existingOwner && (
            existingOwner.externalType === ExternalOwnerType.INDIVIDUAL_AGENT ||
            existingOwner.externalType === ExternalOwnerType.PROPERTY_AGENT
        )) {
            return {
                action: 'reply',
                reply_script: `You're already registered as a partner agent! 🤝\n\nAccess your dashboard at: ${process.env.WEBSITE_URL || 'https://realtypandit.in'}/agent/dashboard\n\nOr say *"upload inventory"* to list a new property.`
            };
        }

        // Get or create onboarding session
        let session = await this.getOnboardingSession(phone);

        if (!session) {
            session = await this.startOnboarding(phone);
            return {
                action: 'reply',
                reply_script: `Welcome to Realty Pandit Partner Network! 🤝\n\nI'm Panditji, and I'll help you register as a partner agent.\n\nFirst, please share your *full name*.\nExample: "Rahul Sharma"`
            };
        }

        // Handle restart
        if (message.toLowerCase() === 'restart') {
            await this.cancelOnboarding(phone);
            return this.handle(contact, 'agent registration');
        }

        return await this.processStep(session, message);
    }

    private async getOnboardingSession(phone: string) {
        return await prisma.agentOnboardingSession.findFirst({
            where: {
                phone_number: phone,
                status: 'IN_PROGRESS'
            }
        });
    }

    private async startOnboarding(phone: string) {
        return await prisma.agentOnboardingSession.create({
            data: {
                phone_number: phone,
                status: 'IN_PROGRESS',
                step: 'NAME',
                collected_data: {}
            }
        });
    }

    private async processStep(session: any, message: string): Promise<any> {
        const data = session.collected_data as any || {};

        switch (session.step) {
            case 'NAME':
                data.name = message.trim();
                await this.updateSession(session.id, 'COMPANY_NAME', data);

                return {
                    action: 'reply',
                    reply_script: `Thank you, *${data.name}*! 👋\n\nDo you have a company or agency name?\n(Type "skip" if you're an individual agent)`
                };

            case 'COMPANY_NAME':
                if (message.toLowerCase() !== 'skip') {
                    data.companyName = message.trim();
                }
                await this.updateSession(session.id, 'CITY', data);

                return {
                    action: 'reply',
                    reply_script: `Great! 🏙️\n\nWhich city do you primarily operate in?\nExample: "Noida", "Gurgaon", "Delhi", "Mumbai"`
                };

            case 'CITY':
                data.city = message.trim();
                await this.updateSession(session.id, 'PLAN_SELECTION', data);

                return {
                    action: 'reply',
                    reply_script: `${data.city} 📍\n\n*Select your plan:*\n\n1️⃣ FREE (10 listings) - ₹0/month\n2️⃣ BASIC (25 listings) - ₹999/month\n3️⃣ PRO (50 listings) - ₹2,499/month\n\nReply with the plan number (1, 2, or 3)`
                };

            case 'PLAN_SELECTION':
                const planMap: Record<string, PlanType> = {
                    '1': PlanType.FREE,
                    '2': PlanType.BASIC,
                    '3': PlanType.PRO,
                };
                const selectedPlan = planMap[message.trim()] || PlanType.FREE;
                data.planType = selectedPlan;

                const externalType = data.companyName
                    ? ExternalOwnerType.PROPERTY_AGENT
                    : ExternalOwnerType.INDIVIDUAL_AGENT;

                try {
                    const result = await ownerService.createOwner({
                        contactPhone: session.phone_number,
                        scope: OwnerScope.EXTERNAL,
                        externalType,
                        planType: selectedPlan,
                        contactName: data.name,
                    });

                    // Update contact type
                    await prisma.contact.update({
                        where: { phone_number: session.phone_number },
                        data: {
                            name: data.companyName || data.name,
                            contact_type: 'PARTNER_AGENT',
                        }
                    });

                    // Mark session complete
                    await prisma.agentOnboardingSession.update({
                        where: { id: session.id },
                        data: {
                            status: 'COMPLETED',
                            owner_id: result.owner.id
                        }
                    });

                    logger.info('[AgentOnboarding] Registration complete:', {
                        phone: session.phone_number,
                        name: data.name,
                        plan: selectedPlan,
                        type: externalType,
                    });

                    const displayName = data.companyName || data.name;

                    return {
                        action: 'reply',
                        reply_script: `🎉 *Registration Successful!*\n\n*Name:* ${displayName}\n*City:* ${data.city}\n*Plan:* ${selectedPlan}\n\nYour agent dashboard is ready!\n\n🌐 Dashboard: ${process.env.WEBSITE_URL || 'https://realtypandit.in'}/agent/dashboard\n\n*Next Steps:*\n1. Login to your dashboard\n2. Start listing properties — just say *"upload inventory"*\n3. Receive buyer leads automatically!\n\nWelcome to the Realty Pandit Partner Network! 🤝`
                    };

                } catch (error) {
                    logger.error('[AgentOnboarding] Registration failed:', error);
                    return {
                        action: 'reply',
                        reply_script: `Registration failed: ${(error as Error).message}\n\nPlease try again or contact support.`
                    };
                }

            default:
                return {
                    action: 'reply',
                    reply_script: `I didn't understand that. Please try again or type "restart" to start over.`
                };
        }
    }

    private async updateSession(sessionId: string, nextStep: string, data: any) {
        return await prisma.agentOnboardingSession.update({
            where: { id: sessionId },
            data: {
                step: nextStep,
                collected_data: data
            }
        });
    }

    async cancelOnboarding(phone: string) {
        await prisma.agentOnboardingSession.updateMany({
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

export const agentOnboardingWorkflow = new AgentOnboardingWorkflow();
