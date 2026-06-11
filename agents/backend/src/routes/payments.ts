/**
 * Payment Routes - Razorpay Integration
 *
 * Handles order creation, payment verification, webhooks, and refunds.
 * Mount: /api/payments (JWT) + /webhooks/razorpay (no auth, signature verified)
 */

import { Router, Request, Response } from 'express';
import { paymentService } from '../services/payment';
import logger from '../utils/logger';
import { captureRouteError } from '../utils/capture';

const router = Router();

/**
 * GET /api/payments/plans
 * Get available subscription plans with pricing
 */
router.get('/plans', (req: Request, res: Response) => {
    const plans = paymentService.getPlanPricing();
    res.json({ plans });
});

/**
 * POST /api/payments/create-order
 * Create a Razorpay order for subscription upgrade
 * Body: { owner_id, plan_type }
 */
router.post('/create-order', async (req: Request, res: Response) => {
    try {
        const { owner_id, plan_type } = req.body;

        if (!owner_id || !plan_type) {
            return res.status(400).json({ error: 'owner_id and plan_type are required' });
        }

        const order = await paymentService.createOrder(owner_id, plan_type);
        res.json({ success: true, order });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'payments/create-order' });
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/payments/verify
 * Verify payment after Razorpay checkout
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
router.post('/verify', async (req: Request, res: Response) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ error: 'Missing payment verification fields' });
        }

        const result = await paymentService.confirmPayment({
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        });

        res.json(result);
    } catch (error: any) {
        captureRouteError(error, req, { route: 'payments/verify' });
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/payments/create-link
 * Create a payment link (for WhatsApp/Email sharing)
 * Body: { owner_id, plan_type }
 */
router.post('/create-link', async (req: Request, res: Response) => {
    try {
        const { owner_id, plan_type } = req.body;

        if (!owner_id || !plan_type) {
            return res.status(400).json({ error: 'owner_id and plan_type are required' });
        }

        const link = await paymentService.createPaymentLink(owner_id, plan_type);
        res.json({ success: true, ...link });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'payments/create-link' });
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/payments/refund
 * Process a refund
 * Body: { payment_id, amount?, reason? }
 */
router.post('/refund', async (req: Request, res: Response) => {
    try {
        const { payment_id, amount, reason } = req.body;

        if (!payment_id) {
            return res.status(400).json({ error: 'payment_id is required' });
        }

        const refund = await paymentService.refund(payment_id, amount, reason);
        res.json({ success: true, refund });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'payments/refund' });
        res.status(400).json({ error: error.message });
    }
});

/**
 * GET /api/payments/:payment_id
 * Get payment details
 */
router.get('/:payment_id', async (req: Request, res: Response) => {
    try {
        const payment = await paymentService.getPayment(req.params.payment_id);
        res.json({ success: true, payment });
    } catch (error: any) {
        captureRouteError(error, req, { route: 'payments/get-by-id', payment_id: String(req.params.payment_id) });
        res.status(400).json({ error: error.message });
    }
});

export default router;

/**
 * Webhook router - separate, mounted without JWT auth
 * Razorpay signs webhooks with X-Razorpay-Signature header
 */
export const razorpayWebhookRouter = Router();

razorpayWebhookRouter.post('/razorpay', async (req: Request, res: Response) => {
    try {
        const signature = req.headers['x-razorpay-signature'] as string;
        if (!signature) {
            return res.status(400).json({ error: 'Missing signature' });
        }

        const result = await paymentService.handleWebhook(req.body, signature);
        res.json(result);
    } catch (error: any) {
        captureRouteError(error, req, { route: 'webhook/razorpay' });
        res.status(400).json({ error: error.message });
    }
});
