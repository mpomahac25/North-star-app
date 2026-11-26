import {
    findPaymentById,
    listPaymentsByBookingId
} from '../dao/payment/paymentReadDao.js';

import {
    createPaymentAttempt,
    storeCheckoutSession
} from '../dao/payment/paymentWriteDao.js';

export class PaymentPreparationError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTIVE_PAYMENT_STATUSES = new Set([
    'creating',
    'pending_payment'
]);

export async function prepareBookingForPayment(
    bookingId,
    {
        bookingUrl = process.env.BOOKING_URL || 'http://localhost:3002',
        request = fetch
    } = {}
) {
    if (
        !Number.isSafeInteger(bookingId) ||
        bookingId < 1 ||
        bookingId > 2147483647
    ) {
        throw new PaymentPreparationError(
            400, 'INVALID_BOOKING_ID', 'A valid booking ID is required.'
        );
    }

    const url = new URL(
        `/internal/bookings/${bookingId}/checkout/prepare`,
        bookingUrl
    );

    let response;

    try {
        response = await request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: '{}',
            signal: AbortSignal.timeout(5000)
        });
    } catch {
        throw new PaymentPreparationError(
            502,
            'BOOKING_SERVICE_UNAVAILABLE',
            'The booking service could not be reached.'
        );
    }

    let data;

    try {
        data = await response.json();
    } catch {
        throw new PaymentPreparationError(
            502,
            'INVALID_BOOKING_RESPONSE',
            'The booking service returned an invalid response.'
        );
    }

    if (!response.ok) {
        if (
            response.status >= 400 &&
            response.status < 500 &&
            typeof data?.error?.code === 'string'
        ) {
            throw new PaymentPreparationError(
                response.status,
                data.error.code,
                data.error.message || 'Booking preparation failed.'
            );
        }

        throw new PaymentPreparationError(
            502,
            'BOOKING_SERVICE_ERROR',
            'The booking service could not prepare payment.'
        );
    }

    if (
        data?.bookingId !== bookingId ||
        typeof data.checkoutAttemptId !== 'string' ||
        !UUID_PATTERN.test(data.checkoutAttemptId) ||
        typeof data.email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) ||
        !Number.isSafeInteger(data.amountCents) ||
        data.amountCents < 1 ||
        data.currency !== 'eur' ||
        typeof data.paymentExpiresAt !== 'string' ||
        !Number.isFinite(Date.parse(data.paymentExpiresAt)) ||
        !/(Z|[+-]\d{2}:\d{2})$/i.test(data.paymentExpiresAt)
    ) {
        throw new PaymentPreparationError(
            502,
            'INVALID_BOOKING_RESPONSE',
            'The booking service returned invalid payment details.'
        );
    }

    return {
        bookingId: data.bookingId,
        checkoutAttemptId: data.checkoutAttemptId,
        email: data.email,
        amountCents: data.amountCents,
        currency: data.currency,
        paymentExpiresAt: data.paymentExpiresAt
    };
}

async function findReusablePayment(details) {
    const attempts = await listPaymentsByBookingId(details.bookingId);

    if (attempts.some(attempt => attempt.status === 'paid')) {
        throw new PaymentPreparationError(
            409,
            'BOOKING_ALREADY_PAID',
            'The booking has already been paid.'
        );
    }

    const existing = attempts.find(
        attempt => attempt.checkoutAttemptId === details.checkoutAttemptId
    );

    if (existing) {
        if (
            existing.amountCents !== details.amountCents ||
            existing.currency !== details.currency ||
            new Date(existing.expiresAt).getTime() !==
            Date.parse(details.paymentExpiresAt)
        ) {
            throw new PaymentPreparationError(
                409,
                'PAYMENT_DETAILS_CHANGED',
                'The checkout attempt has different payment details.'
            );
        }

        if (!ACTIVE_PAYMENT_STATUSES.has(existing.status)) {
            throw new PaymentPreparationError(
                409,
                'PAYMENT_ATTEMPT_FINISHED',
                'The checkout attempt is no longer active.'
            );
        }

        return existing;
    }

    if (attempts.some(attempt =>
        ACTIVE_PAYMENT_STATUSES.has(attempt.status)
    )) {
        throw new PaymentPreparationError(
            409,
            'ACTIVE_PAYMENT_EXISTS',
            'The booking already has an active payment attempt.'
        );
    }

    return null;
}

export async function preparePaymentAttempt(bookingId, options = {}) {
    const details = await prepareBookingForPayment(bookingId, options);

    const currentTime = options.now?.() ?? Date.now();

    if (Date.parse(details.paymentExpiresAt) <= currentTime) {
        throw new PaymentPreparationError(
            409,
            'PAYMENT_WINDOW_EXPIRED',
            'The payment window has expired.'
        );
    }

    const existing = await findReusablePayment(details);

    if (existing) {
        return {
            ...details,
            paymentId: existing.id,
            status: existing.status,
            reused: true
        };
    }

    try {
        const paymentId = await createPaymentAttempt({
            bookingId: details.bookingId,
            checkoutAttemptId: details.checkoutAttemptId,
            amountCents: details.amountCents,
            currency: details.currency,
            expiresAt: details.paymentExpiresAt
        });

        return {
            ...details,
            paymentId,
            status: 'creating',
            reused: false
        };
    } catch (error) {
        if (error.code !== '23505') {
            throw error;
        }

        const concurrentAttempt = await findReusablePayment(details);

        if (concurrentAttempt) {
            return {
                ...details,
                paymentId: concurrentAttempt.id,
                status: concurrentAttempt.status,
                reused: true
            };
        }

        throw new PaymentPreparationError(
            409,
            'PAYMENT_CONFLICT',
            'A conflicting payment attempt already exists.'
        );
    }
}

