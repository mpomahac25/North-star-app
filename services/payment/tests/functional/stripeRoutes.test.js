import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import app from '../../app.js';
import { createStripeRouter } from '../../routes/stripeRoutes.js';
import { StripeCheckoutError } from '../../services/stripeCheckoutService.js';

function createTestApp(createCheckoutSession) {
    const testApp = express();

    testApp.use(express.json());
    testApp.use(createStripeRouter({
        service: { createCheckoutSession }
    }));

    return testApp;
}

describe('Stripe Checkout API', () => {
    test('returns Checkout Session details', async () => {
        const result = {
            bookingId: 123,
            paymentId: '8f3b3e0b-8a1d-4b82-9fd6-2ef79a809a50',
            checkoutAttemptId: 'b37ed126-fd9a-430c-b9e1-0c82fc3a976e',
            stripeSessionId: 'cs_test_123',
            checkoutUrl: 'https://checkout.stripe.com/example'
        };

        const createCheckoutSession = jest.fn(async () => result);

        const response = await request(
            createTestApp(createCheckoutSession)
        )
            .post('/internal/stripe/checkout')
            .send({ bookingId: 123 })
            .expect(201);

        expect(response.body).toEqual(result);

        expect(createCheckoutSession).toHaveBeenCalledWith({
            bookingId: 123
        });
    });

    test('returns validation errors', async () => {
        const response = await request(
            createTestApp(async () => {
                throw new StripeCheckoutError(
                    400,
                    'INVALID_AMOUNT',
                    'The payment amount is invalid.'
                );
            })
        )
            .post('/internal/stripe/checkout')
            .send({ amountCents: -1 })
            .expect(400);

        expect(response.body.error.code).toBe('INVALID_AMOUNT');
    });

    test('the existing application registers the route', async () => {
        const response = await request(app)
            .post('/internal/stripe/checkout')
            .send({})
            .expect(400);

        expect(response.body.error.code).toBe('INVALID_BOOKING_ID');
    });

    test('preserves the existing health endpoints', async () => {
        await request(app).get('/api/live').expect(200, {
            status: 'alive',
            service: 'payment'
        });

        await request(app).get('/api/health').expect(200, {
            status: 'ok',
            service: 'payment'
        });
    });
});