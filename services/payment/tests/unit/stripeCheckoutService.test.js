import { jest } from '@jest/globals';
import { createStripeCheckoutService } from '../../services/stripeCheckoutService.js';

const NOW = Date.parse('2026-11-20T12:00:00Z');

const PAYMENT_DETAILS = {
    bookingId: 123,
    paymentId: '8f3b3e0b-8a1d-4b82-9fd6-2ef79a809a50',
    checkoutAttemptId: 'b37ed126-fd9a-430c-b9e1-0c82fc3a976e',
    email: 'guest@example.com',
    amountCents: 2500,
    currency: 'eur',
    paymentExpiresAt: '2026-11-20T12:10:00.000Z'
};

function setup() {
    const stripe = {
        checkout: {
            sessions: {
                create: jest.fn(async () => ({
                    id: 'cs_test_123',
                    url: 'https://checkout.stripe.com/example'
                }))
            }
        }
    };

    const service = createStripeCheckoutService({
        stripe,
        now: () => NOW,
        successUrl: 'http://localhost:3000/cart?session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: 'http://localhost:3000/cart?checkout=cancelled'
    });

    return { stripe, service };
}

describe('Stripe Checkout service', () => {
    test('creates a hosted card payment session', async () => {
        const { stripe, service } = setup();

        const result = await service.createCheckoutSession(PAYMENT_DETAILS);

        expect(result).toEqual({
            bookingId: 123,
            paymentId: PAYMENT_DETAILS.paymentId,
            checkoutAttemptId: PAYMENT_DETAILS.checkoutAttemptId,
            stripeSessionId: 'cs_test_123',
            checkoutUrl: 'https://checkout.stripe.com/example'
        });

        const [params, options] =
            stripe.checkout.sessions.create.mock.calls[0];

        expect(params.mode).toBe('payment');
        expect(params.payment_method_types).toEqual(['card']);
        expect(params.customer_email).toBe('guest@example.com');
        expect(params.client_reference_id).toBe('123');

        expect(params.line_items[0].price_data).toMatchObject({
            currency: 'eur',
            unit_amount: 2500
        });

        expect(params.metadata).toEqual({
            bookingId: '123',
            paymentId: PAYMENT_DETAILS.paymentId,
            checkoutAttemptId: PAYMENT_DETAILS.checkoutAttemptId
        });

        expect(options.idempotencyKey).toBe(
            `rio-payment-${PAYMENT_DETAILS.paymentId}`
        );

        expect(params.expires_at).toBeUndefined();
    });

    test('uses the same idempotency key on repeated requests', async () => {
        const { stripe, service } = setup();

        await service.createCheckoutSession(PAYMENT_DETAILS);
        await service.createCheckoutSession(PAYMENT_DETAILS);

        const calls = stripe.checkout.sessions.create.mock.calls;

        expect(calls).toHaveLength(2);
        expect(calls[0][0]).toEqual(calls[1][0]);
        expect(calls[0][1]).toEqual(calls[1][1]);
    });

    test.each([
        [{ bookingId: -1 }, 'INVALID_BOOKING_ID', 400],
        [{ paymentId: 'invalid' }, 'INVALID_PAYMENT_ID', 400],
        [{ checkoutAttemptId: 'invalid' }, 'INVALID_CHECKOUT_ATTEMPT_ID', 400],
        [{ email: 'invalid' }, 'INVALID_EMAIL', 400],
        [{ amountCents: -1 }, 'INVALID_AMOUNT', 400],
        [{ currency: 'usd' }, 'INVALID_CURRENCY', 400],
        [{
            paymentExpiresAt: '2026-11-20T12:00:00Z'
        }, 'PAYMENT_WINDOW_EXPIRED', 409],
        [{
            paymentExpiresAt: '2026-11-20T12:11:00Z'
        }, 'INVALID_PAYMENT_DEADLINE', 400]
    ])('rejects invalid payment details (%p)', async (changes, code, status) => {
        const { stripe, service } = setup();

        await expect(
            service.createCheckoutSession({
                ...PAYMENT_DETAILS,
                ...changes
            })
        ).rejects.toMatchObject({
            code,
            status
        });

        expect(stripe.checkout.sessions.create)
            .not.toHaveBeenCalled();
    });

    test('reports Stripe API failures', async () => {
        const { stripe, service } = setup();

        stripe.checkout.sessions.create.mockRejectedValue(
            new Error('Stripe unavailable')
        );

        await expect(
            service.createCheckoutSession(PAYMENT_DETAILS)
        ).rejects.toMatchObject({
            status: 502,
            code: 'STRIPE_CHECKOUT_FAILED'
        });
    });

    test('rejects incomplete Stripe responses', async () => {
        const { stripe, service } = setup();

        stripe.checkout.sessions.create.mockResolvedValue({
            id: 'cs_test_123',
            url: null
        });

        await expect(
            service.createCheckoutSession(PAYMENT_DETAILS)
        ).rejects.toMatchObject({
            status: 502,
            code: 'INVALID_STRIPE_RESPONSE'
        });
    });

    test('rejects missing redirect configuration', async () => {
        const { stripe } = setup();

        const service = createStripeCheckoutService({
            stripe,
            now: () => NOW,
            successUrl: undefined,
            cancelUrl: undefined
        });

        await expect(
            service.createCheckoutSession(PAYMENT_DETAILS)
        ).rejects.toMatchObject({
            status: 503,
            code: 'STRIPE_CONFIGURATION_ERROR'
        });
    });
});