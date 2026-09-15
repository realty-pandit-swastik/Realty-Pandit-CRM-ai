import jwt from 'jsonwebtoken';
import prisma from '../db';
import { WhatsAppService } from './whatsapp';
import logger from '../utils/logger';

if (!process.env.AGENT_JWT_SECRET) {
    throw new Error('FATAL: AGENT_JWT_SECRET environment variable is not set');
}
const AGENT_JWT_SECRET = process.env.AGENT_JWT_SECRET;
const AGENT_JWT_EXPIRES_IN = '7d'; // Agents stay logged in longer

// In-memory OTP store (use Redis in production)
interface OTPEntry {
    otp: string;
    expiresAt: number;
    attempts: number;
}
const otpStore = new Map<string, OTPEntry>();

export class AgentAuthService {
    private whatsapp: WhatsAppService;

    constructor() {
        this.whatsapp = new WhatsAppService();
    }

    /**
     * Register a new external agent
     */
    public async registerAgent(data: {
        name: string;
        phone: string;
        email?: string;
        company_name?: string;
        city?: string;
        package_type?: 'FREE' | 'PRO' | 'ADVANCE_PRO';
    }) {
        // Check if agent already exists
        const existing = await prisma.partnerAgent.findUnique({
            where: { phone_number: data.phone }
        });

        if (existing) {
            throw new Error('Agent already registered with this phone number');
        }

        // Get tenant (assuming single tenant for now)
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            throw new Error('System not configured - no tenant found');
        }

        // Upsert contact with PARTNER_AGENT type
        const contact = await prisma.contact.upsert({
            where: { phone_number: data.phone },
            update: {
                name: data.name,
                email: data.email,
                contact_type: 'PARTNER_AGENT',
                last_channel: 'website',
                last_interaction: new Date()
            },
            create: {
                phone_number: data.phone,
                name: data.name,
                email: data.email,
                tenant_id: tenant.id,
                contact_type: 'PARTNER_AGENT',
                source: 'website',
                last_channel: 'website',
                last_interaction: new Date()
            }
        });

        // Set package-specific defaults
        const packageType = data.package_type || 'FREE';
        let listingLimit = 10;
        let priorityScore = 50;

        if (packageType === 'PRO') {
            listingLimit = 50;
            priorityScore = 70;
        } else if (packageType === 'ADVANCE_PRO') {
            listingLimit = 999; // Unlimited
            priorityScore = 95;
        }

        // Create PartnerAgent
        const agent = await prisma.partnerAgent.create({
            data: {
                phone_number: data.phone,
                name: data.name,
                email: data.email,
                company_name: data.company_name,
                city: data.city,
                package_type: packageType,
                status: packageType === 'FREE' ? 'ACTIVE' : 'PENDING_PAYMENT',
                listing_limit: listingLimit,
                priority_score: priorityScore,
                subscription_start: packageType === 'FREE' ? new Date() : null,
                subscription_end: packageType === 'FREE' ? null : undefined // FREE has no expiry
            }
        });

        // Log interaction
        await prisma.interaction.create({
            data: {
                tenant_id: tenant.id,
                phone_number: data.phone,
                channel: 'website',
                direction: 'inbound',
                event_type: 'agent_registration',
                content: `Agent registered: ${data.name} (${packageType} package)`,
                metadata: { agent_id: agent.id, package: packageType }
            }
        });

        // Send welcome message via WhatsApp
        await this.sendWelcomeMessage(data.phone, data.name, packageType);

