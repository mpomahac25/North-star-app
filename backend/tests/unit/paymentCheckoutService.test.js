import { jest } from '@jest/globals';

const readDaoMocks = {
    findPaymentById: jest.fn(),
    listPaymentsByBookingId: jest.fn()
};

const writeDaoMocks = {
    createPaymentAttempt: jest.fn(),
    storeCheckoutSession: jest.fn()
};

jest.unstable_mockModule(
    '../../dao/payment/paymentReadDao.js',
    () => readDaoMocks
);

jest.unstable_mockModule(
    '../../dao/payment/paymentWriteDao.js',
    () => writeDaoMocks
);

const { createCheckoutSessionForBooking } = await import(
    '../../services/paymentService.js'
);

const NOW = Date.parse('2026-11-26T10:00:00Z');

const PAYMENT_ID = '8f3b3e0b-8a1d-4b82-9fd6-2ef79a809a50';

const DETAILS = {
    bookingId: 123,
    checkoutAttemptId: 'b37ed126-fd9a-430c-b9e1-0c82fc3a976e',
    email: 'guest@example.com',
    amountCents: 2500,
    currency: 'eur',
    paymentExpiresAt: '2026-11-26T10:10:00.000Z'
};

const SESSION = {
    bookingId: 123,
    paymentId: PAYMENT_ID,
    checkoutAttemptId: DETAILS.checkoutAttemptId,
    stripeSessionId: 'cs_test_example',
    checkoutUrl: 'https://checkout.stripe.com/example'
};

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

function setup() {
    let currentTime = NOW;

    const request = jest.fn(async url => {
        if (url.pathname.endsWith('/checkout/prepare')) {
            return jsonResponse(DETAILS);
        }

        if (url.pathname === '/internal/stripe/checkout') {
            return jsonResponse(SESSION, 201);
        }

        throw new Error('Unexpected endpoint');
    });

    return {
        request,
        options: {
            bookingUrl: 'http://booking:3002',
            paymentUrl: 'http://payment:3004',
            request,
            now: () => currentTime
        },
        advanceTime: milliseconds => {
            currentTime += milliseconds;
        }
    };
}

function existingPayment(overrides = {}) {
    return {
        id: PAYMENT_ID,
        bookingId: DETAILS.bookingId,
        checkoutAttemptId: DETAILS.checkoutAttemptId,
        amountCents: DETAILS.amountCents,
        currency: DETAILS.currency,
        expiresAt: new Date(DETAILS.paymentExpiresAt),
        status: 'pending_payment',
        stripeSessionId: SESSION.stripeSessionId,
        stripeCheckoutUrl: SESSION.checkoutUrl,
        ...overrides
    };
}

