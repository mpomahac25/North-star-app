import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const connectionString = process.env.DB_TEST_URL;

if (!connectionString) {
    throw new Error('DB_TEST_URL is required');
}

const fixturePath = fileURLToPath(
    new URL('../tests/migrations/fixtures/existing-data.sql', import.meta.url)
);

const sql = readFileSync(fixturePath, 'utf8');

const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 5000
});

await client.connect();

try {
    const schemaCheck = await client.query(
        "SELECT to_regclass('ci_upgrade.movies') AS movies"
    );

    if (!schemaCheck.rows[0].movies) {
        throw new Error(
            'The ci_upgrade schema has not been initialized.'
        );
    }

    await client.query('BEGIN');

    await client.query(
        'SET LOCAL search_path TO ci_upgrade'
    );

    await client.query(sql);

    await client.query('COMMIT');

    console.log('Migration test data initialized successfully.');
}
catch (error) {
    await client.query('ROLLBACK');
    throw error;
}
finally {
    await client.end();
}