        return {
            id: agent.id,
            name: agent.name,
            phone: agent.phone_number,
            package_type: agent.package_type,
            status: agent.status
        };
    }

    /**
     * Send OTP to agent's phone via WhatsApp
     */
    public async sendAgentOTP(phone: string): Promise<void> {
        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Store OTP with 5-minute expiry
        otpStore.set(phone, {
            otp,
            expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
            attempts: 0
        });

        // Send via WhatsApp (Meta-approved authentication template)
        await this.whatsapp.sendTemplate(phone, 'rp_agent_otp', { otp });

        logger.info(`[AgentAuth] OTP sent to ${phone}: ${otp} (dev mode)`);
    }

    /**
     * Send OTP to partner agent's phone via WhatsApp (partner portal login)
     */
    public async sendPartnerOTP(phone: string): Promise<void> {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        otpStore.set(phone, {
            otp,
            expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
            attempts: 0,
        });

        // Use the REGISTRY KEY (rp_partner_login_otp), not the Meta name (rp_partner_login_otp_v2).
        // buildTemplatePayload looks up by key; passing the _v2 name threw "not found in registry".
        // (2026-06-26 partner-OTP fix.)
        await this.whatsapp.sendTemplate(phone, 'rp_partner_login_otp', { otp });

        logger.info(`[AgentAuth] Partner OTP sent to ${phone}`);
    }

    /**
     * Verify OTP and issue JWT token
     */
    public async verifyAgentOTP(phone: string, otp: string) {
        const entry = otpStore.get(phone);

        if (!entry) {
            throw new Error('OTP not found or expired. Please request a new OTP.');
        }

        // Check expiry
        if (Date.now() > entry.expiresAt) {
            otpStore.delete(phone);
            throw new Error('OTP expired. Please request a new OTP.');
        }

        // Check attempts
        if (entry.attempts >= 3) {
            otpStore.delete(phone);
            throw new Error('Too many failed attempts. Please request a new OTP.');
        }

        // Verify OTP
        if (entry.otp !== otp) {
            entry.attempts += 1;
            otpStore.set(phone, entry);
            throw new Error('Invalid OTP. Please try again.');
        }

        // OTP verified - delete from store
        otpStore.delete(phone);

        // Find agent
        const agent = await prisma.partnerAgent.findUnique({
            where: { phone_number: phone },
            include: { contact: true }
        });

        if (!agent) {
            throw new Error('Agent not found. Please register first.');
        }

        // Check if agent is active
        if (agent.status === 'SUSPENDED') {
            throw new Error('Your account has been suspended. Please contact support.');
        }

        if (agent.status === 'EXPIRED') {
            throw new Error('Your subscription has expired. Please renew to continue.');
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                agent_id: agent.id,
                phone: agent.phone_number,
                name: agent.name,
                package_type: agent.package_type,
                status: agent.status,
                role: 'EXTERNAL_AGENT'
            },
            AGENT_JWT_SECRET,
            { expiresIn: AGENT_JWT_EXPIRES_IN }
        );

        // Update last login (via contact)
        await prisma.contact.update({
            where: { phone_number: phone },
            data: { last_interaction: new Date() }
        });

        return {
            token,
            agent: {
                id: agent.id,
                name: agent.name,
                phone: agent.phone_number,
                email: agent.email,
                company_name: agent.company_name,
                package_type: agent.package_type,
                status: agent.status,
                listing_limit: agent.listing_limit
            }
        };
    }

    /**
     * Verify agent JWT token
     */
    public verifyAgentToken(token: string): any {
        try {
            return jwt.verify(token, AGENT_JWT_SECRET);
        } catch (error) {
            throw new Error('Invalid or expired token');
        }
    }

    /**
     * Get agent by ID
     */
    public async getAgentById(agentId: string) {
        const agent = await prisma.partnerAgent.findUnique({
            where: { id: agentId }
        });

        if (!agent) {
            throw new Error('Agent not found');
        }

        return agent;
    }

    /**
     * Check if agent has reached listing limit
     */
    public async checkListingLimit(agentId: string): Promise<boolean> {
        const agent = await prisma.partnerAgent.findUnique({
            where: { id: agentId },
            include: {
                inventory: {
                    where: { status: 'active' }
                }
            }
        });

        if (!agent) {
            throw new Error('Agent not found');
        }

        return agent.inventory.length < agent.listing_limit;
    }

    /**
     * Send welcome message to new agent
     */
    private async sendWelcomeMessage(phone: string, name: string, packageType: string): Promise<void> {
        if (packageType === 'FREE') {
            await this.whatsapp.sendTemplate(phone, 'rp_agent_welcome_free', { name });
        } else {
            await this.whatsapp.sendTemplate(phone, 'rp_agent_welcome_paid', {
                name,
                package: packageType,
            });
        }
    }
}
