import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

import {
    createPaymentRouter
} from "../../routes/paymentRoutes.js";

import {
    PaymentStatusError
} from "../../services/paymentStatusService.js";

function createTestApp(statusLookup) {
    const app = express();

    app.use(express.json());

    app.use(createPaymentRouter({
        checkout: jest.fn(),
        statusLookup
    }));

    return app;
}

describe("Payment status API", () => {
    test("returns the current payment status", async () => {
        const payment = {
            bookingId: 123,
            paymentId: "8f3b3e0b-8a1d-4b82-9fd6-2ef79a809a50",
            stripeSessionId: "cs_test_123",
            status: "paid",
            paymentExpiresAt: "2026-11-26T10:10:00.000Z",
            paidAt: "2026-11-26T10:04:00.000Z"
        };

        const statusLookup = jest.fn(async () => payment);

        const response = await request(
            createTestApp(statusLookup)
        )
            .get(
                "/api/payments/checkout-sessions/cs_test_123/status"
            )
            .expect(200);

        expect(response.body).toEqual(payment);

        expect(statusLookup).toHaveBeenCalledWith(
            "cs_test_123"
        );
    });

    test("returns 404 for unknown sessions", async () => {
        const statusLookup = jest.fn(async () => {
            throw new PaymentStatusError(
                404,
                "PAYMENT_NOT_FOUND",
                "The payment was not found."
            );
        });

        const response = await request(
            createTestApp(statusLookup)
        )
            .get(
                "/api/payments/checkout-sessions/cs_test_unknown/status"
            )
            .expect(404);

        expect(response.body.error.code)
            .toBe("PAYMENT_NOT_FOUND");
    });
});