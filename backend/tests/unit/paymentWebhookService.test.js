import { jest } from "@jest/globals";

import {
    stageVerifiedStripeEvent,
    handleStripeWebhook
} from "../../services/paymentWebhookService.js";

const PAYMENT_ID = "8f3b3e0b-8a1d-4b82-9fd6-2ef79a809a50";
const CHECKOUT_ID = "b37ed126-fd9a-430c-b9e1-0c82fc3a976e";

const EVENT = {
    eventId: "evt_test_123",
    eventType: "checkout.session.completed",
    ignored: false,
    stripeSessionId: "cs_test_123",
    paymentStatus: "paid",
    stripePaymentIntentId: "pi_test_123",
    amountCents: 2500,
    currency: "eur",
    bookingId: "123",
    paymentId: PAYMENT_ID,
    checkoutAttemptId: CHECKOUT_ID
};

function createPayment(overrides = {}) {
    return {
        id: PAYMENT_ID,
        bookingId: 123,
        checkoutAttemptId: CHECKOUT_ID,
        stripeSessionId: EVENT.stripeSessionId,
        amountCents: 2500,
        currency: "eur",
        status: "pending_payment",
        ...overrides
    };
}

function createStageDependencies({
    storedPayment = createPayment(),
    event = EVENT,
    processingStatus = "received"
} = {}) {
    const client = {};

    const dependencies = {
        transaction: jest.fn(async operation => operation(client)),

        findPayment: jest.fn(async () => storedPayment),

        findEvent: jest.fn(async () => ({
            eventId: event.eventId,
            eventType: event.eventType,
            paymentId: PAYMENT_ID,
            processingStatus
        })),

        insertEvent: jest.fn(async () => true),

        changePaymentStatus: jest.fn(async () => true),

        markProcessed: jest.fn(async () => true),

        queueBookingSync: jest.fn(async () => true)
    };

    return {
        client,
        dependencies
    };
}

