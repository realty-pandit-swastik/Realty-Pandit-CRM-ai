/**
 * Payment Service - Razorpay Integration
 *
 * Handles subscription payments, order creation, webhook verification,
 * and refund processing for Realty Pandit.
 */

import crypto from 'crypto';
import axios from 'axios';
import prisma from '../db';
import logger from '../utils/logger';
import { SubscriptionService } from './subscription';
import { PlanType, SubscriptionStatus } from '@prisma/client';

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const RAZORPAY_BASE_URL = 'https://api.razorpay.com/v1';

// Plan pricing in paise (INR * 100)
const PLAN_PRICES: Record<string, { amount: number; name: string; description: string }> = {
    BASIC: { amount: 99900, name: 'Basic Plan', description: 'Up to 10 property listings, standard support' },
    PRO: { amount: 249900, name: 'Pro Plan', description: 'Up to 50 listings, priority support, analytics' },
    PREMIUM: { amount: 499900, name: 'Premium Plan', description: 'Unlimited listings, dedicated support, advanced analytics' },
    ENTERPRISE: { amount: 999900, name: 'Enterprise Plan', description: 'Custom solution with API access and white-label' },
};

interface RazorpayOrder {
    id: string;
    amount: number;
    currency: string;
    receipt: string;
    status: string;
}

interface PaymentVerification {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
}

export class PaymentService {
    private subscriptionService: SubscriptionService;
    private auth: string;

    constructor() {
        this.subscriptionService = new SubscriptionService();
        this.auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    }

    private async razorpayRequest(method: string, endpoint: string, data?: any) {
        try {
            const response = await axios({
                method,
                url: `${RAZORPAY_BASE_URL}${endpoint}`,
                headers: {
                    'Authorization': `Basic ${this.auth}`,
                    'Content-Type': 'application/json',
                },
                data,
            });
            return response.data;
        } catch (error: any) {
            logger.error(`[PaymentService] Razorpay API error: ${error.response?.data?.error?.description || error.message}`);
            throw new Error(error.response?.data?.error?.description || 'Payment gateway error');
        }
    }

    /**
     * Create a Razorpay order for subscription upgrade
     */
    async createOrder(ownerId: string, planType: string): Promise<RazorpayOrder & { key_id: string }> {
        const plan = PLAN_PRICES[planType];
        if (!plan) {
            throw new Error(`Invalid plan type: ${planType}. Valid plans: ${Object.keys(PLAN_PRICES).join(', ')}`);
        }

        // Verify owner exists
        const owner = await prisma.owner.findUnique({
            where: { id: ownerId },
            include: { subscription: true, contact: true },
        });

        if (!owner) throw new Error('Owner not found');
        if (owner.subscription?.plan_type === planType) throw new Error(`Already on ${planType} plan`);

        const receipt = `rp_${ownerId.slice(0, 8)}_${Date.now()}`;

        const order = await this.razorpayRequest('POST', '/orders', {
            amount: plan.amount,
            currency: 'INR',
            receipt,
            notes: {
                owner_id: ownerId,
                plan_type: planType,
                owner_name: owner.contact?.name || 'Unknown',
                owner_phone: owner.contact?.phone_number || '',
            },
        });

        logger.info(`[PaymentService] Order created: ${order.id} for owner ${ownerId}, plan: ${planType}, amount: ${plan.amount / 100} INR`);

        return {
            ...order,
            key_id: RAZORPAY_KEY_ID,
        };
    }

    /**
     * Verify payment signature from Razorpay checkout
     */
    verifyPaymentSignature(payload: PaymentVerification): boolean {
        const body = payload.razorpay_order_id + '|' + payload.razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        return expectedSignature === payload.razorpay_signature;
    }

    /**
     * Confirm payment and activate subscription
     */
    async confirmPayment(payload: PaymentVerification): Promise<{ success: boolean; message: string }> {
        // Verify signature
        if (!this.verifyPaymentSignature(payload)) {
            logger.error(`[PaymentService] Invalid payment signature for order ${payload.razorpay_order_id}`);
            throw new Error('Invalid payment signature');
        }

        // Fetch order details from Razorpay
        const order = await this.razorpayRequest('GET', `/orders/${payload.razorpay_order_id}`);
        const ownerId = order.notes?.owner_id;
        const planType = order.notes?.plan_type as PlanType;

        if (!ownerId || !planType) {
            throw new Error('Invalid order: missing owner_id or plan_type in notes');
        }

        // Activate subscription
        await prisma.$transaction(async (tx) => {
            // Update subscription to ACTIVE
            await tx.subscription.update({
                where: { owner_id: ownerId },
                data: {
                    plan_type: planType,
                    status: SubscriptionStatus.ACTIVE,
                    start_date: new Date(),
                    end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                },
            });

            // Log the payment
            await tx.transactionLog.create({
                data: {
                    transaction_id: payload.razorpay_payment_id,
                    action: 'PAYMENT_RECEIVED',
                    performed_by: ownerId,
                    details: JSON.stringify({
                        order_id: payload.razorpay_order_id,
                        payment_id: payload.razorpay_payment_id,
                        plan_type: planType,
                        amount: order.amount / 100,
                        currency: order.currency,
                    }),
                },
            });
        });

        logger.info(`[PaymentService] Payment confirmed: ${payload.razorpay_payment_id} for owner ${ownerId}, plan: ${planType}`);

        return { success: true, message: `Subscription activated: ${planType} plan` };
    }

