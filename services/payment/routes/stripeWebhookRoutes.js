import express from 'express';

import {
    createStripeWebhookService,
    StripeWebhookError
} from '../services/stripeWebhookService.js';

export function createStripeWebhookRouter({
    service = createStripeWebhookService()
} = {}) {
    const router = express.Router();

    router.post(
        '/internal/stripe/webhooks/verify',
        express.raw({
            type: 'application/json',
            limit: '256kb'
        }),
        (req, res) => {
            try {
                const event = service.verifyEvent(
                    req.body,
                    req.get('stripe-signature')
                );

                return res.json(event);
            } catch (error) {
                if (error instanceof StripeWebhookError) {
                    return res.status(error.status).json({
                        error: {
                            code: error.code,
                            message: error.message
                        }
                    });
                }

                console.error('Stripe webhook verification failed:', error);

                return res.status(500).json({
                    error: {
                        code: 'WEBHOOK_VERIFICATION_FAILED',
                        message: 'Could not verify Stripe webhook.'
                    }
                });
            }
        }
    );

    return router;
}