describe("Stripe webhook state processing", () => {
    test("records a successful payment and queues booking confirmation", async () => {
        const { client, dependencies } = createStageDependencies();

        const result = await stageVerifiedStripeEvent(
            EVENT,
            dependencies
        );

        expect(result).toEqual({
            alreadyProcessed: false,
            needsBookingUpdate: true,
            paymentId: PAYMENT_ID,
            bookingId: 123,
            checkoutAttemptId: CHECKOUT_ID,
            bookingStatus: "paid"
        });

        expect(dependencies.changePaymentStatus).toHaveBeenCalledWith(
            {
                paymentId: PAYMENT_ID,
                expectedStatus: "pending_payment",
                status: "paid",
                stripePaymentIntentId: "pi_test_123"
            },
            client
        );

        expect(dependencies.queueBookingSync).toHaveBeenCalledWith(
            PAYMENT_ID,
            "paid",
            client
        );

        expect(dependencies.markProcessed).not.toHaveBeenCalled();
    });

    test("does not mark an unpaid Checkout Session as paid", async () => {
        const { client, dependencies } = createStageDependencies();

        const event = {
            ...EVENT,
            paymentStatus: "unpaid"
        };

        const result = await stageVerifiedStripeEvent(
            event,
            dependencies
        );

        expect(result.needsBookingUpdate).toBe(false);

        expect(dependencies.changePaymentStatus).not.toHaveBeenCalled();

        expect(dependencies.queueBookingSync).not.toHaveBeenCalled();

        expect(dependencies.markProcessed).toHaveBeenCalledWith(
            EVENT.eventId,
            client
        );
    });

    test("ignores webhook events that were already processed", async () => {
        const { dependencies } = createStageDependencies({
            processingStatus: "processed"
        });

        const result = await stageVerifiedStripeEvent(
            EVENT,
            dependencies
        );

        expect(result).toEqual({
            alreadyProcessed: true,
            needsBookingUpdate: false
        });

        expect(dependencies.changePaymentStatus).not.toHaveBeenCalled();

        expect(dependencies.queueBookingSync).not.toHaveBeenCalled();

        expect(dependencies.markProcessed).not.toHaveBeenCalled();
    });

    test("does not expire an already paid payment", async () => {
        const expiredEvent = {
            ...EVENT,
            eventId: "evt_test_expired_123",
            eventType: "checkout.session.expired",
            paymentStatus: "unpaid"
        };

        const { client, dependencies } = createStageDependencies({
            storedPayment: createPayment({
                status: "paid"
            }),
            event: expiredEvent
        });

        const result = await stageVerifiedStripeEvent(
            expiredEvent,
            dependencies
        );

        expect(result.needsBookingUpdate).toBe(false);

        expect(dependencies.changePaymentStatus).not.toHaveBeenCalled();

        expect(dependencies.queueBookingSync).not.toHaveBeenCalled();

        expect(dependencies.markProcessed).toHaveBeenCalledWith(
            expiredEvent.eventId,
            client
        );
    });

    test("rejects webhook events with mismatched payment details", async () => {
        const { dependencies } = createStageDependencies({
            storedPayment: createPayment({
                amountCents: 3000
            })
        });

        await expect(
            stageVerifiedStripeEvent(EVENT, dependencies)
        ).rejects.toMatchObject({
            status: 422,
            code: "PAYMENT_DETAILS_MISMATCH"
        });

        expect(dependencies.insertEvent).not.toHaveBeenCalled();

        expect(dependencies.changePaymentStatus).not.toHaveBeenCalled();

        expect(dependencies.queueBookingSync).not.toHaveBeenCalled();
    });

    test("retries booking confirmation for an already paid payment", async () => {
        const { client, dependencies } = createStageDependencies({
            storedPayment: createPayment({
                status: "paid"
            })
        });

        const result = await stageVerifiedStripeEvent(
            EVENT,
            dependencies
        );

        expect(result.needsBookingUpdate).toBe(true);
        expect(result.bookingStatus).toBe("paid");

        expect(dependencies.changePaymentStatus).not.toHaveBeenCalled();

        expect(dependencies.queueBookingSync).toHaveBeenCalledWith(
            PAYMENT_ID,
            "paid",
            client
        );
    });

    test("expires an unpaid payment and queues booking expiration", async () => {
        const expiredEvent = {
            ...EVENT,
            eventId: "evt_test_expired_456",
            eventType: "checkout.session.expired",
            paymentStatus: "unpaid"
        };

        const { client, dependencies } = createStageDependencies({
            event: expiredEvent
        });

        const result = await stageVerifiedStripeEvent(
            expiredEvent,
            dependencies
        );

        expect(result.bookingStatus).toBe("expired");

        expect(dependencies.changePaymentStatus).toHaveBeenCalledWith(
            {
                paymentId: PAYMENT_ID,
                expectedStatus: "pending_payment",
                status: "expired"
            },
            client
        );

        expect(dependencies.queueBookingSync).toHaveBeenCalledWith(
            PAYMENT_ID,
            "expired",
            client
        );
    });

    test("rejects conflicting webhook event records", async () => {
        const { dependencies } = createStageDependencies();

        dependencies.findEvent.mockResolvedValue({
            eventId: EVENT.eventId,
            eventType: "checkout.session.expired",
            paymentId: PAYMENT_ID,
            processingStatus: "received"
        });

        await expect(
            stageVerifiedStripeEvent(EVENT, dependencies)
        ).rejects.toMatchObject({
            status: 422,
            code: "WEBHOOK_EVENT_CONFLICT"
        });

        expect(dependencies.changePaymentStatus).not.toHaveBeenCalled();

        expect(dependencies.queueBookingSync).not.toHaveBeenCalled();
    });
});

