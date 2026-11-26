import {
    findPaymentByIdForUpdate,
    listDuePaymentAttempts,
    listPendingBookingPaymentSync
} from "../dao/payment/paymentReadDao.js";

import {
    withPaymentTransaction,
    updatePaymentStatus,
    queueBookingPaymentSync,
    markBookingPaymentSynced,
    markBookingPaymentSyncFailed,
    finalizeSyncedWebhookEvents
} from "../dao/payment/paymentWriteDao.js";

import {
    synchronizeBookingPayment
} from "./bookingPaymentService.js";

function validateStripeResult(result, payment) {
    if (
        result?.stripeSessionId !== payment.stripeSessionId ||
        result.paymentId !== payment.id ||
        result.checkoutAttemptId !== payment.checkoutAttemptId ||
        result.bookingId !== String(payment.bookingId) ||
        result.amountCents !== payment.amountCents ||
        result.currency !== payment.currency ||
        !["open", "complete", "expired"].includes(
            result.sessionStatus
        ) ||
        !["paid", "unpaid", "no_payment_required"].includes(
            result.paymentStatus
        )
    ) {
        throw new Error(
            "Stripe reconciliation details do not match the payment."
        );
    }
}

export async function reconcileDuePaymentAttempt(
    payment,
    {
        request = fetch,
        paymentUrl = process.env.PAYMENT_URL ||
        "http://localhost:3004",
        transaction = withPaymentTransaction,
        findPayment = findPaymentByIdForUpdate,
        changeStatus = updatePaymentStatus,
        queueSync = queueBookingPaymentSync,
        now = Date.now
    } = {}
) {
    if (
        !["creating", "pending_payment"].includes(payment.status) ||
        new Date(payment.expiresAt).getTime() > now()
    ) {
        return false;
    }

    let targetStatus = null;
    let stripePaymentIntentId = null;

    if (
        payment.status === "creating" &&
        !payment.stripeSessionId
    ) {
        targetStatus = "expired";
    } else if (
        payment.status === "pending_payment" &&
        payment.stripeSessionId
    ) {
        const response = await request(
            new URL(
                `/internal/stripe/checkout/${payment.stripeSessionId}/reconcile`,
                paymentUrl
            ),
            {
                method: "POST",
                signal: AbortSignal.timeout(12000)
            }
        );

        if (!response.ok) {
            throw new Error(
                `Stripe reconciliation returned HTTP ${response.status}.`
            );
        }

        const result = await response.json();

        validateStripeResult(result, payment);

        if (
            result.sessionStatus === "complete" &&
            result.paymentStatus === "paid"
        ) {
            targetStatus = "paid";
            stripePaymentIntentId =
                result.stripePaymentIntentId ?? null;
        } else if (
            result.sessionStatus === "expired" &&
            result.paymentStatus === "unpaid"
        ) {
            targetStatus = "expired";
        } else {
            throw new Error(
                "Stripe Checkout has not reached a final supported outcome."
            );
        }
    } else {
        throw new Error(
            "Payment attempt has an inconsistent Checkout state."
        );
    }

    return transaction(async client => {
        const current = await findPayment(
            payment.id,
            client
        );

        if (
            !current ||
            !["creating", "pending_payment"].includes(current.status) ||
            new Date(current.expiresAt).getTime() > now() ||
            current.stripeSessionId !== payment.stripeSessionId
        ) {
            return false;
        }

        const updated = await changeStatus({
            paymentId: current.id,
            expectedStatus: current.status,
            status: targetStatus,
            stripePaymentIntentId
        }, client);

        if (!updated) {
            return false;
        }

        await queueSync(
            current.id,
            targetStatus,
            client
        );

        return true;
    });
}

export async function synchronizePendingBookingPayment(
    entry,
    {
        synchronize = synchronizeBookingPayment,
        markSynced = markBookingPaymentSynced,
        markFailed = markBookingPaymentSyncFailed
    } = {}
) {
    try {
        await synchronize(entry);

        await markSynced(
            entry.paymentId,
            entry.status
        );

        return true;
    } catch (error) {
        await markFailed(
            entry.paymentId,
            entry.status,
            error.message
        );

        throw error;
    }
}

export async function runPaymentReconciliationCycle({
    listDue = listDuePaymentAttempts,
    reconcile = reconcileDuePaymentAttempt,
    listPending = listPendingBookingPaymentSync,
    synchronize = synchronizePendingBookingPayment,
    finalizeEvents = finalizeSyncedWebhookEvents,
    logger = console,
    limit = 25
} = {}) {
    const duePayments = await listDue(limit);

    for (const payment of duePayments) {
        try {
            await reconcile(payment);
        } catch (error) {
            logger.error(
                `Could not reconcile payment ${payment.id}:`,
                error
            );
        }
    }

    const pendingBookings = await listPending(limit);

    for (const entry of pendingBookings) {
        try {
            await synchronize(entry);
        } catch (error) {
            logger.error(
                `Could not synchronize booking ${entry.bookingId}:`,
                error
            );
        }
    }

    await finalizeEvents();

    return {
        paymentsExamined: duePayments.length,
        bookingUpdatesExamined: pendingBookings.length
    };
}

export function startPaymentReconciliationWorker({
    intervalMs = 30000,
    run = runPaymentReconciliationCycle,
    logger = console
} = {}) {
    let running = false;
    let activeRun = Promise.resolve();

    function tick() {
        if (running) {
            return;
        }

        running = true;

        activeRun = Promise.resolve()
            .then(() => run())
            .catch(error => {
                logger.error(
                    "Payment reconciliation cycle failed:",
                    error
                );
            })
            .finally(() => {
                running = false;
            });
    }

    const timer = setInterval(tick, intervalMs);

    timer.unref?.();

    tick();

    return async function stop() {
        clearInterval(timer);
        await activeRun;
    };
}