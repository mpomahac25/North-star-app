import { randomUUID } from 'node:crypto';
import pg from 'pg';

const schemas = ['ci_fresh', 'ci_upgrade'];

function paymentValues(overrides = {}) {
    return {
        id: randomUUID(),
        booking_id: 900001,
        checkout_attempt_id: randomUUID(),
        amount_cents: 1250,
        currency: 'eur',
        expires_at: '2027-01-01T00:00:00Z',
        ...overrides
    };
}

function insertPayment(client, schema, overrides = {}) {
    const values = paymentValues(overrides);
    const columns = Object.keys(values);
    const placeholders = columns.map((_, index) => `$${index + 1}`);

    return client.query(
        `INSERT INTO ${schema}.payment_attempts (${columns.join(', ')})
         VALUES (${placeholders.join(', ')}) RETURNING *`,
        Object.values(values)
    );
}

function insertWebhook(client, schema, overrides = {}) {
    const values = {
        event_id: `evt_${randomUUID()}`,
        event_type: 'checkout.session.completed',
        ...overrides
    };

    const columns = Object.keys(values);
    const placeholders = columns.map((_, index) => `$${index + 1}`);

    return client.query(
        `INSERT INTO ${schema}.stripe_webhook_events (${columns.join(', ')})
         VALUES (${placeholders.join(', ')}) RETURNING *`,
        Object.values(values)
    );
}

describe.each(schemas)('V002 payment migration in %s', schema => {
    let client;

    beforeAll(async () => {
        const connectionString = process.env.DB_TEST_URL;

        if (
            !connectionString ||
            decodeURIComponent(new URL(connectionString).pathname.slice(1)) !== 'rio_schema_test'
        ) {
            throw new Error('Payment migration tests require rio_schema_test');
        }

        client = new pg.Client({
            connectionString,
            connectionTimeoutMillis: 5000
        });

        await client.connect();
    });

    afterAll(async () => {
        if (client) {
            await client.end();
        }
    });

    beforeEach(async () => {
        await client.query('BEGIN');
    });

    afterEach(async () => {
        await client.query('ROLLBACK');
    });

    test('creates both payment tables', async () => {
        const result = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = $1
              AND table_type = 'BASE TABLE'
              AND table_name IN ('payment_attempts', 'stripe_webhook_events')
            ORDER BY table_name
        `, [schema]);

        expect(result.rows.map(row => row.table_name)).toEqual([
            'payment_attempts',
            'stripe_webhook_events'
        ]);
    });

    test('creates both partial unique booking indexes', async () => {
        const result = await client.query(`
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = $1
              AND tablename = 'payment_attempts'
              AND indexname IN (
                  'payment_attempts_one_active_per_booking',
                  'payment_attempts_one_paid_per_booking'
              )
        `, [schema]);

        expect(result.rowCount).toBe(2);

        const indexes = Object.fromEntries(
            result.rows.map(row => [row.indexname, row.indexdef])
        );

        for (const definition of Object.values(indexes)) {
            expect(definition).toMatch(/CREATE UNIQUE INDEX/);
            expect(definition).toContain('booking_id');
            expect(definition).toContain('WHERE');
        }

        expect(indexes.payment_attempts_one_active_per_booking)
            .toContain('pending_payment');

        expect(indexes.payment_attempts_one_active_per_booking)
            .toContain('creating');

        expect(indexes.payment_attempts_one_paid_per_booking)
            .toContain('paid');
    });

    test('accepts a valid payment and linked webhook with defaults', async () => {
        const payment = await insertPayment(client, schema);

        expect(payment.rows[0].status).toBe('creating');
        expect(payment.rows[0].amount_cents).toBe(1250);

        const webhook = await insertWebhook(client, schema, {
            payment_id: payment.rows[0].id
        });

        expect(webhook.rows[0].payment_id).toBe(payment.rows[0].id);
        expect(webhook.rows[0].processing_status).toBe('received');
    });

    test('prevents creating and pending attempts for the same booking', async () => {
        await insertPayment(client, schema, {
            status: 'creating'
        });

        await expect(
            insertPayment(client, schema, {
                status: 'pending_payment'
            })
        ).rejects.toMatchObject({
            code: '23505'
        });
    });

    test('prevents multiple paid attempts for the same booking', async () => {
        await insertPayment(client, schema, {
            status: 'paid'
        });

        await expect(
            insertPayment(client, schema, {
                status: 'paid'
            })
        ).rejects.toMatchObject({
            code: '23505'
        });
    });

    test('permits multiple inactive attempts for the same booking', async () => {
        await insertPayment(client, schema, {
            status: 'expired'
        });

        const result = await insertPayment(client, schema, {
            status: 'failed'
        });

        expect(result.rowCount).toBe(1);
    });

    test.each([0, -1])(
        'rejects invalid payment amount %i',
        async amount => {
            await expect(
                insertPayment(client, schema, {
                    amount_cents: amount
                })
            ).rejects.toMatchObject({
                code: '23514'
            });
        }
    );

    test.each([
        ['EUR', '23514'],
        ['eu', '23514'],
        ['euro', '22001'],
        ['12a', '23514']
    ])(
        'rejects invalid currency %s',
        async (currency, expectedCode) => {
            await expect(
                insertPayment(client, schema, {
                    currency
                })
            ).rejects.toMatchObject({
                code: expectedCode
            });
        }
    );

    test('rejects an invalid payment status', async () => {
        await expect(
            insertPayment(client, schema, {
                status: 'refunded'
            })
        ).rejects.toMatchObject({
            code: '23514'
        });
    });

    test('requires an expiration timestamp', async () => {
        await expect(
            insertPayment(client, schema, {
                expires_at: null
            })
        ).rejects.toMatchObject({
            code: '23502'
        });
    });

    test('rejects duplicate checkout attempt identifiers', async () => {
        const checkoutId = randomUUID();

        await insertPayment(client, schema, {
            checkout_attempt_id: checkoutId
        });

        await expect(
            insertPayment(client, schema, {
                booking_id: 900002,
                checkout_attempt_id: checkoutId
            })
        ).rejects.toMatchObject({
            code: '23505'
        });
    });

    test.each([
        'stripe_session_id',
        'stripe_payment_intent_id'
    ])(
        'rejects duplicate %s',
        async column => {
            const value = `stripe_${randomUUID()}`;

            await insertPayment(client, schema, {
                [column]: value
            });

            await expect(
                insertPayment(client, schema, {
                    booking_id: 900002,
                    [column]: value
                })
            ).rejects.toMatchObject({
                code: '23505'
            });
        }
    );

    test('rejects duplicate Stripe webhook event identifiers', async () => {
        const eventId = `evt_${randomUUID()}`;

        await insertWebhook(client, schema, {
            event_id: eventId
        });

        await expect(
            insertWebhook(client, schema, {
                event_id: eventId
            })
        ).rejects.toMatchObject({
            code: '23505'
        });
    });

    test('rejects a webhook referencing a nonexistent payment', async () => {
        await expect(
            insertWebhook(client, schema, {
                payment_id: randomUUID()
            })
        ).rejects.toMatchObject({
            code: '23503'
        });
    });

    test('rejects an invalid webhook processing status', async () => {
        await expect(
            insertWebhook(client, schema, {
                processing_status: 'unknown'
            })
        ).rejects.toMatchObject({
            code: '23514'
        });
    });
});