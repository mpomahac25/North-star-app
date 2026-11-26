import { createStripeClient } from './stripeClient.js';

const SUPPORTED_EVENTS = new Set([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'checkout.session.expired'
]);

export class StripeWebhookError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

export function createStripeWebhookService({
    stripe,
    signingSecret = process.env.STRIPE_WEBHOOK_SECRET
} = {}) {
    let stripeClient = stripe;

    return {
        verifyEvent(rawBody, signature) {
            if (
                !Buffer.isBuffer(rawBody) ||
                rawBody.length === 0 ||
                typeof signature !== 'string' ||
                !signature
            ) {
                throw new StripeWebhookError(
                    400,
                    'INVALID_WEBHOOK_REQUEST',
                    'A raw webhook payload and Stripe signature are required.'
                );
            }

            if (
                typeof signingSecret !== 'string' ||
                !signingSecret.startsWith('whsec_')
            ) {
                throw new StripeWebhookError(
                    503,
                    'STRIPE_CONFIGURATION_ERROR',
                    'Stripe webhook verification is not configured.'
                );
            }

            if (!stripeClient) {
                try {
                    stripeClient = createStripeClient(
                        process.env.STRIPE_SECRET_KEY
                    );
                } catch {
                    throw new StripeWebhookError(
                        503,
                        'STRIPE_CONFIGURATION_ERROR',
                        'Stripe test credentials are not configured.'
                    );
                }
            }

            let event;

            try {
                event = stripeClient.webhooks.constructEvent(
                    rawBody,
                    signature,
                    signingSecret
                );
            } catch {
                throw new StripeWebhookError(
                    400,
                    'INVALID_STRIPE_SIGNATURE',
                    'Stripe webhook signature verification failed.'
                );
            }

            if (event.livemode !== false) {
                throw new StripeWebhookError(
                    400,
                    'UNEXPECTED_STRIPE_MODE',
                    'Only Stripe test-mode events are accepted.'
                );
            }

            if (!SUPPORTED_EVENTS.has(event.type)) {
                return {
                    eventId: event.id,
                    eventType: event.type,
                    ignored: true
                };
            }

            const session = event.data?.object;

            if (
                typeof event.id !== 'string' ||
                session?.object !== 'checkout.session' ||
                typeof session.id !== 'string' ||
                !session.id.startsWith('cs_')
            ) {
                throw new StripeWebhookError(
                    422,
                    'INVALID_STRIPE_EVENT',
                    'Stripe returned unexpected event data.'
                );
            }

            return {
                eventId: event.id,
                eventType: event.type,
                ignored: false,
                stripeSessionId: session.id,
                paymentStatus: session.payment_status,
                stripePaymentIntentId:
                    typeof session.payment_intent === 'string'
                        ? session.payment_intent
                        : session.payment_intent?.id ?? null,
                amountCents: session.amount_total,
                currency: session.currency,
                bookingId: session.metadata?.bookingId ?? null,
                paymentId: session.metadata?.paymentId ?? null,
                checkoutAttemptId:
                    session.metadata?.checkoutAttemptId ?? null
            };
        }
    };
}