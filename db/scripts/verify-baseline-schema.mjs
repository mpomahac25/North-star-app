import pg from 'pg';
import { isDeepStrictEqual } from 'node:util';

const connectionString = process.env.DB_RESTORE_URL;

if (!connectionString) {
    throw new Error('DB_RESTORE_URL is required');
}

const url = new URL(connectionString);

if (
    decodeURIComponent(url.pathname.slice(1)) !== 'rio_restore_test' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname)
) {
    throw new Error(
        'Baseline verification must run against the local rio_restore_test database'
    );
}

const sections = {
    tables: `
        SELECT
            c.relname AS name,
            c.relkind AS kind,
            c.relpersistence AS persistence,
            c.relrowsecurity AS row_security,
            c.relforcerowsecurity AS force_row_security
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relkind IN ('r', 'p')
          AND c.relname <> 'flyway_schema_history'
        ORDER BY c.relname
    `,

    columns: `
        SELECT
            c.relname AS table_name,
            a.attname AS column_name,
            format_type(a.atttypid, a.atttypmod) AS data_type,
            a.attnotnull AS not_null,
            a.attidentity AS identity_kind,
            a.attgenerated AS generated_kind,
            pg_get_expr(d.adbin, d.adrelid) AS default_expression
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid
            AND a.attnum > 0
            AND NOT a.attisdropped
        LEFT JOIN pg_attrdef d
            ON d.adrelid = c.oid
            AND d.adnum = a.attnum
        WHERE n.nspname = $1
          AND c.relkind IN ('r', 'p')
          AND c.relname <> 'flyway_schema_history'
        ORDER BY c.relname, a.attname
    `,

    constraints: `
        SELECT
            c.relname AS table_name,
            con.conname AS name,
            con.contype AS kind,
            pg_get_constraintdef(con.oid) AS definition,
            con.convalidated AS validated,
            con.condeferrable AS deferrable,
            con.condeferred AS initially_deferred
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname <> 'flyway_schema_history'
        ORDER BY c.relname, con.conname
    `,

    indexes: `
        SELECT
            tablename AS table_name,
            indexname AS name,
            indexdef AS definition
        FROM pg_indexes
        WHERE schemaname = $1
          AND tablename <> 'flyway_schema_history'
        ORDER BY tablename, indexname
    `,

    sequences: `
        SELECT
            c.relname AS name,
            s.seqtypid::regtype::text AS data_type,
            s.seqstart::text AS start_value,
            s.seqincrement::text AS increment_by,
            s.seqmin::text AS min_value,
            s.seqmax::text AS max_value,
            s.seqcache::text AS cache_size,
            s.seqcycle AS cycles,
            owner.relname AS owned_by_table,
            a.attname AS owned_by_column
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_sequence s ON s.seqrelid = c.oid
        LEFT JOIN pg_depend dep
            ON dep.objid = c.oid
            AND dep.classid = 'pg_class'::regclass
            AND dep.deptype IN ('a', 'i')
        LEFT JOIN pg_class owner ON owner.oid = dep.refobjid
        LEFT JOIN pg_attribute a
            ON a.attrelid = owner.oid
            AND a.attnum = dep.refobjsubid
        WHERE n.nspname = $1
        ORDER BY c.relname
    `,

    views: `
        SELECT
            viewname AS name,
            definition
        FROM pg_views
        WHERE schemaname = $1
        ORDER BY viewname
    `,

    triggers: `
        SELECT
            c.relname AS table_name,
            t.tgname AS name,
            pg_get_triggerdef(t.oid) AS definition,
            t.tgenabled AS enabled
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND NOT t.tgisinternal
        ORDER BY c.relname, t.tgname
    `,

    functions: `
        SELECT
            p.proname AS name,
            pg_get_function_identity_arguments(p.oid) AS arguments,
            pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = $1
        ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
    `
};

function normalize(value, schema) {
    if (typeof value === 'string') {
        return value
            .replaceAll(`"${schema}".`, 'SCHEMA.')
            .replaceAll(`${schema}.`, 'SCHEMA.');
    }

    if (Array.isArray(value)) {
        return value.map(item => normalize(item, schema));
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(
                ([key, item]) => [key, normalize(item, schema)]
            )
        );
    }

    return value;
}

const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 5000
});

await client.connect();

try {
    await client.query('SET search_path TO pg_catalog');

    let failures = 0;

    for (const [name, query] of Object.entries(sections)) {
        const actual = await client.query(query, ['public']);
        const expected = await client.query(query, ['baseline_expected']);

        const normalizedActual = normalize(actual.rows, 'public');
        const normalizedExpected = normalize(
            expected.rows,
            'baseline_expected'
        );

        if (isDeepStrictEqual(normalizedActual, normalizedExpected)) {
            console.log(
                `PASS ${name}: ${actual.rows.length} objects`
            );
            continue;
        }

        failures++;

        console.error(`FAIL ${name}: structures differ`);

        const actualEntries = new Set(
            normalizedActual.map(row => JSON.stringify(row))
        );

        const expectedEntries = new Set(
            normalizedExpected.map(row => JSON.stringify(row))
        );

        for (const entry of expectedEntries) {
            if (!actualEntries.has(entry)) {
                console.error(`  Missing or different: ${entry}`);
            }
        }

        for (const entry of actualEntries) {
            if (!expectedEntries.has(entry)) {
                console.error(`  Unexpected or different: ${entry}`);
            }
        }
    }

    if (failures > 0) {
        throw new Error(
            `Baseline verification failed in ${failures} sections`
        );
    }

    console.log('Baseline structure verification passed');
}
finally {
    await client.end();
}