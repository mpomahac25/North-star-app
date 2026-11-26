import express from 'express';
import request from 'supertest';
import { createBookingRouter } from '../../routes/bookingRoutes.js';
import { createBookingStore } from '../../services/bookingStore.js';

const INITIAL_TIME = Date.parse('2026-11-20T12:00:00Z');

function setup() {
    let currentTime = INITIAL_TIME;

    const store = createBookingStore({
        now: () => currentTime
    });

    const app = express();
    app.use(express.json());
    app.use(createBookingRouter({ store }));

    return {
        app,
        advanceTime: milliseconds => {
            currentTime += milliseconds;
        }
    };
}

async function createBooking(app, seats = [{ row: 3, number: 5 }]) {
    return request(app)
        .post('/internal/bookings')
        .send({
            screeningId: 7,
            email: 'guest@example.com',
            seats
        });
}

describe('Booking checkout preparation', () => {
    test('creates a booking with a 15-minute selection hold', async () => {
        const { app } = setup();

        const response = await createBooking(app, [
            { row: 3, number: 5 },
            { row: 3, number: 6 }
        ]).expect(201);

        expect(response.body).toMatchObject({
            bookingId: 1,
            screeningId: 7,
            amountCents: 2500,
            currency: 'eur',
            status: 'held',
            selectionExpiresAt: '2026-11-20T12:15:00.000Z'
        });
    });

    test('starts a new 10-minute payment window', async () => {
        const { app } = setup();

        const booking = await createBooking(app).expect(201);

        const response = await request(app)
            .post(`/internal/bookings/${booking.body.bookingId}/checkout/prepare`)
            .send({})
            .expect(200);

        expect(response.body).toMatchObject({
            bookingId: 1,
            amountCents: 1250,
            currency: 'eur',
            paymentExpiresAt: '2026-11-20T12:10:00.000Z'
        });

        expect(response.body.checkoutAttemptId).toEqual(
            expect.any(String)
        );
    });

    test('repeated preparation does not extend the payment deadline', async () => {
        const { app, advanceTime } = setup();

        const booking = await createBooking(app).expect(201);
        const url = `/internal/bookings/${booking.body.bookingId}/checkout/prepare`;

        const first = await request(app).post(url).send({}).expect(200);

        advanceTime(5 * 60 * 1000);

        const second = await request(app).post(url).send({}).expect(200);

        expect(second.body.checkoutAttemptId).toBe(
            first.body.checkoutAttemptId
        );

        expect(second.body.paymentExpiresAt).toBe(
            first.body.paymentExpiresAt
        );
    });

    test('rejects checkout after the selection hold expires', async () => {
        const { app, advanceTime } = setup();

        const booking = await createBooking(app).expect(201);

        advanceTime(15 * 60 * 1000);

        const response = await request(app)
            .post(`/internal/bookings/${booking.body.bookingId}/checkout/prepare`)
            .send({})
            .expect(409);

        expect(response.body.error.code).toBe('SELECTION_EXPIRED');
    });

    test('rejects conflicting seat selections', async () => {
        const { app } = setup();

        await createBooking(app).expect(201);

        const response = await createBooking(app).expect(409);

        expect(response.body.error.code).toBe('SEATS_UNAVAILABLE');
    });

    test('retains seat protection after an unresolved payment deadline', async () => {
        const { app, advanceTime } = setup();

        const booking = await createBooking(app).expect(201);

        await request(app)
            .post(`/internal/bookings/${booking.body.bookingId}/checkout/prepare`)
            .send({})
            .expect(200);

        advanceTime(10 * 60 * 1000);

        const retry = await request(app)
            .post(`/internal/bookings/${booking.body.bookingId}/checkout/prepare`)
            .send({})
            .expect(409);

        expect(retry.body.error.code).toBe('PAYMENT_WINDOW_EXPIRED');

        const conflict = await createBooking(app).expect(409);

        expect(conflict.body.error.code).toBe('SEATS_UNAVAILABLE');
    });

    test('rejects unknown bookings', async () => {
        const { app } = setup();

        const response = await request(app)
            .post('/internal/bookings/999/checkout/prepare')
            .send({})
            .expect(404);

        expect(response.body.error.code).toBe('BOOKING_NOT_FOUND');
    });
});