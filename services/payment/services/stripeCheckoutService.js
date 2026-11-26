import { createStripeClient } from './stripeClient.js';

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAYMENT_WINDOW_MS = 10 * 60 * 1000;

export class StripeCheckoutError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function validateCheckoutDetails(details, currentTime) {
    if (
        !details ||
        typeof details !== 'object' ||
        Array.isArray(details)
    ) {
        throw new StripeCheckoutError(
            400, 'INVALID_CHECKOUT_REQUEST', 'Payment details are required.'
        );
    }

    const {
        bookingId,
        paymentId,
        checkoutAttemptId,
        email,
        amountCents,
        currency,
        paymentExpiresAt
    } = details;

    if (!Number.isSafeInteger(bookingId) ||
        bookingId < 1 ||
        bookingId > 2147483647) {
        throw new StripeCheckoutError(
            400, 'INVALID_BOOKING_ID', 'A valid booking ID is required.'
        );
    }

    if (typeof paymentId !== 'string' ||
        !UUID_PATTERN.test(paymentId)) {
        throw new StripeCheckoutError(
            400, 'INVALID_PAYMENT_ID', 'A valid payment UUID is required.'
        );
    }

    if (typeof checkoutAttemptId !== 'string' ||
        !UUID_PATTERN.test(checkoutAttemptId)) {
        throw new StripeCheckoutError(
            400, 'INVALID_CHECKOUT_ATTEMPT_ID',
            'A valid checkout attempt UUID is required.'
        );
    }

    if (typeof email !== 'string' ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new StripeCheckoutError(
            400, 'INVALID_EMAIL', 'A valid email address is required.'
        );
    }

    if (!Number.isSafeInteger(amountCents) ||
        amountCents < 50 ||
        amountCents > 99999999) {
        throw new StripeCheckoutError(
            400, 'INVALID_AMOUNT', 'The payment amount is invalid.'
        );
    }

    if (currency !== 'eur') {
        throw new StripeCheckoutError(
            400, 'INVALID_CURRENCY', 'The supported currency is eur.'
        );
    }

    const expiration = typeof paymentExpiresAt === 'string'
        ? Date.parse(paymentExpiresAt)
        : NaN;

    if (!Number.isFinite(expiration) ||
        !/(Z|[+-]\d{2}:\d{2})$/i.test(paymentExpiresAt)) {
        throw new StripeCheckoutError(
            400, 'INVALID_PAYMENT_DEADLINE',
            'A valid payment deadline with a timezone is required.'
        );
    }

    if (expiration <= currentTime) {
        throw new StripeCheckoutError(
            409, 'PAYMENT_WINDOW_EXPIRED',
            'The payment window has expired.'
        );
    }

    if (expiration > currentTime + PAYMENT_WINDOW_MS) {
        throw new StripeCheckoutError(
            400, 'INVALID_PAYMENT_DEADLINE',
            'The payment deadline cannot exceed 10 minutes.'
        );
    }

    return details;
}

function validateRedirectUrl(value, variableName) {
    try {
        const url = new URL(value);

        const isLocalDevelopment =
            url.protocol === 'http:' &&
            ['localhost', '127.0.0.1'].includes(url.hostname);

        if (
            (url.protocol !== 'https:' && !isLocalDevelopment) ||
            url.username ||
            url.password
        ) {
            throw new Error('Invalid redirect URL');
        }
    } catch {
        throw new StripeCheckoutError(
            503,
            'STRIPE_CONFIGURATION_ERROR',
            `${variableName} is missing or invalid.`
        );
    }
}

export function createStripeCheckoutService({
    stripe,
    now = () => Date.now(),
    successUrl = process.env.STRIPE_SUCCESS_URL,
    cancelUrl = process.env.STRIPE_CANCEL_URL
} = {}) {
    let stripeClient = stripe;

    return {
        async createCheckoutSession(input) {
            const details = validateCheckoutDetails(input, now());

            validateRedirectUrl(successUrl, 'STRIPE_SUCCESS_URL');
            validateRedirectUrl(cancelUrl, 'STRIPE_CANCEL_URL');

            if (!successUrl.includes('{CHECKOUT_SESSION_ID}')) {
                throw new StripeCheckoutError(
                    503,
                    'STRIPE_CONFIGURATION_ERROR',
                    'The success URL must include {CHECKOUT_SESSION_ID}.'
                );
            }

            if (!stripeClient) {
                try {
                    stripeClient = createStripeClient(
                        process.env.STRIPE_SECRET_KEY
                    );
                } catch {
                    throw new StripeCheckoutError(
                        503,
                        'STRIPE_CONFIGURATION_ERROR',
                        'Stripe test credentials are not configured.'
                    );
                }
            }

            const {
                bookingId,
                paymentId,
                checkoutAttemptId,
                email,
                amountCents,
                currency
            } = details;

            let session;

            try {
                session = await stripeClient.checkout.sessions.create({
                    mode: 'payment',
                    payment_method_types: ['card'],
                    customer_email: email,
                    client_reference_id: String(bookingId),
                    line_items: [
                        {
                            price_data: {
                                currency,
                                unit_amount: amountCents,
                                product_data: {
                                    name: `Rio Theaters booking ${bookingId}`
                                }
                            },
                            quantity: 1
                        }
                    ],
                    metadata: {
                        bookingId: String(bookingId),
                        paymentId,
                        checkoutAttemptId
                    },
                    success_url: successUrl,
                    cancel_url: cancelUrl
                }, {
                    idempotencyKey: `rio-payment-${paymentId}`
                });
            } catch {
                throw new StripeCheckoutError(
                    502,
                    'STRIPE_CHECKOUT_FAILED',
                    'Stripe could not create the Checkout Session.'
                );
            }

            if (
                typeof session?.id !== 'string' ||
                typeof session?.url !== 'string' ||
                !session.url.startsWith('https://')
            ) {
                throw new StripeCheckoutError(
                    502,
                    'INVALID_STRIPE_RESPONSE',
                    'Stripe returned incomplete Checkout Session details.'
                );
            }

            return {
                bookingId,
                paymentId,
                checkoutAttemptId,
                stripeSessionId: session.id,
                checkoutUrl: session.url
            };
        }
    };
}