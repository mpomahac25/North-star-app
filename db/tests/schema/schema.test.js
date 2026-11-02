import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

// List of tables expected in database
const expectedTables = [
    'users',
    'age_ratings',
    'movies',
    'theatres',
    'rooms',
    'screenings',
    'order_statuses',
    'orders',
    'reservation_statuses',
    'reservations'
].sort();

describe('Database Schema', () => {

    let client;
    let connected = false;
    let schemaName;

    // Setup before running tests
    beforeAll(async () => {
        const connectionString = process.env.DB_TEST_URL;

        if (!connectionString) {
            throw new Error('DB_TEST_URL is not configured');
        }

        // Make sure tests running against correct db
        const databaseName = decodeURIComponent(
            new URL(connectionString).pathname.slice(1)
        );

        if (databaseName !== 'rio_schema_test') {
            throw new Error('Database tests must use rio_schema_test');
        }

        const schemaPath = fileURLToPath(
            new URL('../../schema.sql', import.meta.url)
        );

        const schemaSql = await readFile(schemaPath, 'utf8');

        if (!schemaSql.trim()) {
            throw new Error('schema.sql is empty');
        }

        client = new Client({
            connectionString,
            connectionTimeoutMillis: 5000
        });

        await client.connect();
        connected = true;

        // Unique schema name to prevent name conflicts with previous runs (unlikely, but better safe than sorry)
        schemaName = `test_${randomUUID().replaceAll('-', '')}`;

        // Run inside transaction to be able to clean up with a ROLLBACK at the end
        await client.query('BEGIN');

        await client.query(`CREATE SCHEMA "${schemaName}"`);

        await client.query(
            `SET LOCAL search_path TO "${schemaName}", public`
        );

        await client.query(schemaSql);
    });

    // Teardown after tests done
    afterAll(async () => {
        if (connected) {
            try {
                await client.query('ROLLBACK');
            }
            finally {
                await client.end();
            }
        }
    });

    // Verify all tables were created as expected
    test('Database tables match the expected schema', async () => {
        const result = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = $1
              AND table_type = 'BASE TABLE'
        `, [schemaName]);

        const actualTables = result.rows
            .map(row => row.table_name)
            .sort();

        // Check if any tables are missing from database
        const missingTables = expectedTables.filter(
            table => !actualTables.includes(table)
        );

        // Check if any tables are missing from test array
        const unexpectedTables = actualTables.filter(
            table => !expectedTables.includes(table)
        );

        const errors = [];

        if (missingTables.length > 0) {
            errors.push(
                `Missing table(s): ${missingTables.join(', ')}.\n` +
                `Verify that these tables are correctly defined in schema.sql. ` +
                `If intentionally removed, update the expectedTables list.`
            );
        }

        if (unexpectedTables.length > 0) {
            errors.push(
                `New table(s) not covered by schema tests: ${unexpectedTables.join(', ')}.\n` +
                `Add these tables to expectedTables and update the relevant ` +
                `column, primary key, and foreign key tests.`
            );
        }

        // Print out details of failure if failed
        if (errors.length > 0) {
            throw new Error(
                `Database schema validation failed:\n\n${errors.join('\n\n')}`
            );
        }
    });

    // Verify all tables have PKs
    test('All tables have primary keys', async () => {
        const result = await client.query(`
            SELECT table_name
            FROM information_schema.table_constraints
            WHERE table_schema = $1
              AND constraint_type = 'PRIMARY KEY'
        `, [schemaName]);

        const tablesWithPrimaryKeys = result.rows.map(
            row => row.table_name
        );

        // Check if any tables are missing primary keys
        const missingPrimaryKeys = expectedTables.filter(
            table => !tablesWithPrimaryKeys.includes(table)
        );

        if (missingPrimaryKeys.length > 0) {
            throw new Error(
                `Missing primary key constraints in table(s): ` +
                `${missingPrimaryKeys.join(', ')}.\n` +
                `Every database table should have a primary key. ` +
                `Verify the table definitions in schema.sql.`
            );
        }
    });

    // Verify data types for specific columns
    test('Important columns have correct data types', async () => {
        const result = await client.query(`
            SELECT
                table_name,
                column_name,
                data_type,
                is_nullable,
                numeric_precision,
                numeric_scale
            FROM information_schema.columns
            WHERE table_schema = $1
        `, [schemaName]);

        expect(result.rows).toEqual(expect.arrayContaining([
            expect.objectContaining({
                table_name: 'users',
                column_name: 'email',
                data_type: 'character varying',
                is_nullable: 'NO'
            }),
            expect.objectContaining({
                table_name: 'movies',
                column_name: 'duration_minutes',
                data_type: 'integer',
                is_nullable: 'NO'
            }),
            expect.objectContaining({
                table_name: 'screenings',
                column_name: 'start_time',
                data_type: 'timestamp with time zone',
                is_nullable: 'NO'
            }),
            expect.objectContaining({
                table_name: 'screenings',
                column_name: 'ticket_price',
                data_type: 'numeric',
                numeric_precision: 8,
                numeric_scale: 2
            }),
            expect.objectContaining({
                table_name: 'reservations',
                column_name: 'price',
                data_type: 'numeric',
                is_nullable: 'NO'
            })
        ]));
    });

    // Verify FK relationships are OK
    test('Foreign key relationships are correct', async () => {
        const result = await client.query(`
            SELECT
                kcu.table_name,
                kcu.column_name,
                ccu.table_name AS referenced_table,
                ccu.column_name AS referenced_column
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_catalog = kcu.constraint_catalog
                AND tc.constraint_schema = kcu.constraint_schema
                AND tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
                ON tc.constraint_catalog = ccu.constraint_catalog
                AND tc.constraint_schema = ccu.constraint_schema
                AND tc.constraint_name = ccu.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = $1
        `, [schemaName]);

        const relationships = result.rows.map(row =>
            `${row.table_name}.${row.column_name} -> ${row.referenced_table}.${row.referenced_column}`
        );

        expect(relationships.sort()).toEqual([
            'movies.age_rating_id -> age_ratings.id',
            'rooms.theatre_id -> theatres.id',
            'screenings.movie_id -> movies.id',
            'screenings.room_id -> rooms.id',
            'orders.user_id -> users.id',
            'orders.status_id -> order_statuses.id',
            'reservations.order_id -> orders.id',
            'reservations.screening_id -> screenings.id',
            'reservations.status_id -> reservation_statuses.id'
        ].sort());
    });

});