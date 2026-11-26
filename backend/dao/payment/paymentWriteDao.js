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
                 WHEN $3 = 'paid' THEN NOW()
                 WHEN $3 IN ('expired', 'cancelled', 'failed')
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

export async function withPaymentTransaction(
    operation,
    database = pool
) {
    const client = await database.connect();

    try {
        await client.query("BEGIN");

        const result = await operation(client);

        await client.query("COMMIT");

        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function insertStripeWebhookEvent({
    eventId,
    eventType,
    paymentId
}, database = pool) {
    const result = await database.query(
        `INSERT INTO stripe_webhook_events (
            event_id,
            event_type,
            payment_id
         )
         VALUES ($1, $2, $3)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [eventId, eventType, paymentId]
    );

    return result.rowCount === 1;
}

export async function markStripeWebhookProcessed(
    eventId,
    database = pool
) {
    const result = await database.query(
        `UPDATE stripe_webhook_events
         SET processing_status = 'processed',
             processed_at = NOW(),
             last_error = NULL
         WHERE event_id = $1
           AND processing_status <> 'processed'`,
        [eventId]
    );

    return result.rowCount === 1;
}

export async function markStripeWebhookFailed(
    eventId,
    error,
    database = pool
) {
    const result = await database.query(
        `UPDATE stripe_webhook_events
         SET processing_status = 'failed',
             processed_at = NULL,
             last_error = $2
         WHERE event_id = $1
           AND processing_status <> 'processed'`,
        [eventId, String(error).slice(0, 1000)]
    );

    return result.rowCount === 1;
}

export async function queueBookingPaymentSync(
    paymentId,
    status,
    database = pool
) {
    const result = await database.query(
        `INSERT INTO booking_payment_sync (
            payment_id,
            desired_status
         )
         VALUES ($1, $2)
         ON CONFLICT (payment_id)
         DO UPDATE SET
            desired_status = EXCLUDED.desired_status,
            synced_at = CASE
                WHEN booking_payment_sync.desired_status =
                     EXCLUDED.desired_status
                THEN booking_payment_sync.synced_at
                ELSE NULL
            END,
            last_error = CASE
                WHEN booking_payment_sync.desired_status =
                     EXCLUDED.desired_status
                THEN booking_payment_sync.last_error
                ELSE NULL
            END,
            updated_at = NOW()
         RETURNING payment_id`,
        [paymentId, status]
    );

    return result.rowCount === 1;
}

export async function markBookingPaymentSynced(
    paymentId,
    status,
    database = pool
) {
    const result = await database.query(
        `UPDATE booking_payment_sync
         SET synced_at = COALESCE(synced_at, NOW()),
             last_error = NULL,
             updated_at = NOW()
         WHERE payment_id = $1
           AND desired_status = $2
         RETURNING payment_id`,
        [paymentId, status]
    );

    return result.rowCount === 1;
}

export async function markBookingPaymentSyncFailed(
    paymentId,
    status,
    error,
    database = pool
) {
    const result = await database.query(
        `UPDATE booking_payment_sync
         SET attempts = attempts + 1,
             last_error = $3,
             updated_at = NOW()
         WHERE payment_id = $1
           AND desired_status = $2
           AND synced_at IS NULL
         RETURNING payment_id`,
        [
            paymentId,
            status,
            String(error).slice(0, 1000)
        ]
    );

    return result.rowCount === 1;
}

export async function finalizeSyncedWebhookEvents(
    database = pool
) {
    const result = await database.query(
        `UPDATE stripe_webhook_events e
         SET processing_status = 'processed',
             processed_at = NOW(),
             last_error = NULL
         FROM booking_payment_sync s,
              payment_attempts p
         WHERE e.payment_id = s.payment_id
           AND p.id = s.payment_id
           AND s.desired_status = p.status
           AND s.synced_at IS NOT NULL
           AND e.processing_status IN ('received', 'failed')
         RETURNING e.event_id`
    );

    return result.rowCount;
}