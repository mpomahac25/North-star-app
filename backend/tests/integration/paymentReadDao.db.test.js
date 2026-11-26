import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import {
    findPaymentById,
    findPaymentByCheckoutAttemptId,
    findPaymentByStripeSessionId,
    listPaymentsByBookingId
} from "../../dao/payment/paymentReadDao.js";

const { Pool } = pg;

const databaseUrl = process.env.DB_TEST_URL;

if (!databaseUrl) {
    throw new Error(
        "DB_TEST_URL is required to run PostgreSQL integration tests."
    );
}

const schemaName = `payment_test_${randomUUID().replaceAll("-", "")}`;

const adminPool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000
});

const databasePool = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schemaName}`,
    connectionTimeoutMillis: 5000
});

let schemaCreated = false;

describe("Payment Read DAO with PostgreSQL", () => {
    beforeAll(async () => {
        await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
        schemaCreated = true;

        const migrationSql = await readFile(
            new URL("../../../db/migrations/V002__payment.sql", import.meta.url),
            "utf8"
        );

        await databasePool.query(migrationSql);
    });

    afterAll(async () => {
        try {
            await databasePool.end();
        } finally {
            try {
                if (schemaCreated) {
                    await adminPool.query(
                        `DROP SCHEMA "${schemaName}" CASCADE`
                    );
                }
            } finally {
                await adminPool.end();
            }
        }
    });

    async function insertPayment({
        bookingId,
        status = "creating",
        stripeSessionId = null,
        createdAt = "2026-11-20T12:00:00Z"
    }) {
        const id = randomUUID();
        const checkoutAttemptId = randomUUID();

        await databasePool.query(
            `INSERT INTO payment_attempts (
                id,
                booking_id,
                checkout_attempt_id,
                stripe_session_id,
                amount_cents,
                currency,
                status,
                expires_at,
                created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                id,
                bookingId,
                checkoutAttemptId,
                stripeSessionId,
                2500,
                "eur",
                status,
                "2026-11-20T12:10:00Z",
                createdAt
            ]
        );

        return {
            id,
            checkoutAttemptId,
            stripeSessionId
        };
    }

    test("finds a payment by its internal ID", async () => {
        const payment = await insertPayment({
            bookingId: 1001
        });

        const result = await findPaymentById(
            payment.id,
            databasePool
        );

        expect(result).toMatchObject({
            id: payment.id,
            bookingId: 1001,
            checkoutAttemptId: payment.checkoutAttemptId,
            amountCents: 2500,
            currency: "eur",
            status: "creating"
        });

        expect(result.expiresAt).toBeInstanceOf(Date);
    });

    test("finds a payment by checkout attempt ID", async () => {
        const payment = await insertPayment({
            bookingId: 1002
        });

        const result = await findPaymentByCheckoutAttemptId(
            payment.checkoutAttemptId,
            databasePool
        );

        expect(result.id).toBe(payment.id);
        expect(result.bookingId).toBe(1002);
    });

    test("finds a payment by Stripe Session ID", async () => {
        const payment = await insertPayment({
            bookingId: 1003,
            status: "pending_payment",
            stripeSessionId: "cs_test_payment_1003"
        });

        const result = await findPaymentByStripeSessionId(
            payment.stripeSessionId,
            databasePool
        );

        expect(result.id).toBe(payment.id);
        expect(result.stripeSessionId).toBe("cs_test_payment_1003");
        expect(result.status).toBe("pending_payment");
    });

    test("returns null when a payment does not exist", async () => {
        const unknownId = randomUUID();

        expect(
            await findPaymentById(unknownId, databasePool)
        ).toBeNull();

        expect(
            await findPaymentByCheckoutAttemptId(unknownId, databasePool)
        ).toBeNull();

        expect(
            await findPaymentByStripeSessionId(
                "cs_test_nonexistent",
                databasePool
            )
        ).toBeNull();
    });

    test("lists payment attempts newest first", async () => {
        const first = await insertPayment({
            bookingId: 1004,
            status: "expired",
            createdAt: "2026-11-20T12:00:00Z"
        });

        const second = await insertPayment({
            bookingId: 1004,
            status: "pending_payment",
            createdAt: "2026-11-20T12:15:00Z"
        });

        const results = await listPaymentsByBookingId(
            1004,
            databasePool
        );

        expect(results).toHaveLength(2);

        expect(results.map((payment) => payment.id)).toEqual([
            second.id,
            first.id
        ]);

        expect(results.map((payment) => payment.status)).toEqual([
            "pending_payment",
            "expired"
        ]);
    });

    test("returns an empty array for a booking without payments", async () => {
        const results = await listPaymentsByBookingId(
            9999,
            databasePool
        );

        expect(results).toEqual([]);
    });
});