describe("Stripe webhook orchestration", () => {
    const RAW_BODY = Buffer.from('{"id":"evt_test_123"}');

    function jsonResponse(data, status = 200) {
        return new Response(JSON.stringify(data), {
            status,
            headers: {
                "Content-Type": "application/json"
            }
        });
    }

    function createOrchestrationDependencies() {
        const request = jest.fn(async url => {
            if (
                url.pathname ===
                "/internal/stripe/webhooks/verify"
            ) {
                return jsonResponse(EVENT);
            }

            throw new Error("Unexpected HTTP request.");
        });

        const stage = jest.fn(async () => ({
            alreadyProcessed: false,
            needsBookingUpdate: true,
            paymentId: PAYMENT_ID,
            bookingId: 123,
            checkoutAttemptId: CHECKOUT_ID,
            bookingStatus: "paid"
        }));

        const synchronizeBooking = jest.fn(async () => ({
            bookingId: 123,
            status: "paid"
        }));

        const markBookingSync = jest.fn(async () => true);

        const markProcessed = jest.fn(async () => true);

        const markFailed = jest.fn(async () => true);

        return {
            request,
            stage,
            synchronizeBooking,
            markBookingSync,
            markProcessed,
            markFailed,
            options: {
                request,
                paymentUrl: "http://payment:3004",
                bookingUrl: "http://booking:3002",
                stage,
                synchronizeBooking,
                markBookingSync,
                markProcessed,
                markFailed
            }
        };
    }

    test("verifies the webhook, synchronizes booking and marks it processed", async () => {
        const dependencies = createOrchestrationDependencies();

        const result = await handleStripeWebhook(
            RAW_BODY,
            "test-signature",
            dependencies.options
        );

        expect(result).toEqual({
            received: true,
            duplicate: false
        });

        expect(dependencies.request).toHaveBeenCalledTimes(1);

        const verificationCall = dependencies.request.mock.calls[0];

        expect(verificationCall[0].pathname).toBe(
            "/internal/stripe/webhooks/verify"
        );

        expect(verificationCall[1].body).toBe(RAW_BODY);

        expect(verificationCall[1].headers["Stripe-Signature"]).toBe(
            "test-signature"
        );

        expect(dependencies.stage).toHaveBeenCalledWith(EVENT);

        expect(dependencies.synchronizeBooking).toHaveBeenCalledWith(
            {
                bookingId: 123,
                checkoutAttemptId: CHECKOUT_ID,
                status: "paid"
            },
            {
                request: dependencies.request,
                bookingUrl: "http://booking:3002"
            }
        );

        expect(dependencies.markBookingSync).toHaveBeenCalledWith(
            PAYMENT_ID,
            "paid"
        );

        expect(dependencies.markProcessed).toHaveBeenCalledWith(
            EVENT.eventId
        );

        expect(dependencies.markFailed).not.toHaveBeenCalled();
    });

    test("does not synchronize already processed webhook events", async () => {
        const dependencies = createOrchestrationDependencies();

        dependencies.stage.mockResolvedValue({
            alreadyProcessed: true,
            needsBookingUpdate: false
        });

        const result = await handleStripeWebhook(
            RAW_BODY,
            "test-signature",
            dependencies.options
        );

        expect(result).toEqual({
            received: true,
            duplicate: true
        });

        expect(dependencies.synchronizeBooking).not.toHaveBeenCalled();

        expect(dependencies.markBookingSync).not.toHaveBeenCalled();

        expect(dependencies.markProcessed).not.toHaveBeenCalled();
    });

    test("records booking synchronization failures for later retry", async () => {
        const dependencies = createOrchestrationDependencies();

        dependencies.synchronizeBooking.mockRejectedValue(
            new Error("Booking service unavailable.")
        );

        await expect(
            handleStripeWebhook(
                RAW_BODY,
                "test-signature",
                dependencies.options
            )
        ).rejects.toMatchObject({
            status: 503,
            code: "BOOKING_SYNCHRONIZATION_FAILED"
        });

        expect(dependencies.markFailed).toHaveBeenCalledWith(
            EVENT.eventId,
            "Booking service unavailable."
        );

        expect(dependencies.markBookingSync).not.toHaveBeenCalled();

        expect(dependencies.markProcessed).not.toHaveBeenCalled();
    });

    test("does not finalize the webhook if booking synchronization state changed", async () => {
        const dependencies = createOrchestrationDependencies();

        dependencies.markBookingSync.mockResolvedValue(false);

        await expect(
            handleStripeWebhook(
                RAW_BODY,
                "test-signature",
                dependencies.options
            )
        ).rejects.toMatchObject({
            status: 503,
            code: "BOOKING_SYNCHRONIZATION_FAILED"
        });

        expect(dependencies.synchronizeBooking).toHaveBeenCalledTimes(1);

        expect(dependencies.markFailed).toHaveBeenCalledWith(
            EVENT.eventId,
            expect.any(String)
        );

        expect(dependencies.markProcessed).not.toHaveBeenCalled();
    });

    test("rejects invalid Stripe webhook signatures", async () => {
        const dependencies = createOrchestrationDependencies();

        dependencies.request.mockResolvedValue(
            jsonResponse({
                error: {
                    code: "INVALID_STRIPE_SIGNATURE"
                }
            }, 400)
        );

        await expect(
            handleStripeWebhook(
                RAW_BODY,
                "invalid-signature",
                dependencies.options
            )
        ).rejects.toMatchObject({
            status: 400,
            code: "INVALID_STRIPE_WEBHOOK"
        });

        expect(dependencies.stage).not.toHaveBeenCalled();

        expect(dependencies.synchronizeBooking).not.toHaveBeenCalled();
    });
});