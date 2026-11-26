import Stripe from 'stripe';
import express from 'express';
import request from 'supertest';

import { createStripeWebhookRouter } from '../../routes/stripeWebhookRoutes.js';
import { createStripeWebhookService } from '../../services/stripeWebhookService.js';

const STRIPE_SECRET = 'whsec_test_secret';

const stripe = new Stripe('sk_test_example');

function createTestApp(signingSecret = STRIPE_SECRET) {
    const app = express();

    const service = createStripeWebhookService({
        stripe,
        signingSecret
    });

    app.use(createStripeWebhookRouter({ service }));
    app.use(express.json());

    return app;
}

function createEvent(type = 'checkout.session.completed') {
    return {
        id: 'evt_test_123',
        object: 'event',
        type,
        livemode: false,
        data: {
            object: {
                id: 'cs_test_123',
                object: 'checkout.session',
                payment_status: 'paid',
                payment_intent: 'pi_test_123',
                amount_total: 2500,
                currency: 'eur',
                metadata: {
                    bookingId: '123',
                    paymentId: '8f3b3e0b-8a1d-4b82-9fd6-2ef79a809a50',
                    checkoutAttemptId:
                        'b37ed126-fd9a-430c-b9e1-0c82fc3a976e'
                }
            }
        }
    };
}

function signPayload(payload) {
    return stripe.webhooks.generateTestHeaderString({
        payload,
        secret: STRIPE_SECRET
    });
}

describe('Stripe webhook verification API', () => {
    test('accepts a correctly signed Checkout event', async () => {
        const app = createTestApp();

        const payload = JSON.stringify(createEvent());
        const signature = signPayload(payload);

        const response = await request(app)
            .post('/internal/stripe/webhooks/verify')
            .set('Content-Type', 'application/json')
            .set('Stripe-Signature', signature)
            .send(payload)
            .expect(200);

        expect(response.body).toEqual({
            eventId: 'evt_test_123',
            eventType: 'checkout.session.completed',
            ignored: false,
            stripeSessionId: 'cs_test_123',
            paymentStatus: 'paid',
            stripePaymentIntentId: 'pi_test_123',
            amountCents: 2500,
            currency: 'eur',
            bookingId: '123',
            paymentId: '8f3b3e0b-8a1d-4b82-9fd6-2ef79a809a50',
            checkoutAttemptId:
                'b37ed126-fd9a-430c-b9e1-0c82fc3a976e'
        });
    });

    test('rejects modified webhook payloads', async () => {
        const app = createTestApp();

        const originalPayload = JSON.stringify(createEvent());
        const signature = signPayload(originalPayload);

        const modifiedPayload = JSON.stringify({
            ...createEvent(),
            id: 'evt_modified'
        });

        const response = await request(app)
            .post('/internal/stripe/webhooks/verify')
            .set('Content-Type', 'application/json')
            .set('Stripe-Signature', signature)
            .send(modifiedPayload)
            .expect(400);

        expect(response.body.error.code).toBe(
            'INVALID_STRIPE_SIGNATURE'
        );
    });

    test('rejects requests without a signature', async () => {
        const app = createTestApp();

        const response = await request(app)
            .post('/internal/stripe/webhooks/verify')
            .set('Content-Type', 'application/json')
            .send(JSON.stringify(createEvent()))
            .expect(400);

        expect(response.body.error.code).toBe(
            'INVALID_WEBHOOK_REQUEST'
        );
    });

    test('ignores unsupported Stripe events', async () => {
        const app = createTestApp();

        const payload = JSON.stringify(
            createEvent('customer.created')
        );

        const response = await request(app)
            .post('/internal/stripe/webhooks/verify')
            .set('Content-Type', 'application/json')
            .set('Stripe-Signature', signPayload(payload))
            .send(payload)
            .expect(200);

        expect(response.body).toEqual({
            eventId: 'evt_test_123',
            eventType: 'customer.created',
            ignored: true
        });
    });

    test('rejects missing webhook configuration', async () => {
        const app = createTestApp('');

        const payload = JSON.stringify(createEvent());

        const response = await request(app)
            .post('/internal/stripe/webhooks/verify')
            .set('Content-Type', 'application/json')
            .set('Stripe-Signature', signPayload(payload))
            .send(payload)
            .expect(503);

        expect(response.body.error.code).toBe(
            'STRIPE_CONFIGURATION_ERROR'
        );
    });

    test('rejects live-mode Stripe events', async () => {
        const app = createTestApp();

        const payload = JSON.stringify({
            ...createEvent(),
            livemode: true
        });

        const response = await request(app)
            .post('/internal/stripe/webhooks/verify')
            .set('Content-Type', 'application/json')
            .set('Stripe-Signature', signPayload(payload))
            .send(payload)
            .expect(400);

        expect(response.body.error.code).toBe(
            'UNEXPECTED_STRIPE_MODE'
        );
    });
});