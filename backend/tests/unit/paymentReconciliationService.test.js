import { jest } from "@jest/globals";

import {
    reconcileDuePaymentAttempt,
    synchronizePendingBookingPayment,
    runPaymentReconciliationCycle
} from "../../services/paymentReconciliationService.js";

const PAYMENT_ID = "8f3b3e0b-8a1d-4b82-9fd6-2ef79a809a50";

const PAYMENT = {
    id: PAYMENT_ID,
    bookingId: 123,
    checkoutAttemptId:
        "b37ed126-fd9a-430c-b9e1-0c82fc3a976e",
    stripeSessionId: "cs_test_example",
    amountCents: 2500,
    currency: "eur",
    status: "pending_payment",
    expiresAt: new Date("2026-11-26T10:00:00Z")
};

function createStripeResult(overrides = {}) {
    return {
        stripeSessionId: PAYMENT.stripeSessionId,
        paymentId: PAYMENT.id,
        checkoutAttemptId: PAYMENT.checkoutAttemptId,
        bookingId: "123",
        amountCents: 2500,
        currency: "eur",
        sessionStatus: "expired",
        paymentStatus: "unpaid",
        stripePaymentIntentId: null,
        ...overrides
    };
}

function createReconciliationDependencies(
    payment = PAYMENT,
    result = createStripeResult()
) {
    const request = jest.fn(async () =>
        new Response(JSON.stringify(result), {
            status: 200,
            headers: {
                "Content-Type": "application/json"
            }
        })
    );

    return {
        request,
        now: () => Date.parse("2026-11-26T10:01:00Z"),
        transaction: jest.fn(async operation => operation({})),
        findPayment: jest.fn(async () => payment),
        changeStatus: jest.fn(async () => true),
        queueSync: jest.fn(async () => true)
    };
}

describe("Payment expiration reconciliation", () => {
    test("expires an unpaid Stripe Session", async () => {
        const dependencies = createReconciliationDependencies();

        const result = await reconcileDuePaymentAttempt(
            PAYMENT,
            dependencies
        );

        expect(result).toBe(true);

        expect(dependencies.changeStatus)
            .toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentId: PAYMENT_ID,
                    expectedStatus: "pending_payment",
                    status: "expired"
                }),
                expect.anything()
            );

        expect(dependencies.queueSync)
            .toHaveBeenCalledWith(
                PAYMENT_ID,
                "expired",
                expect.anything()
            );
    });

    test("preserves payments completed before reconciliation", async () => {
        const dependencies = createReconciliationDependencies(
            PAYMENT,
            createStripeResult({
                sessionStatus: "complete",
                paymentStatus: "paid",
                stripePaymentIntentId: "pi_test_example"
            })
        );

        const result = await reconcileDuePaymentAttempt(
            PAYMENT,
            dependencies
        );

        expect(result).toBe(true);

        expect(dependencies.changeStatus)
            .toHaveBeenCalledWith(
                expect.objectContaining({
                    status: "paid",
                    stripePaymentIntentId: "pi_test_example"
                }),
                expect.anything()
            );

        expect(dependencies.queueSync)
            .toHaveBeenCalledWith(
                PAYMENT_ID,
                "paid",
                expect.anything()
            );
    });

    test("rejects mismatched Stripe payment details", async () => {
        const dependencies = createReconciliationDependencies(
            PAYMENT,
            createStripeResult({
                amountCents: 9999
            })
        );

        await expect(
            reconcileDuePaymentAttempt(
                PAYMENT,
                dependencies
            )
        ).rejects.toThrow(
            "Stripe reconciliation details do not match"
        );

        expect(dependencies.changeStatus)
            .not.toHaveBeenCalled();
    });

    test("does not overwrite payments changed concurrently", async () => {
        const dependencies = createReconciliationDependencies();

        dependencies.findPayment.mockResolvedValue({
            ...PAYMENT,
            status: "paid"
        });

        const result = await reconcileDuePaymentAttempt(
            PAYMENT,
            dependencies
        );

        expect(result).toBe(false);

        expect(dependencies.changeStatus)
            .not.toHaveBeenCalled();
    });

    test("expires abandoned creating attempts", async () => {
        const creatingPayment = {
            ...PAYMENT,
            status: "creating",
            stripeSessionId: null
        };

        const dependencies = createReconciliationDependencies(
            creatingPayment
        );

        const result = await reconcileDuePaymentAttempt(
            creatingPayment,
            dependencies
        );

        expect(result).toBe(true);

        expect(dependencies.request)
            .not.toHaveBeenCalled();

        expect(dependencies.changeStatus)
            .toHaveBeenCalledWith(
                expect.objectContaining({
                    status: "expired"
                }),
                expect.anything()
            );

        expect(dependencies.queueSync)
            .toHaveBeenCalledWith(
                PAYMENT_ID,
                "expired",
                expect.anything()
            );
    });

    test("does not expire payments before their deadline", async () => {
        const dependencies = createReconciliationDependencies();

        dependencies.now = () =>
            Date.parse("2026-11-26T09:59:00Z");

        const result = await reconcileDuePaymentAttempt(
            PAYMENT,
            dependencies
        );

        expect(result).toBe(false);

        expect(dependencies.request)
            .not.toHaveBeenCalled();

        expect(dependencies.changeStatus)
            .not.toHaveBeenCalled();
    });
});

describe("Booking synchronization recovery", () => {
    const entry = {
        paymentId: PAYMENT_ID,
        bookingId: 123,
        checkoutAttemptId: PAYMENT.checkoutAttemptId,
        status: "paid"
    };

    test("marks successful booking synchronization", async () => {
        const synchronize = jest.fn(async () => ({
            bookingId: 123,
            status: "paid"
        }));

        const markSynced = jest.fn(async () => true);

        const result = await synchronizePendingBookingPayment(
            entry,
            {
                synchronize,
                markSynced,
                markFailed: jest.fn()
            }
        );

        expect(result).toBe(true);

        expect(synchronize).toHaveBeenCalledWith(entry);

        expect(markSynced).toHaveBeenCalledWith(
            PAYMENT_ID,
            "paid"
        );
    });

    test("records failed synchronization for retry", async () => {
        const markFailed = jest.fn(async () => true);

        await expect(
            synchronizePendingBookingPayment(entry, {
                synchronize: async () => {
                    throw new Error("Booking unavailable.");
                },
                markSynced: jest.fn(),
                markFailed
            })
        ).rejects.toThrow("Booking unavailable.");

        expect(markFailed).toHaveBeenCalledWith(
            PAYMENT_ID,
            "paid",
            "Booking unavailable."
        );
    });
});

describe("Reconciliation worker", () => {
    test("processes due payments and pending bookings", async () => {
        const reconcile = jest.fn(async () => true);
        const synchronize = jest.fn(async () => true);
        const finalizeEvents = jest.fn(async () => 1);

        const result = await runPaymentReconciliationCycle({
            listDue: async () => [PAYMENT],
            reconcile,
            listPending: async () => [{
                paymentId: PAYMENT_ID,
                bookingId: 123,
                checkoutAttemptId: PAYMENT.checkoutAttemptId,
                status: "expired"
            }],
            synchronize,
            finalizeEvents,
            logger: {
                error: jest.fn()
            }
        });

        expect(result).toEqual({
            paymentsExamined: 1,
            bookingUpdatesExamined: 1
        });

        expect(reconcile).toHaveBeenCalledTimes(1);
        expect(synchronize).toHaveBeenCalledTimes(1);
        expect(finalizeEvents).toHaveBeenCalledTimes(1);
    });
});