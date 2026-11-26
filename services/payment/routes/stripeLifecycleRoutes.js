import express from "express";

import {
    createStripeSessionLifecycleService,
    StripeLifecycleError
} from "../services/stripeSessionLifecycleService.js";

export function createStripeLifecycleRouter({
    service = createStripeSessionLifecycleService()
} = {}) {
    const router = express.Router();

    router.post(
        "/internal/stripe/checkout/:sessionId/reconcile",
        async (req, res) => {
            try {
                const result = await service.reconcileSession(
                    req.params.sessionId
                );

                return res.json(result);
            } catch (error) {
                if (error instanceof StripeLifecycleError) {
                    return res.status(error.status).json({
                        error: {
                            code: error.code,
                            message: error.message
                        }
                    });
                }

                console.error(
                    "Stripe Session reconciliation failed:",
                    error
                );

                return res.status(503).json({
                    error: {
                        code: "STRIPE_RECONCILIATION_FAILED",
                        message: "Could not reconcile Checkout Session."
                    }
                });
            }
        }
    );

    return router;
}