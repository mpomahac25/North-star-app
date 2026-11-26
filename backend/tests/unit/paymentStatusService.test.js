import { jest } from "@jest/globals";

import {
    getCheckoutSessionStatus
} from "../../services/paymentStatusService.js";

const SESSION_ID = "cs_test_123";

describe("Payment status service", () => {
    test("returns confirmed payment status", async () => {
        const findPayment = jest.fn(async () => ({
            id: "8f3b3e0b-8a1d-4b82-9fd6-2ef79a809a50",
            bookingId: 123,
            stripeSessionId: SESSION_ID,
            status: "paid",
            expiresAt: new Date("2026-11-26T10:10:00Z"),
            completedAt: new Date("2026-11-26T10:04:00Z")
        }));

        const result = await getCheckoutSessionStatus(
            SESSION_ID,
            { findPayment }
        );

        expect(result).toMatchObject({
            bookingId: 123,
            stripeSessionId: SESSION_ID,
            status: "paid",
            paidAt: "2026-11-26T10:04:00.000Z"
        });

        expect(findPayment).toHaveBeenCalledWith(
            SESSION_ID
        );
    });

    test("does not report a completion time while pending", async () => {
        const result = await getCheckoutSessionStatus(
            SESSION_ID,
            {
                findPayment: async () => ({
                    id: "8f3b3e0b-8a1d-4b82-9fd6-2ef79a809a50",
                    bookingId: 123,
                    stripeSessionId: SESSION_ID,
                    status: "pending_payment",
                    expiresAt: new Date("2026-11-26T10:10:00Z"),
                    completedAt: null
                })
            }
        );

        expect(result.status).toBe("pending_payment");
        expect(result.paidAt).toBeNull();
    });

    test("rejects unknown Checkout Sessions", async () => {
        await expect(
            getCheckoutSessionStatus(
                SESSION_ID,
                {
                    findPayment: async () => null
                }
            )
        ).rejects.toMatchObject({
            status: 404,
            code: "PAYMENT_NOT_FOUND"
        });
    });

    test("rejects malformed Checkout Session IDs", async () => {
        const findPayment = jest.fn();

        await expect(
            getCheckoutSessionStatus(
                "invalid",
                { findPayment }
            )
        ).rejects.toMatchObject({
            status: 400,
            code: "INVALID_SESSION_ID"
        });

        expect(findPayment).not.toHaveBeenCalled();
    });
});