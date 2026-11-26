import {
    findPaymentByStripeSessionIdForUpdate,
    findStripeWebhookEventByIdForUpdate
} from "../dao/payment/paymentReadDao.js";

import {
    withPaymentTransaction,
    insertStripeWebhookEvent,
    updatePaymentStatus,
    markStripeWebhookProcessed,
    markStripeWebhookFailed
} from "../dao/payment/paymentWriteDao.js";

import {
    queueBookingPaymentSync,
    markBookingPaymentSynced
} from "../dao/payment/paymentWriteDao.js";

import {
    synchronizeBookingPayment
} from "./bookingPaymentService.js";

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUPPORTED_EVENTS = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired"
]);

export class PaymentWebhookError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function validateVerifiedEvent(event) {
    const bookingId = Number(event?.bookingId);

    if (
        typeof event?.eventId !== "string" ||
        !event.eventId.startsWith("evt_") ||
        event.ignored !== false ||
        !SUPPORTED_EVENTS.has(event.eventType) ||
        typeof event.stripeSessionId !== "string" ||
        !event.stripeSessionId.startsWith("cs_") ||
        !UUID_PATTERN.test(event.paymentId) ||
        !UUID_PATTERN.test(event.checkoutAttemptId) ||
        !/^[1-9]\d*$/.test(String(event.bookingId)) ||
        !Number.isSafeInteger(bookingId) ||
        bookingId > 2147483647 ||
        !Number.isSafeInteger(event.amountCents) ||
        event.amountCents < 1 ||
        event.currency !== "eur" ||
        !["paid", "unpaid", "no_payment_required"].includes(
            event.paymentStatus
        )
    ) {
        throw new PaymentWebhookError(
            502,
            "INVALID_VERIFIED_EVENT",
            "The payment service returned invalid event details."
        );
    }

    if (
        event.eventType === "checkout.session.async_payment_succeeded" &&
        event.paymentStatus !== "paid"
    ) {
        throw new PaymentWebhookError(
            502,
            "INVALID_VERIFIED_EVENT",
            "The successful payment event has an invalid payment status."
        );
    }
}

function resolvePaymentOutcome(event) {
    switch (event.eventType) {
        case "checkout.session.completed":
            return event.paymentStatus === "paid"
                ? "paid"
                : null;

        case "checkout.session.async_payment_succeeded":
            return "paid";

        case "checkout.session.async_payment_failed":
            return "failed";

        case "checkout.session.expired":
            return "expired";

        default:
            return null;
    }
}

export async function stageVerifiedStripeEvent(event, {
    transaction = withPaymentTransaction,
    findPayment = findPaymentByStripeSessionIdForUpdate,
    findEvent = findStripeWebhookEventByIdForUpdate,
    insertEvent = insertStripeWebhookEvent,
    changePaymentStatus = updatePaymentStatus,
    markProcessed = markStripeWebhookProcessed,
    queueBookingSync = queueBookingPaymentSync
} = {}) {
    validateVerifiedEvent(event);

    return transaction(async (client) => {
        const payment = await findPayment(
            event.stripeSessionId,
            client
        );

        if (!payment) {
            throw new PaymentWebhookError(
                503,
                "PAYMENT_NOT_READY",
                "The payment record is not ready for processing."
            );
        }

        if (
            payment.id !== event.paymentId ||
            payment.bookingId !== Number(event.bookingId) ||
            payment.checkoutAttemptId !== event.checkoutAttemptId ||
            payment.amountCents !== event.amountCents ||
            payment.currency !== event.currency
        ) {
            throw new PaymentWebhookError(
                422,
                "PAYMENT_DETAILS_MISMATCH",
                "The Stripe event does not match the stored payment."
            );
        }

        await insertEvent({
            eventId: event.eventId,
            eventType: event.eventType,
            paymentId: payment.id
        }, client);

        const storedEvent = await findEvent(
            event.eventId,
            client
        );

        if (
            !storedEvent ||
            storedEvent.eventType !== event.eventType ||
            storedEvent.paymentId !== payment.id
        ) {
            throw new PaymentWebhookError(
                422,
                "WEBHOOK_EVENT_CONFLICT",
                "The webhook conflicts with an existing event."
            );
        }

        if (storedEvent.processingStatus === "processed") {
            return {
                alreadyProcessed: true,
                needsBookingUpdate: false
            };
        }

        const outcome = resolvePaymentOutcome(event);

        let needsBookingUpdate = false;

        if (outcome === "paid") {
            if (payment.status !== "paid") {
                const updated = await changePaymentStatus({
                    paymentId: payment.id,
                    expectedStatus: payment.status,
                    status: "paid",
                    stripePaymentIntentId:
                        event.stripePaymentIntentId ?? null
                }, client);

                if (!updated) {
                    throw new PaymentWebhookError(
                        409,
                        "PAYMENT_STATE_CHANGED",
                        "The payment state changed during processing."
                    );
                }
            }

            needsBookingUpdate = true;
        } else if (
            outcome === "failed" ||
            outcome === "expired"
        ) {
            if (payment.status === outcome) {
                needsBookingUpdate = true;
            } else if (
                payment.status === "creating" ||
                payment.status === "pending_payment"
            ) {
                const updated = await changePaymentStatus({
                    paymentId: payment.id,
                    expectedStatus: payment.status,
                    status: outcome
                }, client);

                if (!updated) {
                    throw new PaymentWebhookError(
                        409,
                        "PAYMENT_STATE_CHANGED",
                        "The payment state changed during processing."
                    );
                }

                needsBookingUpdate = true;
            }
        }

        if (!needsBookingUpdate) {
            await markProcessed(event.eventId, client);

            return {
                alreadyProcessed: false,
                needsBookingUpdate: false
            };
        }

        await queueBookingSync(
            payment.id,
            outcome,
            client
        );

        return {
            alreadyProcessed: false,
            needsBookingUpdate: true,
            paymentId: payment.id,
            bookingId: payment.bookingId,
            checkoutAttemptId: payment.checkoutAttemptId,
            bookingStatus: outcome
        };
    });
}

