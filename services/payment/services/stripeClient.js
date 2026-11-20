import Stripe from 'stripe';

export function createStripeClient(secretKey) {
    if (typeof secretKey !== 'string' || !secretKey.startsWith('sk_test_')) {
        throw new Error('STRIPE_SECRET_KEY must be a Stripe test-mode secret key.');
    }

    return new Stripe(secretKey);
}