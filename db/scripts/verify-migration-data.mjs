import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';

const [operation, snapshotPath] = process.argv.slice(2);
const connectionString = process.env.DB_TEST_URL;
const schema = 'ci_upgrade';

if (!['capture', 'verify'].includes(operation) || !snapshotPath) {
    throw new Error('Usage: node verify-migration-data.mjs <capture|verify> <snapshot-path>');
}

if (!connectionString) {
    throw new Error('DB_TEST_URL is required');
}

const url = new URL(connectionString);

if (
    decodeURIComponent(url.pathname.slice(1)) !== 'rio_schema_test' ||
    !['localhost', '127.0.0.1'].includes(url.hostname)
) {
    throw new Error('Data-preservation checks require a local rio_schema_test database');
}

function quoteIdentifier(name) {
    return `"${name.replaceAll('"', '""')}"`;
}

const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 5000
});

async function tableNames() {
    const result = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_type = 'BASE TABLE'
          AND table_name <> 'flyway_schema_history'
        ORDER BY table_name
    `, [schema]);

    return result.rows.map(row => row.table_name);
}

async function primaryKey(table) {
    const result = await client.query(`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_catalog = tc.constraint_catalog
         AND kcu.constraint_schema = tc.constraint_schema
         AND kcu.constraint_name = tc.constraint_name
        WHERE tc.table_schema = $1
          AND tc.table_name = $2
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position
    `, [schema, table]);

    const columns = result.rows.map(row => row.column_name);

    if (columns.length === 0) {
        throw new Error(`Table ${table} has no primary key`);
    }

    return columns;
}

async function columnNames(table) {
    const result = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
        ORDER BY ordinal_position
    `, [schema, table]);

    return result.rows.map(row => row.column_name);
}

async function readRows(table) {
    const result = await client.query(`
        SELECT to_jsonb(t) AS record_data
        FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)} AS t
    `);

    return result.rows.map(row => row.record_data);
}

function rowKey(row, columns) {
    return JSON.stringify(columns.map(column => row[column]));
}

await client.connect();

try {
    if (operation === 'capture') {
        const snapshot = {
            schema,
            tables: {}
        };

        let totalRows = 0;

        for (const table of await tableNames()) {
            const primaryKeyColumns = await primaryKey(table);
            const columns = await columnNames(table);
            const rows = await readRows(table);

            snapshot.tables[table] = {
                primaryKeyColumns,
                columns,
                rows
            };

            totalRows += rows.length;
        }

        if (Object.keys(snapshot.tables).length === 0 || totalRows === 0) {
            throw new Error('Migration fixture contains no records');
        }

        await writeFile(
            snapshotPath,
            `${JSON.stringify(snapshot, null, 2)}\n`
        );

        console.log(
            `Captured ${totalRows} existing records from ${schema}`
        );
    }
    else {
        const snapshot = JSON.parse(
            await readFile(snapshotPath, 'utf8')
        );

        if (snapshot.schema !== schema || !snapshot.tables) {
            throw new Error('Invalid migration snapshot');
        }

        const actualTables = new Set(await tableNames());
        const problems = [];
        let checked = 0;

        for (const [table, previous] of Object.entries(snapshot.tables)) {
            if (!actualTables.has(table)) {
                problems.push(`Table removed: ${table}`);
                continue;
            }

            const currentPrimaryKey = await primaryKey(table);
            const currentColumns = await columnNames(table);

            if (!isDeepStrictEqual(
                currentPrimaryKey,
                previous.primaryKeyColumns
            )) {
                problems.push(`Primary key changed: ${table}`);
            }

            for (const column of previous.columns) {
                if (!currentColumns.includes(column)) {
                    problems.push(`Column removed: ${table}.${column}`);
                }
            }

            const currentRows = new Map(
                (await readRows(table)).map(row => [
                    rowKey(row, previous.primaryKeyColumns),
                    row
                ])
            );

            for (const previousRow of previous.rows) {
                checked++;

                const key = rowKey(
                    previousRow,
                    previous.primaryKeyColumns
                );

                const currentRow = currentRows.get(key);

                if (!currentRow) {
                    problems.push(
                        `Existing row missing: ${table}, key ${key}`
                    );
                    continue;
                }

                for (const [column, value] of Object.entries(previousRow)) {
                    if (!isDeepStrictEqual(currentRow[column], value)) {
                        problems.push(
                            `Existing value changed: ${table}, ` +
                            `key ${key}, column ${column}`
                        );
                    }
                }
            }
        }

        if (problems.length) {
            throw new Error(
                `Migration data-preservation check failed:\n` +
                problems.slice(0, 25).join('\n')
            );
        }

        console.log(
            `Verified ${checked} original records and their existing values`
        );
    }
}
finally {
    await client.end();
}