export async function handleStripeWebhook(
    rawBody,
    signature,
    {
        request = fetch,
        paymentUrl = process.env.PAYMENT_URL || "http://localhost:3004",
        bookingUrl = process.env.BOOKING_URL || "http://localhost:3002",
        stage = stageVerifiedStripeEvent,
        markProcessed = markStripeWebhookProcessed,
        markFailed = markStripeWebhookFailed,
        markBookingSync = markBookingPaymentSynced,
        synchronizeBooking = synchronizeBookingPayment,
    } = {}
) {
    if (
        !Buffer.isBuffer(rawBody) ||
        rawBody.length === 0 ||
        typeof signature !== "string" ||
        !signature
    ) {
        throw new PaymentWebhookError(
            400,
            "INVALID_WEBHOOK_REQUEST",
            "A signed webhook payload is required."
        );
    }

    let verificationResponse;

    try {
        verificationResponse = await request(
            new URL("/internal/stripe/webhooks/verify", paymentUrl),
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Stripe-Signature": signature
                },
                body: rawBody,
                signal: AbortSignal.timeout(5000)
            }
        );
    } catch {
        throw new PaymentWebhookError(
            503,
            "PAYMENT_SERVICE_UNAVAILABLE",
            "Webhook verification is temporarily unavailable."
        );
    }

    if (!verificationResponse.ok) {
        if (verificationResponse.status === 400) {
            throw new PaymentWebhookError(
                400,
                "INVALID_STRIPE_WEBHOOK",
                "Stripe webhook verification failed."
            );
        }

        throw new PaymentWebhookError(
            503,
            "WEBHOOK_VERIFICATION_UNAVAILABLE",
            "Webhook verification could not be completed."
        );
    }

    let event;

    try {
        event = await verificationResponse.json();
    } catch {
        throw new PaymentWebhookError(
            503,
            "INVALID_VERIFICATION_RESPONSE",
            "The payment service returned an invalid response."
        );
    }

    if (event?.ignored === true) {
        return {
            received: true,
            ignored: true
        };
    }

    validateVerifiedEvent(event);

    const staged = await stage(event);

    if (staged.alreadyProcessed || !staged.needsBookingUpdate) {
        return {
            received: true,
            duplicate: staged.alreadyProcessed
        };
    }

    try {
        await synchronizeBooking(
            {
                bookingId: staged.bookingId,
                checkoutAttemptId: staged.checkoutAttemptId,
                status: staged.bookingStatus
            },
            {
                request,
                bookingUrl
            }
        );

        const synchronized = await markBookingSync(
            staged.paymentId,
            staged.bookingStatus
        );

        if (!synchronized) {
            throw new Error(
                "Booking synchronization state changed during processing."
            );
        }

        await markProcessed(event.eventId);
    } catch (error) {
        try {
            await markFailed(event.eventId, error.message);
        } catch (markError) {
            console.error(
                "Could not record webhook processing failure:",
                markError
            );
        }

        throw new PaymentWebhookError(
            503,
            "BOOKING_SYNCHRONIZATION_FAILED",
            "Payment was recorded, but booking synchronization is incomplete."
        );
    }

    return {
        received: true,
        duplicate: false
    };
}