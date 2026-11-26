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

const { preparePaymentAttempt } = await import(
    '../../services/paymentService.js'
);

const NOW = Date.parse('2026-11-20T12:00:00Z');

const DETAILS = {
    bookingId: 123,
    checkoutAttemptId: 'b37ed126-fd9a-430c-b9e1-0c82fc3a976e',
    email: 'guest@example.com',
    amountCents: 2500,
    currency: 'eur',
    paymentExpiresAt: '2026-11-20T12:10:00.000Z'
};

const PAYMENT_ID = '8f3b3e0b-8a1d-4b82-9fd6-2ef79a809a50';

function existingPayment(overrides = {}) {
    return {
        id: PAYMENT_ID,
        bookingId: 123,
        checkoutAttemptId: DETAILS.checkoutAttemptId,
        amountCents: 2500,
        currency: 'eur',
        expiresAt: new Date(DETAILS.paymentExpiresAt),
        status: 'creating',
        ...overrides
    };
}

function setup(overrides = {}) {
    const request = jest.fn(async () => new Response(
        JSON.stringify({ ...DETAILS, ...overrides }),
        {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        }
    ));

    return {
        request,
        options: {
            request,
            bookingUrl: 'http://booking:3002',
            now: () => NOW
        }
    };
}

describe('Payment attempt preparation', () => {
    beforeEach(() => {
        readDaoMocks.listPaymentsByBookingId.mockReset();
        writeDaoMocks.createPaymentAttempt.mockReset();

        readDaoMocks.listPaymentsByBookingId.mockResolvedValue([]);
        writeDaoMocks.createPaymentAttempt.mockResolvedValue(PAYMENT_ID);
    });

    test('creates a payment attempt from booking details', async () => {
        const { options } = setup();

        const result = await preparePaymentAttempt(123, options);

        expect(result).toEqual({
            ...DETAILS,
            paymentId: PAYMENT_ID,
            status: 'creating',
            reused: false
        });

        expect(readDaoMocks.listPaymentsByBookingId)
            .toHaveBeenCalledWith(123);

        expect(writeDaoMocks.createPaymentAttempt)
            .toHaveBeenCalledWith({
                bookingId: 123,
                checkoutAttemptId: DETAILS.checkoutAttemptId,
                amountCents: 2500,
                currency: 'eur',
                expiresAt: DETAILS.paymentExpiresAt
            });
    });

    test('reuses the same active checkout attempt', async () => {
        readDaoMocks.listPaymentsByBookingId.mockResolvedValue([
            existingPayment({ status: 'pending_payment' })
        ]);

        const { options } = setup();

        const result = await preparePaymentAttempt(123, options);

        expect(result).toMatchObject({
            paymentId: PAYMENT_ID,
            status: 'pending_payment',
            reused: true
        });

        expect(writeDaoMocks.createPaymentAttempt)
            .not.toHaveBeenCalled();
    });

    test('rejects an already paid booking', async () => {
        readDaoMocks.listPaymentsByBookingId.mockResolvedValue([
            existingPayment({ status: 'paid' })
        ]);

        const { options } = setup();

        await expect(preparePaymentAttempt(123, options))
            .rejects.toMatchObject({
                status: 409,
                code: 'BOOKING_ALREADY_PAID'
            });
    });

    test('rejects a different active checkout attempt', async () => {
        readDaoMocks.listPaymentsByBookingId.mockResolvedValue([
            existingPayment({
                checkoutAttemptId: 'b0f7ae17-c7ee-4e34-b5a5-29e1e7c0c709'
            })
        ]);

        const { options } = setup();

        await expect(preparePaymentAttempt(123, options))
            .rejects.toMatchObject({
                status: 409,
                code: 'ACTIVE_PAYMENT_EXISTS'
            });
    });

    test('rejects changed payment details for the same attempt', async () => {
        readDaoMocks.listPaymentsByBookingId.mockResolvedValue([
            existingPayment({ amountCents: 3000 })
        ]);

        const { options } = setup();

        await expect(preparePaymentAttempt(123, options))
            .rejects.toMatchObject({
                status: 409,
                code: 'PAYMENT_DETAILS_CHANGED'
            });
    });

    test('rejects an expired payment window', async () => {
        const { options } = setup();

        options.now = () => NOW + 600000;

        await expect(preparePaymentAttempt(123, options))
            .rejects.toMatchObject({
                status: 409,
                code: 'PAYMENT_WINDOW_EXPIRED'
            });

        expect(writeDaoMocks.createPaymentAttempt)
            .not.toHaveBeenCalled();
    });

    test('recovers when a concurrent request creates the same payment', async () => {
        readDaoMocks.listPaymentsByBookingId
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([existingPayment()]);

        writeDaoMocks.createPaymentAttempt.mockRejectedValue(
            Object.assign(new Error('Duplicate key'), {
                code: '23505'
            })
        );

        const { options } = setup();

        const result = await preparePaymentAttempt(123, options);

        expect(result).toMatchObject({
            paymentId: PAYMENT_ID,
            reused: true
        });
    });

    test('rejects a conflicting concurrent payment attempt', async () => {
        readDaoMocks.listPaymentsByBookingId
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                existingPayment({
                    checkoutAttemptId: 'b0f7ae17-c7ee-4e34-b5a5-29e1e7c0c709'
                })
            ]);

        writeDaoMocks.createPaymentAttempt.mockRejectedValue(
            Object.assign(new Error('Duplicate key'), {
                code: '23505'
            })
        );

        const { options } = setup();

        await expect(preparePaymentAttempt(123, options))
            .rejects.toMatchObject({
                status: 409,
                code: 'ACTIVE_PAYMENT_EXISTS'
            });
    });

    test('propagates unexpected database failures', async () => {
        writeDaoMocks.createPaymentAttempt.mockRejectedValue(
            new Error('Database unavailable')
        );

        const { options } = setup();

        await expect(preparePaymentAttempt(123, options))
            .rejects.toThrow('Database unavailable');
    });
});