    /**
     * Handle Razorpay webhook events
     */
    async handleWebhook(body: any, signature: string): Promise<{ status: string }> {
        // Verify webhook signature
        const expectedSignature = crypto
            .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
            .update(JSON.stringify(body))
            .digest('hex');

        if (expectedSignature !== signature) {
            logger.error('[PaymentService] Invalid webhook signature');
            throw new Error('Invalid webhook signature');
        }

        const event = body.event;
        const payload = body.payload;

        logger.info(`[PaymentService] Webhook received: ${event}`);

        switch (event) {
            case 'payment.captured': {
                const payment = payload.payment.entity;
                const orderId = payment.order_id;
                if (orderId) {
                    await this.confirmPayment({
                        razorpay_order_id: orderId,
                        razorpay_payment_id: payment.id,
                        razorpay_signature: '', // Webhook already verified
                    }).catch(e => logger.error(`[PaymentService] Webhook confirm failed: ${e.message}`));
                }
                break;
            }

            case 'payment.failed': {
                const payment = payload.payment.entity;
                logger.warn(`[PaymentService] Payment failed: ${payment.id}, reason: ${payment.error_description}`);
                break;
            }

            case 'refund.processed': {
                const refund = payload.refund.entity;
                logger.info(`[PaymentService] Refund processed: ${refund.id}, amount: ${refund.amount / 100} INR`);
                break;
            }

            default:
                logger.info(`[PaymentService] Unhandled webhook event: ${event}`);
        }

        return { status: 'ok' };
    }

    /**
     * Create a payment link (for sending via WhatsApp/Email)
     */
    async createPaymentLink(ownerId: string, planType: string): Promise<{ short_url: string; id: string }> {
        const plan = PLAN_PRICES[planType];
        if (!plan) throw new Error(`Invalid plan type: ${planType}`);

        const owner = await prisma.owner.findUnique({
            where: { id: ownerId },
            include: { contact: true },
        });

        if (!owner) throw new Error('Owner not found');

        const link = await this.razorpayRequest('POST', '/payment_links', {
            amount: plan.amount,
            currency: 'INR',
            description: `Realty Pandit - ${plan.name}`,
            customer: {
                name: owner.contact?.name || 'Customer',
                contact: owner.contact?.phone_number || '',
                email: owner.contact?.email || '',
            },
            notify: { sms: true, email: true },
            callback_url: `https://www.realtypandit.in/payment/success?owner=${ownerId}&plan=${planType}`,
            callback_method: 'get',
            notes: {
                owner_id: ownerId,
                plan_type: planType,
            },
            expire_by: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
        });

        logger.info(`[PaymentService] Payment link created: ${link.short_url} for owner ${ownerId}`);

        return { short_url: link.short_url, id: link.id };
    }

    /**
     * Process refund
     */
    async refund(paymentId: string, amount?: number, reason?: string): Promise<any> {
        const data: any = { speed: 'normal' };
        if (amount) data.amount = amount * 100; // Convert to paise
        if (reason) data.notes = { reason };

        const refund = await this.razorpayRequest('POST', `/payments/${paymentId}/refunds`, data);
        logger.info(`[PaymentService] Refund initiated: ${refund.id} for payment ${paymentId}`);
        return refund;
    }

    /**
     * Fetch payment details
     */
    async getPayment(paymentId: string): Promise<any> {
        return this.razorpayRequest('GET', `/payments/${paymentId}`);
    }

    /**
     * Get plan pricing info
     */
    getPlanPricing() {
        return Object.entries(PLAN_PRICES).map(([key, val]) => ({
            plan: key,
            amount: val.amount / 100,
            currency: 'INR',
            name: val.name,
            description: val.description,
        }));
    }
}

// Singleton
export const paymentService = new PaymentService();
