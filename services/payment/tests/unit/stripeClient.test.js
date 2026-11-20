import { createStripeClient } from '../../services/stripeClient.js';

describe('Stripe client configuration', () => {
    test('creates a Stripe client using a test secret key', () => {
        const client = createStripeClient('sk_test_example');

        expect(client.checkout.sessions.create).toEqual(
            expect.any(Function)
        );
    });

    test.each([
        undefined,
        null,
        '',
        'sk_live_example',
        'pk_test_example'
    ])('rejects invalid or non-test credentials (%s)', (secretKey) => {
        expect(() => createStripeClient(secretKey)).toThrow(
            'STRIPE_SECRET_KEY must be a Stripe test-mode secret key.'
        );
    });
});