export async function createCheckoutSessionForBooking(bookingId, options = {}) {
    const attempt = await preparePaymentAttempt(bookingId, options);
    const now = options.now ?? Date.now;

    function checkoutResult(sessionId, checkoutUrl, reused) {
        if (Date.parse(attempt.paymentExpiresAt) <= now()) {
            throw new PaymentPreparationError(
                409,
                'PAYMENT_WINDOW_EXPIRED',
                'The payment window has expired.'
            );
        }

        return {
            bookingId: attempt.bookingId,
            paymentId: attempt.paymentId,
            stripeSessionId: sessionId,
            checkoutUrl,
            status: 'pending_payment',
            paymentExpiresAt: attempt.paymentExpiresAt,
            reused
        };
    }

    function existingCheckoutResult(payment) {
        if (
            !payment ||
            payment.status !== 'pending_payment' ||
            payment.checkoutAttemptId !== attempt.checkoutAttemptId ||
            !payment.stripeSessionId ||
            !payment.stripeCheckoutUrl
        ) {
            throw new PaymentPreparationError(
                409,
                'PAYMENT_STATE_CHANGED',
                'The payment is no longer available for Checkout.'
            );
        }

        return checkoutResult(
            payment.stripeSessionId,
            payment.stripeCheckoutUrl,
            true
        );
    }

    if (attempt.status === 'pending_payment') {
        const payment = await findPaymentById(attempt.paymentId);
        return existingCheckoutResult(payment);
    }

    if (attempt.status !== 'creating') {
        throw new PaymentPreparationError(
            409,
            'PAYMENT_STATE_CHANGED',
            'The payment cannot proceed to Checkout.'
        );
    }

    const paymentUrl = options.paymentUrl ||
        process.env.PAYMENT_URL ||
        'http://localhost:3004';

    const request = options.request ?? fetch;

    const payload = {
        bookingId: attempt.bookingId,
        paymentId: attempt.paymentId,
        checkoutAttemptId: attempt.checkoutAttemptId,
        email: attempt.email,
        amountCents: attempt.amountCents,
        currency: attempt.currency,
        paymentExpiresAt: attempt.paymentExpiresAt
    };

    let response;

    try {
        response = await request(
            new URL('/internal/stripe/checkout', paymentUrl),
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(12000)
            }
        );
    } catch {
        throw new PaymentPreparationError(
            502,
            'PAYMENT_SERVICE_UNAVAILABLE',
            'The payment service could not be reached.'
        );
    }

    let session;

    try {
        session = await response.json();
    } catch {
        throw new PaymentPreparationError(
            502,
            'INVALID_PAYMENT_SERVICE_RESPONSE',
            'The payment service returned an invalid response.'
        );
    }

    if (!response.ok) {
        if (
            response.status === 409 &&
            session?.error?.code === 'PAYMENT_WINDOW_EXPIRED'
        ) {
            throw new PaymentPreparationError(
                409,
                'PAYMENT_WINDOW_EXPIRED',
                'The payment window has expired.'
            );
        }

        throw new PaymentPreparationError(
            502,
            'STRIPE_CHECKOUT_FAILED',
            'The payment service could not create Checkout.'
        );
    }

    if (
        session?.bookingId !== attempt.bookingId ||
        session?.paymentId !== attempt.paymentId ||
        session?.checkoutAttemptId !== attempt.checkoutAttemptId ||
        typeof session.stripeSessionId !== 'string' ||
        !session.stripeSessionId.startsWith('cs_') ||
        typeof session.checkoutUrl !== 'string' ||
        !session.checkoutUrl.startsWith('https://')
    ) {
        throw new PaymentPreparationError(
            502,
            'INVALID_PAYMENT_SERVICE_RESPONSE',
            'The payment service returned unexpected Checkout information.'
        );
    }

    const stored = await storeCheckoutSession(
        attempt.paymentId,
        session.stripeSessionId,
        session.checkoutUrl
    );

    if (!stored) {
        const existing = await findPaymentById(attempt.paymentId);
        const result = existingCheckoutResult(existing);

        if (
            result.stripeSessionId !== session.stripeSessionId ||
            result.checkoutUrl !== session.checkoutUrl
        ) {
            throw new PaymentPreparationError(
                409,
                'PAYMENT_STATE_CHANGED',
                'A different Checkout Session is already associated with this payment.'
            );
        }

        return result;
    }

    return checkoutResult(
        session.stripeSessionId,
        session.checkoutUrl,
        false
    );
}