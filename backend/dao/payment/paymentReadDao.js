import { pool } from "../../db/pool.js";

function mapPayment(row) {
    if (!row) return null;

    return {
        id: row.id,
        bookingId: row.booking_id,
        checkoutAttemptId: row.checkout_attempt_id,
        stripeSessionId: row.stripe_session_id,
        stripeCheckoutUrl: row.stripe_checkout_url,
        stripePaymentIntentId: row.stripe_payment_intent_id,
        amountCents: row.amount_cents,
        currency: row.currency,
        status: row.status,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at
    };
}

export async function findPaymentById(id, database = pool) {
    const result = await database.query(
        `SELECT *
         FROM payment_attempts
         WHERE id = $1`,
        [id]
    );

    return mapPayment(result.rows[0]);
}

export async function findPaymentByCheckoutAttemptId(
    checkoutAttemptId,
    database = pool
) {
    const result = await database.query(
        `SELECT *
         FROM payment_attempts
         WHERE checkout_attempt_id = $1`,
        [checkoutAttemptId]
    );

    return mapPayment(result.rows[0]);
}

export async function findPaymentByStripeSessionId(
    stripeSessionId,
    database = pool
) {
    const result = await database.query(
        `SELECT *
         FROM payment_attempts
         WHERE stripe_session_id = $1`,
        [stripeSessionId]
    );

    return mapPayment(result.rows[0]);
}

export async function listPaymentsByBookingId(
    bookingId,
    database = pool
) {
    const result = await database.query(
        `SELECT *
         FROM payment_attempts
         WHERE booking_id = $1
         ORDER BY created_at DESC, id DESC`,
        [bookingId]
    );

    return result.rows.map(mapPayment);
}