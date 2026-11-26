import express from 'express';
import {
    createStripeCheckoutService,
    StripeCheckoutError
} from '../services/stripeCheckoutService.js';

export function createStripeRouter({ service } = {}) {
    const router = express.Router();
    let checkoutService = service;

    router.post('/internal/stripe/checkout', async (req, res) => {
        try {
            checkoutService ??= createStripeCheckoutService();

            const session = await checkoutService.createCheckoutSession(
                req.body
            );

            return res.status(201).json(session);
        } catch (error) {
            if (error instanceof StripeCheckoutError) {
                return res.status(error.status).json({
                    error: {
                        code: error.code,
                        message: error.message
                    }
                });
            }

            console.error('Stripe Checkout request failed:', error);

            return res.status(500).json({
                error: {
                    code: 'PAYMENT_SERVICE_ERROR',
                    message: 'Could not process the Checkout request.'
                }
            });
        }
    });

    return router;
}