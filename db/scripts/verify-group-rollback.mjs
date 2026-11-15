import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const connectionString = process.env.DB_TEST_URL;

if (!connectionString) {
    throw new Error('DB_TEST_URL is required');
}

const database = new URL(connectionString);
const databaseName = decodeURIComponent(database.pathname.slice(1));

if (
    databaseName !== 'rio_schema_test' ||
    !['localhost', '127.0.0.1'].includes(database.hostname)
) {
    throw new Error(
        'Rollback verification requires a local rio_schema_test database'
    );
}

const schema = `ci_rollback_${randomUUID().replaceAll('-', '')}`;

const directory = mkdtempSync(
    path.join(tmpdir(), 'rio-flyway-rollback-')
);

const dockerHost = process.platform === 'linux'
    ? '127.0.0.1'
    : 'host.docker.internal';

const dockerNetwork = process.platform === 'linux'
    ? ['--network', 'host']
    : [];

try {
    writeFileSync(
        path.join(directory, 'V001__create_probe.sql'),
        'CREATE TABLE flyway_transaction_probe (id INTEGER PRIMARY KEY);\n'
    );

    writeFileSync(
        path.join(directory, 'V002__force_failure.sql'),
        'CREATE TABLE flyway_failure_probe (id INTEGER PRIMARY KEY);\nSELECT 1 / 0;\n'
    );

    const flyway = spawnSync('docker', [
        'run',
        '--rm',
        ...dockerNetwork,
        '--mount',
        `type=bind,source=${directory},target=/flyway/sql,readonly`,
        '-e',
        `FLYWAY_URL=jdbc:postgresql://${dockerHost}:${database.port || '5432'}/${databaseName}`,
        '-e',
        `FLYWAY_USER=${decodeURIComponent(database.username)}`,
        '-e',
        `FLYWAY_PASSWORD=${decodeURIComponent(database.password)}`,
        process.env.FLYWAY_IMAGE || 'flyway/flyway:13.12.1',
        '-locations=filesystem:/flyway/sql',
        `-schemas=${schema}`,
        `-defaultSchema=${schema}`,
        '-baselineOnMigrate=false',
        '-cleanDisabled=true',
        '-validateMigrationNaming=true',
        '-group=true',
        '-executeInTransaction=true',
        '-mixed=false',
        'migrate'
    ], {
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024
    });

    if (flyway.error) {
        throw flyway.error;
    }

    if (flyway.status === 0) {
        throw new Error(
            'Flyway unexpectedly succeeded on a deliberately invalid migration'
        );
    }

    const output = `${flyway.stdout}\n${flyway.stderr}`;

    if (!/division by zero/i.test(output)) {
        throw new Error(
            `Flyway failed for an unexpected reason: ${output.slice(-2000)}`
        );
    }

    const client = new pg.Client({
        connectionString,
        connectionTimeoutMillis: 5000
    });

    await client.connect();

    try {
        const result = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = $1
              AND table_name IN (
                  'flyway_transaction_probe',
                  'flyway_failure_probe'
              )
        `, [schema]);

        if (result.rowCount !== 0) {
            throw new Error(
                `Grouped migration did not roll back: ${
                    result.rows.map(row => row.table_name)
                }`
            );
        }
    }
    finally {
        try {
            await client.query(
                `DROP SCHEMA IF EXISTS "${schema}" CASCADE`
            );
        }
        finally {
            await client.end();
        }
    }

    console.log('Flyway grouped transaction rollback verified.');
}
finally {
    rmSync(directory, {
        recursive: true,
        force: true
    });
}