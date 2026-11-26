import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import app from "../../app.js";
import { createPaymentRouter } from "../../routes/paymentRoutes.js";
import { PaymentPreparationError } from "../../services/paymentService.js";

const SESSION = {
    bookingId: 123,
    paymentId: "8f3b3e0b-8a1d-4b82-9fd6-2ef79a809a50",
    stripeSessionId: "cs_test_example",
    checkoutUrl: "https://checkout.stripe.com/example",
    status: "pending_payment",
    paymentExpiresAt: "2026-11-26T12:10:00.000Z"
};

function createTestApp(checkout) {
    const testApp = express();

    testApp.use(express.json());
    testApp.use(createPaymentRouter({ checkout }));

    return testApp;
}

describe("Payment Checkout API", () => {
    test("creates a new Checkout Session", async () => {
        const checkout = jest.fn(async () => ({
            ...SESSION,
            reused: false
        }));

        const response = await request(createTestApp(checkout))
            .post("/api/payments/checkout-sessions")
            .send({ bookingId: 123 })
            .expect(201);

        expect(response.body).toEqual(SESSION);
        expect(checkout).toHaveBeenCalledTimes(1);
        expect(checkout).toHaveBeenCalledWith(123);
    });

    test("returns an existing Checkout Session", async () => {
        const checkout = jest.fn(async () => ({
            ...SESSION,
            reused: true
        }));

        const response = await request(createTestApp(checkout))
            .post("/api/payments/checkout-sessions")
            .send({ bookingId: 123 })
            .expect(200);

        expect(response.body).toEqual(SESSION);
        expect(checkout).toHaveBeenCalledTimes(1);
        expect(checkout).toHaveBeenCalledWith(123);
    });

    test.each([
        {},
        { bookingId: -1 },
        { bookingId: 0 },
        { bookingId: "123" },
        { bookingId: 2147483648 }
    ])("rejects an invalid booking ID (%p)", async (body) => {
        const checkout = jest.fn();

        const response = await request(createTestApp(checkout))
            .post("/api/payments/checkout-sessions")
            .send(body)
            .expect(400);

        expect(response.body.error.code).toBe("INVALID_BOOKING_ID");
        expect(checkout).not.toHaveBeenCalled();
    });

    test("preserves booking and payment conflicts", async () => {
        const checkout = jest.fn(async () => {
            throw new PaymentPreparationError(
                409,
                "PAYMENT_WINDOW_EXPIRED",
                "The payment window has expired."
            );
        });

        const response = await request(createTestApp(checkout))
            .post("/api/payments/checkout-sessions")
            .send({ bookingId: 123 })
            .expect(409);

        expect(response.body.error).toEqual({
            code: "PAYMENT_WINDOW_EXPIRED",
            message: "The payment window has expired."
        });
    });

    test("preserves payment service errors", async () => {
        const checkout = jest.fn(async () => {
            throw new PaymentPreparationError(
                502,
                "PAYMENT_SERVICE_UNAVAILABLE",
                "The payment service could not be reached."
            );
        });

        const response = await request(createTestApp(checkout))
            .post("/api/payments/checkout-sessions")
            .send({ bookingId: 123 })
            .expect(502);

        expect(response.body.error.code).toBe(
            "PAYMENT_SERVICE_UNAVAILABLE"
        );
    });

    test("does not expose unexpected internal errors", async () => {
        const checkout = jest.fn(async () => {
            throw new Error("Database connection failed: secret details");
        });

        const consoleSpy = jest.spyOn(console, "error")
            .mockImplementation(() => { });

        try {
            const response = await request(createTestApp(checkout))
                .post("/api/payments/checkout-sessions")
                .send({ bookingId: 123 })
                .expect(500);

            expect(response.body).toEqual({
                error: {
                    code: "CHECKOUT_CREATION_FAILED",
                    message: "Could not create the Checkout Session."
                }
            });

            expect(JSON.stringify(response.body)).not.toContain(
                "secret details"
            );
        } finally {
            consoleSpy.mockRestore();
        }
    });

    test("registers the route in the actual backend application", async () => {
        const response = await request(app)
            .post("/api/payments/checkout-sessions")
            .send({ bookingId: "invalid" })
            .expect(400);

        expect(response.body.error.code).toBe("INVALID_BOOKING_ID");
    });
});