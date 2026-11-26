import express from "express";
import request from "supertest";

import {
    createBookingStore
} from "../../services/bookingStore.js";

import {
    createBookingRouter
} from "../../routes/bookingRoutes.js";

function setup() {
    const store = createBookingStore({
        now: () => Date.parse("2026-11-26T10:00:00Z")
    });

    const booking = store.createBooking({
        screeningId: 7,
        email: "guest@example.com",
        seats: [
            { row: 3, number: 5 }
        ]
    });

    const checkout = store.prepareCheckout(
        booking.bookingId
    );

    const app = express();

    app.use(express.json());

    app.use(createBookingRouter({ store }));

    const endpoint =
        `/internal/bookings/${booking.bookingId}/payment-result`;

    return {
        app,
        booking,
        checkout,
        endpoint
    };
}

describe("Internal booking payment-result API", () => {
    test("confirms a successful payment", async () => {
        const { app, booking, checkout, endpoint } = setup();

        const response = await request(app)
            .post(endpoint)
            .send({
                checkoutAttemptId: checkout.checkoutAttemptId,
                status: "paid"
            })
            .expect(200);

        expect(response.body).toEqual({
            bookingId: booking.bookingId,
            status: "paid"
        });
    });

    test("handles repeated payment confirmation", async () => {
        const { app, checkout, endpoint } = setup();

        const payload = {
            checkoutAttemptId: checkout.checkoutAttemptId,
            status: "paid"
        };

        const first = await request(app)
            .post(endpoint)
            .send(payload)
            .expect(200);

        const second = await request(app)
            .post(endpoint)
            .send(payload)
            .expect(200);

        expect(second.body).toEqual(first.body);
    });

    test("rejects invalid booking identifiers", async () => {
        const { app, checkout } = setup();

        const response = await request(app)
            .post("/internal/bookings/invalid/payment-result")
            .send({
                checkoutAttemptId: checkout.checkoutAttemptId,
                status: "paid"
            })
            .expect(400);

        expect(response.body.error.code).toBe(
            "INVALID_BOOKING_ID"
        );
    });

    test("rejects unknown bookings", async () => {
        const { app, checkout } = setup();

        const response = await request(app)
            .post("/internal/bookings/999/payment-result")
            .send({
                checkoutAttemptId: checkout.checkoutAttemptId,
                status: "paid"
            })
            .expect(404);

        expect(response.body.error.code).toBe(
            "BOOKING_NOT_FOUND"
        );
    });

    test("rejects mismatched checkout attempts", async () => {
        const { app, endpoint } = setup();

        const response = await request(app)
            .post(endpoint)
            .send({
                checkoutAttemptId: "incorrect-attempt",
                status: "paid"
            })
            .expect(409);

        expect(response.body.error.code).toBe(
            "CHECKOUT_ATTEMPT_MISMATCH"
        );
    });

    test("rejects invalid payment statuses", async () => {
        const { app, checkout, endpoint } = setup();

        const response = await request(app)
            .post(endpoint)
            .send({
                checkoutAttemptId: checkout.checkoutAttemptId,
                status: "refunded"
            })
            .expect(400);

        expect(response.body.error.code).toBe(
            "INVALID_PAYMENT_STATUS"
        );
    });

    test("does not expire an already paid booking", async () => {
        const { app, checkout, endpoint } = setup();

        await request(app)
            .post(endpoint)
            .send({
                checkoutAttemptId: checkout.checkoutAttemptId,
                status: "paid"
            })
            .expect(200);

        const response = await request(app)
            .post(endpoint)
            .send({
                checkoutAttemptId: checkout.checkoutAttemptId,
                status: "expired"
            })
            .expect(409);

        expect(response.body.error.code).toBe(
            "INVALID_BOOKING_TRANSITION"
        );
    });

    test("does not change the booking after invalid input", async () => {
        const { app, checkout, endpoint } = setup();

        await request(app)
            .post(endpoint)
            .send({
                checkoutAttemptId: "incorrect-attempt",
                status: "paid"
            })
            .expect(409);

        const response = await request(app)
            .post(endpoint)
            .send({
                checkoutAttemptId: checkout.checkoutAttemptId,
                status: "paid"
            })
            .expect(200);

        expect(response.body.status).toBe("paid");
    });
});