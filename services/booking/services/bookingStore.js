import { randomUUID } from 'node:crypto';

const SELECTION_HOLD_MS = 15 * 60 * 1000;
const PAYMENT_WINDOW_MS = 10 * 60 * 1000;
const STUB_TICKET_PRICE_CENTS = 1250;

export class BookingError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

export function createBookingStore({ now = () => Date.now() } = {}) {
    const bookings = new Map();
    let nextBookingId = 1;

    function createBooking({ screeningId, seats, email } = {}) {
        if (!Number.isSafeInteger(screeningId) || screeningId < 1) {
            throw new BookingError(
                400, 'INVALID_SCREENING', 'A valid screening ID is required.'
            );
        }

        if (
            !Array.isArray(seats) ||
            seats.length === 0 ||
            seats.some(seat =>
                !Number.isSafeInteger(seat?.row) ||
                seat.row < 1 ||
                !Number.isSafeInteger(seat?.number) ||
                seat.number < 1
            )
        ) {
            throw new BookingError(
                400, 'INVALID_SEATS', 'At least one valid seat is required.'
            );
        }

        if (
            typeof email !== 'string' ||
            email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
            throw new BookingError(
                400, 'INVALID_EMAIL', 'A valid email is required.'
            );
        }

        const requestedSeats = new Set(
            seats.map(seat => `${seat.row}:${seat.number}`)
        );

        if (requestedSeats.size !== seats.length) {
            throw new BookingError(
                400, 'DUPLICATE_SEATS', 'A seat was selected more than once.'
            );
        }

        const currentTime = now();

        for (const booking of bookings.values()) {
            if (booking.screeningId !== screeningId) {
                continue;
            }

            const occupied =
                booking.status === 'paid' ||
                booking.status === 'pending_payment' ||
                (
                    booking.status === 'held' &&
                    currentTime < Date.parse(booking.selectionExpiresAt)
                );

            if (!occupied) {
                continue;
            }

            const conflict = booking.seats.some(
                seat => requestedSeats.has(`${seat.row}:${seat.number}`)
            );

            if (conflict) {
                throw new BookingError(
                    409, 'SEATS_UNAVAILABLE', 'One or more seats are unavailable.'
                );
            }
        }

        const booking = {
            bookingId: nextBookingId++,
            screeningId,
            seats: seats.map(seat => ({
                row: seat.row,
                number: seat.number
            })),
            email,
            amountCents: seats.length * STUB_TICKET_PRICE_CENTS,
            currency: 'eur',
            status: 'held',
            selectionExpiresAt: new Date(
                currentTime + SELECTION_HOLD_MS
            ).toISOString(),
            checkoutAttemptId: null,
            paymentExpiresAt: null
        };

        bookings.set(booking.bookingId, booking);

        return { ...booking };
    }

    function prepareCheckout(bookingId) {
        const booking = bookings.get(bookingId);

        if (!booking) {
            throw new BookingError(
                404, 'BOOKING_NOT_FOUND', 'Booking was not found.'
            );
        }

        const currentTime = now();

        if (booking.status === 'pending_payment') {
            if (currentTime >= Date.parse(booking.paymentExpiresAt)) {
                throw new BookingError(
                    409, 'PAYMENT_WINDOW_EXPIRED', 'The payment window has expired.'
                );
            }

            return paymentDetails(booking);
        }

        if (booking.status === 'held' &&
            currentTime >= Date.parse(booking.selectionExpiresAt)) {
            booking.status = 'expired';

            throw new BookingError(
                409, 'SELECTION_EXPIRED', 'The seat selection hold has expired.'
            );
        }

        if (booking.status !== 'held') {
            throw new BookingError(
                409, 'BOOKING_NOT_PAYABLE', 'The booking cannot proceed to payment.'
            );
        }

        booking.status = 'pending_payment';
        booking.checkoutAttemptId = randomUUID();
        booking.paymentExpiresAt = new Date(
            currentTime + PAYMENT_WINDOW_MS
        ).toISOString();

        return paymentDetails(booking);
    }

    function paymentDetails(booking) {
        return {
            bookingId: booking.bookingId,
            checkoutAttemptId: booking.checkoutAttemptId,
            email: booking.email,
            amountCents: booking.amountCents,
            currency: booking.currency,
            paymentExpiresAt: booking.paymentExpiresAt
        };
    }

    function applyPaymentResult(bookingId, {
        checkoutAttemptId,
        status
    }) {
        const booking = bookings.get(bookingId);

        if (!booking) {
            throw new BookingError(
                404,
                "BOOKING_NOT_FOUND",
                "Booking was not found."
            );
        }

        if (!["paid", "failed", "expired"].includes(status)) {
            throw new BookingError(
                400,
                "INVALID_PAYMENT_STATUS",
                "The payment status is invalid."
            );
        }

        if (booking.checkoutAttemptId !== checkoutAttemptId) {
            throw new BookingError(
                409,
                "CHECKOUT_ATTEMPT_MISMATCH",
                "The checkout attempt does not match the booking."
            );
        }

        if (booking.status === status) {
            return {
                bookingId,
                status
            };
        }

        if (booking.status !== "pending_payment") {
            throw new BookingError(
                409,
                "INVALID_BOOKING_TRANSITION",
                "The booking cannot transition to this status."
            );
        }

        booking.status = status;

        return {
            bookingId,
            status
        };
    }

    return {
        createBooking,
        prepareCheckout,
        applyPaymentResult
    };
}