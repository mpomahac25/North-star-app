import { jest } from "@jest/globals";

import {
    createStripeSessionLifecycleService
} from "../../services/stripeSessionLifecycleService.js";

const SESSION_ID = "cs_test_example";

function createSession(overrides = {}) {
    return {
        id: SESSION_ID,
        object: "checkout.session",
        livemode: false,
        mode: "payment",
        status: "open",
        payment_status: "unpaid",
        payment_intent: null,
        amount_total: 2500,
        currency: "eur",
        metadata: {
            bookingId: "123",
            paymentId: "8f3b3e0b-8a1d-4b82-9fd6-2ef79a809a50",
            checkoutAttemptId:
                "b37ed126-fd9a-430c-b9e1-0c82fc3a976e"
        },
        ...overrides
    };
}

function createTestService(initialSession = createSession()) {
    const stripe = {
        checkout: {
            sessions: {
                retrieve: jest.fn(async () => initialSession),
                expire: jest.fn(async () => createSession({
                    status: "expired"
                }))
            }
        }
    };

    return {
        stripe,
        service: createStripeSessionLifecycleService({
            stripe
        })
    };
}

describe("Stripe Checkout lifecycle", () => {
    test("expires an open Checkout Session", async () => {
        const { stripe, service } = createTestService();

        const result = await service.reconcileSession(
            SESSION_ID
        );

        expect(result.sessionStatus).toBe("expired");

        expect(stripe.checkout.sessions.expire)
            .toHaveBeenCalledWith(SESSION_ID);
    });

    test("does not expire completed payments", async () => {
        const { stripe, service } = createTestService(
            createSession({
                status: "complete",
                payment_status: "paid",
                payment_intent: "pi_test_example"
            })
        );

        const result = await service.reconcileSession(
            SESSION_ID
        );

        expect(result.sessionStatus).toBe("complete");
        expect(result.paymentStatus).toBe("paid");

        expect(stripe.checkout.sessions.expire)
            .not.toHaveBeenCalled();
    });

    test("handles Sessions already expired", async () => {
        const { stripe, service } = createTestService(
            createSession({
                status: "expired"
            })
        );

        const result = await service.reconcileSession(
            SESSION_ID
        );

        expect(result.sessionStatus).toBe("expired");

        expect(stripe.checkout.sessions.expire)
            .not.toHaveBeenCalled();
    });

    test("handles concurrent expiration", async () => {
        const { stripe, service } = createTestService();

        stripe.checkout.sessions.expire.mockRejectedValue(
            new Error("Session is no longer open.")
        );

        stripe.checkout.sessions.retrieve
            .mockResolvedValueOnce(createSession())
            .mockResolvedValueOnce(createSession({
                status: "expired"
            }));

        const result = await service.reconcileSession(
            SESSION_ID
        );

        expect(result.sessionStatus).toBe("expired");

        expect(stripe.checkout.sessions.retrieve)
            .toHaveBeenCalledTimes(2);
    });

    test("rejects invalid Session IDs", async () => {
        const { service } = createTestService();

        await expect(
            service.reconcileSession("invalid")
        ).rejects.toMatchObject({
            status: 400,
            code: "INVALID_SESSION_ID"
        });
    });

    test("rejects live-mode Sessions", async () => {
        const { stripe, service } = createTestService(
            createSession({
                livemode: true
            })
        );

        await expect(
            service.reconcileSession(SESSION_ID)
        ).rejects.toMatchObject({
            status: 502,
            code: "INVALID_STRIPE_SESSION"
        });

        expect(stripe.checkout.sessions.expire)
            .not.toHaveBeenCalled();
    });
});