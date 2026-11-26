import express from 'express';
import {
    BookingError,
    createBookingStore
} from '../services/bookingStore.js';

export function createBookingRouter({ store = createBookingStore() } = {}) {
    const router = express.Router();

    function handleError(res, error) {
        if (error instanceof BookingError) {
            return res.status(error.status).json({
                error: {
                    code: error.code,
                    message: error.message
                }
            });
        }

        console.error('Booking request failed:', error);

        return res.status(500).json({
            error: {
                code: 'BOOKING_SERVICE_ERROR',
                message: 'The booking request could not be completed.'
            }
        });
    }

    router.post('/internal/bookings', (req, res) => {
        try {
            const booking = store.createBooking(req.body);
            return res.status(201).json(booking);
        } catch (error) {
            return handleError(res, error);
        }
    });

    router.post('/internal/bookings/:bookingId/checkout/prepare', (req, res) => {
        try {
            const bookingId = Number(req.params.bookingId);

            if (
                !/^[1-9]\d*$/.test(req.params.bookingId) ||
                !Number.isSafeInteger(bookingId)
            ) {
                throw new BookingError(
                    400, 'INVALID_BOOKING_ID', 'A valid booking ID is required.'
                );
            }

            return res.json(store.prepareCheckout(bookingId));
        } catch (error) {
            return handleError(res, error);
        }
    });

    router.post(
        "/internal/bookings/:bookingId/payment-result",
        (req, res) => {
            try {
                const bookingId = Number(req.params.bookingId);

                if (
                    !/^[1-9]\d*$/.test(req.params.bookingId) ||
                    !Number.isSafeInteger(bookingId) ||
                    bookingId > 2147483647
                ) {
                    throw new BookingError(
                        400,
                        "INVALID_BOOKING_ID",
                        "A valid booking ID is required."
                    );
                }

                const result = store.applyPaymentResult(
                    bookingId,
                    req.body ?? {}
                );

                return res.json(result);
            } catch (error) {
                return handleError(res, error);
            }
        }
    );

    return router;
}