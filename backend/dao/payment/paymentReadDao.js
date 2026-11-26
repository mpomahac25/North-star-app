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

export async function findPaymentByStripeSessionIdForUpdate(
    stripeSessionId,
    database = pool
) {
    const result = await database.query(
        `SELECT *
         FROM payment_attempts
         WHERE stripe_session_id = $1
         FOR UPDATE`,
        [stripeSessionId]
    );

    return mapPayment(result.rows[0]);
}

export async function findStripeWebhookEventByIdForUpdate(
    eventId,
    database = pool
) {
    const result = await database.query(
        `SELECT
            event_id,
            event_type,
            payment_id,
            processing_status,
            received_at,
            processed_at,
            last_error
         FROM stripe_webhook_events
         WHERE event_id = $1
         FOR UPDATE`,
        [eventId]
    );

    const row = result.rows[0];

    if (!row) return null;

    return {
        eventId: row.event_id,
        eventType: row.event_type,
        paymentId: row.payment_id,
        processingStatus: row.processing_status,
        receivedAt: row.received_at,
        processedAt: row.processed_at,
        lastError: row.last_error
    };
}

export async function findPaymentByIdForUpdate(
    paymentId,
    database = pool
) {
    const result = await database.query(
        `SELECT *
         FROM payment_attempts
         WHERE id = $1
         FOR UPDATE`,
        [paymentId]
    );

    return mapPayment(result.rows[0]);
}

export async function listDuePaymentAttempts(
    limit = 25,
    database = pool
) {
    const result = await database.query(
        `SELECT *
         FROM payment_attempts
         WHERE status IN ('creating', 'pending_payment')
           AND expires_at <= NOW()
         ORDER BY expires_at, id
         LIMIT $1`,
        [limit]
    );

    return result.rows.map(mapPayment);
}

export async function listPendingBookingPaymentSync(
    limit = 25,
    database = pool
) {
    const result = await database.query(
        `SELECT
            s.payment_id,
            s.desired_status,
            p.booking_id,
            p.checkout_attempt_id
         FROM booking_payment_sync s
         JOIN payment_attempts p
           ON p.id = s.payment_id
         WHERE s.synced_at IS NULL
           AND s.desired_status = p.status
         ORDER BY s.updated_at, s.payment_id
         LIMIT $1`,
        [limit]
    );

    return result.rows.map(row => ({
        paymentId: row.payment_id,
        bookingId: row.booking_id,
        checkoutAttemptId: row.checkout_attempt_id,
        status: row.desired_status
    }));
}