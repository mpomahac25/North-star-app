import {
    createBookingStore
} from "../../services/bookingStore.js";

function setup() {
    const store = createBookingStore({
        now: () => Date.parse("2026-11-26T10:00:00Z")
    });

    const booking = store.createBooking({
        screeningId: 7,
        email: "guest@example.com",
        seats: [
            { row: 3, number: 5 }
        ]
    });

    const checkout = store.prepareCheckout(
        booking.bookingId
    );

    return {
        store,
        booking,
        checkout
    };
}

describe("Booking payment results", () => {
    test("confirms a successful payment", () => {
        const { store, booking, checkout } = setup();

        const result = store.applyPaymentResult(
            booking.bookingId,
            {
                checkoutAttemptId: checkout.checkoutAttemptId,
                status: "paid"
            }
        );

        expect(result).toEqual({
            bookingId: booking.bookingId,
            status: "paid"
        });
    });

    test("payment confirmation is idempotent", () => {
        const { store, booking, checkout } = setup();

        const result = {
            checkoutAttemptId: checkout.checkoutAttemptId,
            status: "paid"
        };

        expect(
            store.applyPaymentResult(booking.bookingId, result)
        ).toEqual(
            store.applyPaymentResult(booking.bookingId, result)
        );
    });

    test("rejects mismatched checkout attempts", () => {
        const { store, booking } = setup();

        expect(() => {
            store.applyPaymentResult(
                booking.bookingId,
                {
                    checkoutAttemptId: "wrong-attempt",
                    status: "paid"
                }
            );
        }).toThrow(
            "The checkout attempt does not match"
        );
    });

    test("does not expire a paid booking", () => {
        const { store, booking, checkout } = setup();

        store.applyPaymentResult(
            booking.bookingId,
            {
                checkoutAttemptId: checkout.checkoutAttemptId,
                status: "paid"
            }
        );

        expect(() => {
            store.applyPaymentResult(
                booking.bookingId,
                {
                    checkoutAttemptId: checkout.checkoutAttemptId,
                    status: "expired"
                }
            );
        }).toThrow(
            "The booking cannot transition"
        );
    });

    test("releases seats after a failed payment", () => {
        const { store, booking, checkout } = setup();

        store.applyPaymentResult(
            booking.bookingId,
            {
                checkoutAttemptId: checkout.checkoutAttemptId,
                status: "failed"
            }
        );

        const replacement = store.createBooking({
            screeningId: 7,
            email: "second@example.com",
            seats: [
                { row: 3, number: 5 }
            ]
        });

        expect(replacement.status).toBe("held");
    });
});