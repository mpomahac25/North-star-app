import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

import {
    createPaymentWebhookRouter
} from "../../routes/paymentWebhookRoutes.js";

import {
    PaymentWebhookError
} from "../../services/paymentWebhookService.js";

function createTestApp(handle) {
    const app = express();

    app.use(createPaymentWebhookRouter({ handle }));
    app.use(express.json());

    return app;
}

describe("Public Stripe webhook API", () => {
    test("preserves the raw request body", async () => {
        const payload = Buffer.from(
            '{"id":"evt_test_123","type":"checkout.session.completed"}'
        );

        const handle = jest.fn(async () => ({
            received: true,
            duplicate: false
        }));

        const response = await request(createTestApp(handle))
            .post("/api/payments/webhooks/stripe")
            .set("Content-Type", "application/json")
            .set("Stripe-Signature", "test-signature")
            .send(payload.toString("utf8"))
            .expect(200);

        expect(response.body.received).toBe(true);

        expect(handle).toHaveBeenCalledTimes(1);

        expect(Buffer.isBuffer(handle.mock.calls[0][0]))
            .toBe(true);

        expect(handle.mock.calls[0][0]).toEqual(payload);

        expect(handle.mock.calls[0][1])
            .toBe("test-signature");
    });

    test("rejects invalid webhook signatures", async () => {
        const handle = jest.fn(async () => {
            throw new PaymentWebhookError(
                400,
                "INVALID_STRIPE_WEBHOOK",
                "Stripe webhook verification failed."
            );
        });

        const response = await request(createTestApp(handle))
            .post("/api/payments/webhooks/stripe")
            .set("Content-Type", "application/json")
            .send('{"id":"evt_test_123"}')
            .expect(400);

        expect(response.body.error.code)
            .toBe("INVALID_STRIPE_WEBHOOK");
    });

    test("returns retryable errors when processing fails", async () => {
        const handle = jest.fn(async () => {
            throw new PaymentWebhookError(
                503,
                "BOOKING_SYNCHRONIZATION_FAILED",
                "Booking synchronization is incomplete."
            );
        });

        const response = await request(createTestApp(handle))
            .post("/api/payments/webhooks/stripe")
            .set("Content-Type", "application/json")
            .send('{"id":"evt_test_123"}')
            .expect(503);

        expect(response.body.error.code)
            .toBe("BOOKING_SYNCHRONIZATION_FAILED");
    });
});