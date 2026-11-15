import pg from 'pg';

const sections = {
    tables: `
        SELECT
            c.relname AS name,
            c.relkind AS kind,
            c.relpersistence AS persistence,
            c.relrowsecurity AS row_security
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
            a.attnum AS position,
            a.attname AS column_name,
            format_type(a.atttypid, a.atttypmod) AS data_type,
            a.attnotnull AS not_null,
            pg_get_expr(d.adbin, d.adrelid) AS default_expression,
            a.attidentity AS identity_kind,
            a.attgenerated AS generated_kind
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
        ORDER BY c.relname, a.attnum
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
            s.seqcycle AS cycles
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_sequence s ON s.seqrelid = c.oid
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

describe('Final database structure', () => {
    let client;

    beforeAll(async () => {
        const connectionString = process.env.DB_TEST_URL;

        if (!connectionString) {
            throw new Error('DB_TEST_URL is required');
        }

        const url = new URL(connectionString);
        const databaseName = decodeURIComponent(
            url.pathname.slice(1)
        );

        if (
            databaseName !== 'rio_schema_test' ||
            !['localhost', '127.0.0.1'].includes(url.hostname)
        ) {
            throw new Error(
                'Structure tests require a local rio_schema_test database'
            );
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

    test.each(Object.entries(sections))(
        '%s matches between fresh and upgraded databases',
        async (section, sql) => {
            const fresh = await client.query(sql, ['ci_fresh']);
            const upgraded = await client.query(sql, ['ci_upgrade']);

            if (!['views', 'triggers'].includes(section)) {
                expect(fresh.rows.length).toBeGreaterThan(0);
            }

            const normalizedFresh = normalize(
                fresh.rows,
                'ci_fresh'
            );

            const normalizedUpgraded = normalize(
                upgraded.rows,
                'ci_upgrade'
            );

            expect(normalizedUpgraded).toEqual(normalizedFresh);
        }
    );
});