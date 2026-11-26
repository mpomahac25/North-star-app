import { jest } from '@jest/globals';
import {
    prepareBookingForPayment
} from '../../services/paymentService.js';

const BOOKING_URL = 'http://booking:3002';

const paymentDetails = {
    bookingId: 123,
    checkoutAttemptId: 'b37ed126-fd9a-430c-b9e1-0c82fc3a976e',
    email: 'guest@example.com',
    amountCents: 2500,
    currency: 'eur',
    paymentExpiresAt: '2026-11-20T12:10:00.000Z'
};

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

describe('Backend payment preparation', () => {
    test('requests payment details from the booking service', async () => {
        const request = jest.fn(async () => jsonResponse(paymentDetails));

        const result = await prepareBookingForPayment(123, {
            bookingUrl: BOOKING_URL,
            request
        });

        expect(result).toEqual(paymentDetails);

        expect(request).toHaveBeenCalledTimes(1);

        const [url, options] = request.mock.calls[0];

        expect(url.toString()).toBe(
            'http://booking:3002/internal/bookings/123/checkout/prepare'
        );

        expect(options.method).toBe('POST');
    });

    test('preserves booking rejection responses', async () => {
        const request = jest.fn(async () => jsonResponse({
            error: {
                code: 'SELECTION_EXPIRED',
                message: 'The seat selection hold has expired.'
            }
        }, 409));

        await expect(
            prepareBookingForPayment(123, {
                bookingUrl: BOOKING_URL,
                request
            })
        ).rejects.toMatchObject({
            status: 409,
            code: 'SELECTION_EXPIRED'
        });
    });

    test('rejects invalid booking identifiers', async () => {
        const request = jest.fn();

        await expect(
            prepareBookingForPayment(-1, {
                bookingUrl: BOOKING_URL,
                request
            })
        ).rejects.toMatchObject({
            status: 400,
            code: 'INVALID_BOOKING_ID'
        });

        expect(request).not.toHaveBeenCalled();
    });

    test('handles booking service unavailability', async () => {
        const request = jest.fn(async () => {
            throw new Error('Connection refused');
        });

        await expect(
            prepareBookingForPayment(123, {
                bookingUrl: BOOKING_URL,
                request
            })
        ).rejects.toMatchObject({
            status: 502,
            code: 'BOOKING_SERVICE_UNAVAILABLE'
        });
    });

    test('rejects malformed payment details', async () => {
        const request = jest.fn(async () => jsonResponse({
            ...paymentDetails,
            amountCents: -100
        }));

        await expect(
            prepareBookingForPayment(123, {
                bookingUrl: BOOKING_URL,
                request
            })
        ).rejects.toMatchObject({
            status: 502,
            code: 'INVALID_BOOKING_RESPONSE'
        });
    });
});