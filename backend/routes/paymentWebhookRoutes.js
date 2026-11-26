import express from "express";

import {
    handleStripeWebhook,
    PaymentWebhookError
} from "../services/paymentWebhookService.js";

export function createPaymentWebhookRouter({
    handle = handleStripeWebhook
} = {}) {
    const router = express.Router();

    router.post(
        "/api/payments/webhooks/stripe",
        express.raw({
            type: "application/json",
            limit: "256kb"
        }),
        async (req, res) => {
            try {
                const result = await handle(
                    req.body,
                    req.get("stripe-signature")
                );

                return res.status(200).json(result);
            } catch (error) {
                if (error instanceof PaymentWebhookError) {
                    return res.status(error.status).json({
                        error: {
                            code: error.code,
                            message: error.message
                        }
                    });
                }

                console.error(
                    "Stripe webhook processing failed:",
                    error
                );

                return res.status(503).json({
                    error: {
                        code: "WEBHOOK_PROCESSING_FAILED",
                        message: "Webhook processing could not be completed."
                    }
                });
            }
        }
    );

    return router;
}