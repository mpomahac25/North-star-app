import express from "express";
import {
    createCheckoutSessionForBooking,
    PaymentPreparationError
} from "../services/paymentService.js";
import {
    getCheckoutSessionStatus,
    PaymentStatusError
} from "../services/paymentStatusService.js";

export function createPaymentRouter({
    checkout = createCheckoutSessionForBooking,
    statusLookup = getCheckoutSessionStatus
} = {}) {
    const router = express.Router();

    router.post("/api/payments/checkout-sessions", async (req, res) => {
        const bookingId = req.body?.bookingId;

        if (
            !Number.isSafeInteger(bookingId) ||
            bookingId < 1 ||
            bookingId > 2147483647
        ) {
            return res.status(400).json({
                error: {
                    code: "INVALID_BOOKING_ID",
                    message: "A valid booking ID is required."
                }
            });
        }

        try {
            const { reused, ...session } = await checkout(bookingId);

            return res.status(reused ? 200 : 201).json(session);
        } catch (error) {
            if (error instanceof PaymentPreparationError) {
                return res.status(error.status).json({
                    error: {
                        code: error.code,
                        message: error.message
                    }
                });
            }

            console.error("Could not create Checkout Session:", error);

            return res.status(500).json({
                error: {
                    code: "CHECKOUT_CREATION_FAILED",
                    message: "Could not create the Checkout Session."
                }
            });
        }
    });

    router.get(
        "/api/payments/checkout-sessions/:sessionId/status",
        async (req, res) => {
            try {
                const result = await statusLookup(
                    req.params.sessionId
                );

                return res.json(result);
            } catch (error) {
                if (error instanceof PaymentStatusError) {
                    return res.status(error.status).json({
                        error: {
                            code: error.code,
                            message: error.message
                        }
                    });
                }

                console.error(
                    "Could not retrieve payment status:",
                    error
                );

                return res.status(503).json({
                    error: {
                        code: "PAYMENT_STATUS_UNAVAILABLE",
                        message: "Payment status is temporarily unavailable."
                    }
                });
            }
        }
    );

    return router;
}