import { createStripeClient } from "./stripeClient.js";

export class StripeLifecycleError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function normalizeSession(session, expectedSessionId) {
    if (
        session?.object !== "checkout.session" ||
        session.id !== expectedSessionId ||
        session.livemode !== false ||
        session.mode !== "payment" ||
        !["open", "complete", "expired"].includes(session.status) ||
        !["paid", "unpaid", "no_payment_required"].includes(
            session.payment_status
        ) ||
        !Number.isSafeInteger(session.amount_total) ||
        session.amount_total < 1 ||
        session.currency !== "eur" ||
        typeof session.metadata?.paymentId !== "string" ||
        typeof session.metadata?.bookingId !== "string" ||
        typeof session.metadata?.checkoutAttemptId !== "string"
    ) {
        throw new StripeLifecycleError(
            502,
            "INVALID_STRIPE_SESSION",
            "Stripe returned unexpected Checkout Session information."
        );
    }

    return {
        stripeSessionId: session.id,
        sessionStatus: session.status,
        paymentStatus: session.payment_status,
        stripePaymentIntentId:
            typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id ?? null,
        amountCents: session.amount_total,
        currency: session.currency,
        bookingId: session.metadata.bookingId,
        paymentId: session.metadata.paymentId,
        checkoutAttemptId: session.metadata.checkoutAttemptId
    };
}

export function createStripeSessionLifecycleService({
    stripe
} = {}) {
    let client = stripe;

    function getClient() {
        if (!client) {
            try {
                client = createStripeClient(
                    process.env.STRIPE_SECRET_KEY
                );
            } catch {
                throw new StripeLifecycleError(
                    503,
                    "STRIPE_CONFIGURATION_ERROR",
                    "Stripe is not configured."
                );
            }
        }

        return client;
    }

    async function retrieveSession(sessionId) {
        try {
            return await getClient().checkout.sessions.retrieve(
                sessionId
            );
        } catch {
            throw new StripeLifecycleError(
                503,
                "STRIPE_SESSION_UNAVAILABLE",
                "Could not retrieve the Stripe Checkout Session."
            );
        }
    }

    return {
        async reconcileSession(sessionId) {
            if (
                typeof sessionId !== "string" ||
                !/^cs_test_[A-Za-z0-9_]+$/.test(sessionId) ||
                sessionId.length > 255
            ) {
                throw new StripeLifecycleError(
                    400,
                    "INVALID_SESSION_ID",
                    "A valid test-mode Checkout Session ID is required."
                );
            }

            let session = await retrieveSession(sessionId);

            normalizeSession(session, sessionId);

            if (session.status === "open") {
                try {
                    session = await getClient()
                        .checkout.sessions.expire(sessionId);
                } catch {
                    session = await retrieveSession(sessionId);

                    if (session.status === "open") {
                        throw new StripeLifecycleError(
                            503,
                            "STRIPE_EXPIRATION_FAILED",
                            "The Checkout Session could not be expired."
                        );
                    }
                }
            }

            return normalizeSession(session, sessionId);
        }
    };
}