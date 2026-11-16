import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const migrationsPath = fileURLToPath(
    new URL('../../migrations/', import.meta.url)
);

const migrationFiles = readdirSync(migrationsPath)
    .filter(name => /^V\d+__[A-Za-z0-9_]+\.sql$/.test(name));

describe('Database Migrations', () => {

    let client;

    beforeAll(async () => {
        const connectionString = process.env.DB_TEST_URL;

        if (!connectionString) {
            throw new Error('DB_TEST_URL is required');
        }

        const databaseName = decodeURIComponent(
            new URL(connectionString).pathname.slice(1)
        );

        if (databaseName !== 'rio_schema_test') {
            throw new Error('Unexpected migration test database');
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

    test('Fresh and upgraded schemas are identical', async () => {
        async function getColumns(schema) {
            const result = await client.query(`
                SELECT
                    table_name,
                    column_name,
                    data_type,
                    is_nullable
                FROM information_schema.columns
                WHERE table_schema = $1
                  AND table_name <> 'flyway_schema_history'
                ORDER BY table_name, ordinal_position
            `, [schema]);

            return result.rows;
        }

        const fresh = await getColumns('ci_fresh');
        const upgraded = await getColumns('ci_upgrade');

        expect(fresh.length).toBeGreaterThan(0);
        expect(upgraded).toEqual(fresh);
    });

    test('Existing records survive migrations', async () => {
        const result = await client.query(`
            SELECT
                u.username,
                m.title,
                m.release_year,
                r.seat_row,
                r.seat_number,
                r.price
            FROM ci_upgrade.reservations r
            JOIN ci_upgrade.orders o
                ON o.id = r.order_id
            JOIN ci_upgrade.users u
                ON u.id = o.user_id
            JOIN ci_upgrade.screenings s
                ON s.id = r.screening_id
            JOIN ci_upgrade.movies m
                ON m.id = s.movie_id
            WHERE r.id = 900001
        `);

        expect(result.rows).toHaveLength(1);

        expect(result.rows[0]).toEqual({
            username: 'migration_test_user',
            title: 'Migration Test Movie',
            release_year: 2024,
            seat_row: 1,
            seat_number: 1,
            price: '12.50'
        });
    });

    test('All migration files were successfully applied', async () => {
        for (const schema of ['ci_fresh', 'ci_upgrade']) {
            const result = await client.query(`
                SELECT version, success
                FROM ${schema}.flyway_schema_history
                WHERE version IS NOT NULL
            `);

            expect(result.rows).toHaveLength(migrationFiles.length);

            expect(
                result.rows.every(row => row.success === true)
            ).toBe(true);
        }
    });

    test('Release year constraint rejects invalid values', async () => {
        await expect(
            client.query(`
                INSERT INTO ci_upgrade.movies (
                    title,
                    duration_minutes,
                    release_year
                )
                VALUES (
                    'Invalid Migration Test Movie',
                    120,
                    1800
                )
            `)
        ).rejects.toMatchObject({
            code: '23514'
        });
    });

});