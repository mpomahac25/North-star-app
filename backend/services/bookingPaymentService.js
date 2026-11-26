export async function synchronizeBookingPayment(
    {
        bookingId,
        checkoutAttemptId,
        status
    },
    {
        request = fetch,
        bookingUrl = process.env.BOOKING_URL ||
        "http://localhost:3002"
    } = {}
) {
    if (
        !Number.isInteger(bookingId) ||
        bookingId < 1 ||
        typeof checkoutAttemptId !== "string" ||
        !["paid", "failed", "expired"].includes(status)
    ) {
        throw new Error("Invalid booking synchronization details.");
    }

    const response = await request(
        new URL(
            `/internal/bookings/${bookingId}/payment-result`,
            bookingUrl
        ),
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                checkoutAttemptId,
                status
            }),
            signal: AbortSignal.timeout(5000)
        }
    );

    if (!response.ok) {
        throw new Error(
            `Booking synchronization returned HTTP ${response.status}.`
        );
    }

    const result = await response.json();

    if (
        result.bookingId !== bookingId ||
        result.status !== status
    ) {
        throw new Error(
            "Booking synchronization returned unexpected information."
        );
    }

    return result;
}