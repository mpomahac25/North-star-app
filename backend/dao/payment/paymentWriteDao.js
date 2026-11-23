import { randomUUID } from "node:crypto";
import { pool } from "../../db/pool.js";

export async function createPaymentAttempt({
    bookingId,
    checkoutAttemptId,
    amountCents,
    currency,
    expiresAt
}, database = pool) {
    const id = randomUUID();

    const result = await database.query(
        `INSERT INTO payment_attempts (
            id,
            booking_id,
            checkout_attempt_id,
            amount_cents,
            currency,
            expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id`,
        [
            id,
            bookingId,
            checkoutAttemptId,
            amountCents,
            currency,
            expiresAt
        ]
    );

    return result.rows[0].id;
}

export async function storeCheckoutSession(
    paymentId,
    stripeSessionId,
    checkoutUrl,
    database = pool
) {
    const result = await database.query(
        `UPDATE payment_attempts
         SET stripe_session_id = $2,
             stripe_checkout_url = $3,
             status = 'pending_payment',
             updated_at = NOW()
         WHERE id = $1
           AND status = 'creating'
           AND stripe_session_id IS NULL
         RETURNING id`,
        [paymentId, stripeSessionId, checkoutUrl]
    );

    return result.rowCount === 1;
}

export async function updatePaymentStatus({
    paymentId,
    expectedStatus,
    status,
    stripePaymentIntentId = null
}, database = pool) {
    const result = await database.query(
        `UPDATE payment_attempts
         SET status = $3,
             stripe_payment_intent_id = COALESCE(
                 $4,
                 stripe_payment_intent_id
             ),
             completed_at = CASE
                 WHEN $3 IN ('paid', 'expired', 'cancelled', 'failed')
                 THEN COALESCE(completed_at, NOW())
                 ELSE completed_at
             END,
             updated_at = NOW()
         WHERE id = $1
           AND status = $2
         RETURNING id`,
        [
            paymentId,
            expectedStatus,
            status,
            stripePaymentIntentId
        ]
    );

    return result.rowCount === 1;
}