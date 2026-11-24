import pg from "pg";

const schemas = ["ci_fresh", "ci_upgrade"];

describe.each(schemas)("V003 movie IMDb ID migration in %s", (schema) => {
    let client;

    beforeAll(async () => {
        const connectionString = process.env.DB_TEST_URL;

        if (!connectionString) {
            throw new Error('DB_TEST_URL is required');
        }

        client = new pg.Client({
            connectionString,
            connectionTimeoutMillis: 5000,
        });

        await client.connect();
    });

    afterAll(async () => {
        if (client) {
            await client.end();
        }
    });

    beforeEach(async () => {
        await client.query("BEGIN");
    });

    afterEach(async () => {
        await client.query("ROLLBACK");
    });

    test("adds a nullable IMDb ID and preserves existing movies", async () => {
        const column = await client.query(
            `
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = 'movies'
              AND column_name = 'imdb_id'
        `,
            [schema],
        );

        expect(column.rows).toEqual([
            { data_type: "character varying", is_nullable: "YES" },
        ]);

        if (schema === "ci_upgrade") {
            const existingMovie = await client.query(
                `SELECT title, release_year, imdb_id
                 FROM ${schema}.movies
                 WHERE id = 900001`,
            );

            expect(existingMovie.rows).toEqual([
                {
                    title: "Migration Test Movie",
                    release_year: 2024,
                    imdb_id: null,
                },
            ]);
        }
    });

    test("enforces IMDb ID uniqueness while allowing multiple unimported movies", async () => {
        await client.query(`
            INSERT INTO ${schema}.movies (title, duration_minutes)
            VALUES ('Unimported Movie A', 100), ('Unimported Movie B', 100)
        `);

        await client.query(`
            INSERT INTO ${schema}.movies (imdb_id, title, duration_minutes)
            VALUES ('tt9000001', 'Imported Movie A', 100)
        `);

        await expect(
            client.query(`
            INSERT INTO ${schema}.movies (imdb_id, title, duration_minutes)
            VALUES ('tt9000001', 'Imported Movie B', 100)
        `),
        ).rejects.toMatchObject({ code: "23505" });
    });
});