describe('Backend Checkout orchestration', () => {
    beforeEach(() => {
        readDaoMocks.findPaymentById.mockReset();
        readDaoMocks.listPaymentsByBookingId.mockReset();
        writeDaoMocks.createPaymentAttempt.mockReset();
        writeDaoMocks.storeCheckoutSession.mockReset();

        readDaoMocks.listPaymentsByBookingId.mockResolvedValue([]);
        writeDaoMocks.createPaymentAttempt.mockResolvedValue(PAYMENT_ID);
        writeDaoMocks.storeCheckoutSession.mockResolvedValue(true);
    });

    test('creates Checkout and persists the Stripe Session', async () => {
        const { options, request } = setup();

        const result = await createCheckoutSessionForBooking(123, options);

        expect(result).toEqual({
            bookingId: 123,
            paymentId: PAYMENT_ID,
            stripeSessionId: SESSION.stripeSessionId,
            checkoutUrl: SESSION.checkoutUrl,
            status: 'pending_payment',
            paymentExpiresAt: DETAILS.paymentExpiresAt,
            reused: false
        });

        expect(writeDaoMocks.storeCheckoutSession).toHaveBeenCalledWith(
            PAYMENT_ID,
            SESSION.stripeSessionId,
            SESSION.checkoutUrl
        );

        const stripeRequest = request.mock.calls.find(
            ([url]) => url.pathname === '/internal/stripe/checkout'
        );

        expect(stripeRequest).toBeDefined();
        expect(stripeRequest[1].method).toBe('POST');

        expect(JSON.parse(stripeRequest[1].body)).toEqual({
            ...DETAILS,
            paymentId: PAYMENT_ID
        });
    });

    test('reuses an existing Checkout Session', async () => {
        readDaoMocks.listPaymentsByBookingId.mockResolvedValue([
            existingPayment()
        ]);

        readDaoMocks.findPaymentById.mockResolvedValue(
            existingPayment()
        );

        const { options, request } = setup();

        const result = await createCheckoutSessionForBooking(123, options);

        expect(result).toMatchObject({
            stripeSessionId: SESSION.stripeSessionId,
            checkoutUrl: SESSION.checkoutUrl,
            reused: true
        });

        expect(request).toHaveBeenCalledTimes(1);
        expect(writeDaoMocks.storeCheckoutSession).not.toHaveBeenCalled();
    });

    test('handles payment service failures without changing payment status', async () => {
        const { options, request } = setup();

        request.mockImplementation(async url => {
            if (url.pathname.endsWith('/checkout/prepare')) {
                return jsonResponse(DETAILS);
            }

            return jsonResponse({
                error: {
                    code: 'STRIPE_CHECKOUT_FAILED'
                }
            }, 502);
        });

        await expect(
            createCheckoutSessionForBooking(123, options)
        ).rejects.toMatchObject({
            status: 502,
            code: 'STRIPE_CHECKOUT_FAILED'
        });

        expect(writeDaoMocks.storeCheckoutSession).not.toHaveBeenCalled();
    });

    test('rejects inconsistent Stripe Session information', async () => {
        const { options, request } = setup();

        request.mockImplementation(async url => {
            if (url.pathname.endsWith('/checkout/prepare')) {
                return jsonResponse(DETAILS);
            }

            return jsonResponse({
                ...SESSION,
                paymentId: 'another-payment'
            }, 201);
        });

        await expect(
            createCheckoutSessionForBooking(123, options)
        ).rejects.toMatchObject({
            status: 502,
            code: 'INVALID_PAYMENT_SERVICE_RESPONSE'
        });

        expect(writeDaoMocks.storeCheckoutSession).not.toHaveBeenCalled();
    });

    test('handles concurrent requests storing the same session', async () => {
        writeDaoMocks.storeCheckoutSession.mockResolvedValue(false);
        readDaoMocks.findPaymentById.mockResolvedValue(existingPayment());

        const { options } = setup();

        const result = await createCheckoutSessionForBooking(123, options);

        expect(result).toMatchObject({
            stripeSessionId: SESSION.stripeSessionId,
            reused: true
        });
    });

    test('rejects conflicting Checkout Sessions', async () => {
        writeDaoMocks.storeCheckoutSession.mockResolvedValue(false);

        readDaoMocks.findPaymentById.mockResolvedValue(
            existingPayment({
                stripeSessionId: 'cs_test_different'
            })
        );

        const { options } = setup();

        await expect(
            createCheckoutSessionForBooking(123, options)
        ).rejects.toMatchObject({
            status: 409,
            code: 'PAYMENT_STATE_CHANGED'
        });
    });

    test('does not return Checkout URLs after the payment deadline', async () => {
        const { options, request, advanceTime } = setup();

        request.mockImplementation(async url => {
            if (url.pathname.endsWith('/checkout/prepare')) {
                return jsonResponse(DETAILS);
            }

            advanceTime(11 * 60 * 1000);
            return jsonResponse(SESSION, 201);
        });

        await expect(
            createCheckoutSessionForBooking(123, options)
        ).rejects.toMatchObject({
            status: 409,
            code: 'PAYMENT_WINDOW_EXPIRED'
        });

        expect(writeDaoMocks.storeCheckoutSession).toHaveBeenCalledWith(
            PAYMENT_ID,
            SESSION.stripeSessionId,
            SESSION.checkoutUrl
        );
    });
});