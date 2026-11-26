import {
    findPaymentByStripeSessionId
} from "../dao/payment/paymentReadDao.js";

export class PaymentStatusError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

export async function getCheckoutSessionStatus(
    sessionId,
    {
        findPayment = findPaymentByStripeSessionId
    } = {}
) {
    if (
        typeof sessionId !== "string" ||
        !/^cs_[A-Za-z0-9_]+$/.test(sessionId) ||
        sessionId.length > 255
    ) {
        throw new PaymentStatusError(
            400,
            "INVALID_SESSION_ID",
            "A valid Stripe Checkout Session ID is required."
        );
    }

    const payment = await findPayment(sessionId);

    if (!payment) {
        throw new PaymentStatusError(
            404,
            "PAYMENT_NOT_FOUND",
            "The payment was not found."
        );
    }

    return {
        bookingId: payment.bookingId,
        paymentId: payment.id,
        stripeSessionId: payment.stripeSessionId,
        status: payment.status,
        paymentExpiresAt: new Date(
            payment.expiresAt
        ).toISOString(),
        paidAt:
            payment.status === "paid" && payment.completedAt
                ? new Date(payment.completedAt).toISOString()
                : null
    };
}