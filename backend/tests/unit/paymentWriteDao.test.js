import { jest } from "@jest/globals";
import {
    createPaymentAttempt,
    storeCheckoutSession,
    updatePaymentStatus
} from "../../dao/payment/paymentWriteDao.js";

const PAYMENT_ID = "8f3b3e0b-8a1d-4b82-9fd6-2ef79a809a50";
const CHECKOUT_ID = "b37ed126-fd9a-430c-b9e1-0c82fc3a976e";

function createDatabase(rows = [], rowCount = rows.length) {
    return {
        query: jest.fn(async () => ({
            rows,
            rowCount
        }))
    };
}

describe("Payment Write DAO", () => {
    test("creates a new payment attempt", async () => {
        const database = createDatabase([{ id: PAYMENT_ID }]);

        const result = await createPaymentAttempt({
            bookingId: 123,
            checkoutAttemptId: CHECKOUT_ID,
            amountCents: 2500,
            currency: "eur",
            expiresAt: "2026-11-20T14:30:00Z"
        }, database);

        expect(result).toBe(PAYMENT_ID);

        const [sql, values] = database.query.mock.calls[0];

        expect(sql).toContain("INSERT INTO payment_attempts");
        expect(sql).toContain("RETURNING id");

        expect(values).toEqual([
            expect.any(String),
            123,
            CHECKOUT_ID,
            2500,
            "eur",
            "2026-11-20T14:30:00Z"
        ]);
    });

    test("preserves database constraint violations", async () => {
        const database = {
            query: jest.fn(async () => {
                const error = new Error("Unique constraint violation");
                error.code = "23505";
                throw error;
            })
        };

        await expect(createPaymentAttempt({
            bookingId: 123,
            checkoutAttemptId: CHECKOUT_ID,
            amountCents: 2500,
            currency: "eur",
            expiresAt: "2026-11-20T14:30:00Z"
        }, database)).rejects.toMatchObject({
            code: "23505"
        });
    });

    test("stores a Stripe Checkout Session", async () => {
        const database = createDatabase([{ id: PAYMENT_ID }]);

        const result = await storeCheckoutSession(
            PAYMENT_ID,
            "cs_test_123",
            "https://checkout.stripe.com/example",
            database
        );

        expect(result).toBe(true);

        const [sql, values] = database.query.mock.calls[0];

        expect(sql).toContain("status = 'pending_payment'");
        expect(sql).toContain("status = 'creating'");
        expect(sql).toContain("stripe_session_id IS NULL");

        expect(values).toEqual([
            PAYMENT_ID,
            "cs_test_123",
            "https://checkout.stripe.com/example"
        ]);
    });

    test("does not overwrite a payment in an unexpected state", async () => {
        const database = createDatabase([], 0);

        const result = await storeCheckoutSession(
            PAYMENT_ID,
            "cs_test_456",
            "https://checkout.stripe.com/another",
            database
        );

        expect(result).toBe(false);
    });

    test("updates a payment status conditionally", async () => {
        const database = createDatabase([{ id: PAYMENT_ID }]);

        const result = await updatePaymentStatus({
            paymentId: PAYMENT_ID,
            expectedStatus: "pending_payment",
            status: "paid",
            stripePaymentIntentId: "pi_test_123"
        }, database);

        expect(result).toBe(true);

        const [sql, values] = database.query.mock.calls[0];

        expect(sql).toContain("status = $2");
        expect(sql).toContain("completed_at");

        expect(values).toEqual([
            PAYMENT_ID,
            "pending_payment",
            "paid",
            "pi_test_123"
        ]);
    });

    test("rejects stale payment state transitions", async () => {
        const database = createDatabase([], 0);

        const result = await updatePaymentStatus({
            paymentId: PAYMENT_ID,
            expectedStatus: "pending_payment",
            status: "expired"
        }, database);

        expect(result).toBe(false);
    });

    test("preserves the existing PaymentIntent when none is provided", async () => {
        const database = createDatabase([{ id: PAYMENT_ID }]);

        await updatePaymentStatus({
            paymentId: PAYMENT_ID,
            expectedStatus: "pending_payment",
            status: "expired"
        }, database);

        const [, values] = database.query.mock.calls[0];

        expect(values[3]).toBeNull();

        const [sql] = database.query.mock.calls[0];

        expect(sql).toContain("COALESCE");
    });
});