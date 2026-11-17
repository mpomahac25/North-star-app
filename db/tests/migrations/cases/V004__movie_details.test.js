import pg from "pg";

const schemas = ["ci_fresh", "ci_upgrade"];

describe.each(schemas)("V004 movie details migration in %s", (schema) => {
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

    test("adds the movie metadata columns", async () => {
        const result = await client.query(
            `
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = 'movies'
              AND column_name IN (
                  'release_date',
                  'country',
                  'awards',
                  'imdb_rating',
                  'imdb_votes',
                  'box_office'
              )
            ORDER BY column_name
            `,
            [schema],
        );

        expect(result.rows).toEqual([
            { column_name: "awards", data_type: "text", is_nullable: "YES" },
            { column_name: "box_office", data_type: "text", is_nullable: "YES" },
            { column_name: "country", data_type: "text", is_nullable: "YES" },
            { column_name: "imdb_rating", data_type: "numeric", is_nullable: "YES" },
            { column_name: "imdb_votes", data_type: "integer", is_nullable: "YES" },
            { column_name: "release_date", data_type: "date", is_nullable: "YES" },
        ]);
    });

    test("creates the six relational metadata tables", async () => {
        const result = await client.query(
            `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = $1
              AND table_type = 'BASE TABLE'
              AND table_name IN (
                  'genres',
                  'movie_genres',
                  'people',
                  'movie_credits',
                  'languages',
                  'movie_languages'
              )
            ORDER BY table_name
            `,
            [schema],
        );

        expect(result.rows.map((row) => row.table_name)).toEqual([
            "genres",
            "languages",
            "movie_credits",
            "movie_genres",
            "movie_languages",
            "people",
        ]);
    });

    test("stores movie metadata and relationships", async () => {
        const movie = await client.query(
            `
            INSERT INTO ${schema}.movies (
                title,
                duration_minutes,
                release_year,
                release_date,
                country,
                awards,
                imdb_rating,
                imdb_votes,
                box_office
            )
            VALUES (
                'Drive',
                100,
                2011,
                '2011-09-16',
                'United States',
                'Nominated for 1 Oscar',
                7.8,
                775952,
                '$35,061,555'
            )
            RETURNING id
            `,
        );

        const movieId = movie.rows[0].id;

        const genre = await client.query(
            `INSERT INTO ${schema}.genres (name)
             VALUES ('Action')
             RETURNING id`,
        );

        const person = await client.query(
            `INSERT INTO ${schema}.people (name)
             VALUES ('Ryan Gosling')
             RETURNING id`,
        );

        const language = await client.query(
            `INSERT INTO ${schema}.languages (name)
             VALUES ('English')
             RETURNING id`,
        );

        await client.query(
            `INSERT INTO ${schema}.movie_genres
             (movie_id, genre_id, display_order)
             VALUES ($1, $2, 1)`,
            [movieId, genre.rows[0].id],
        );

        await client.query(
            `INSERT INTO ${schema}.movie_credits
             (movie_id, person_id, credit_type, display_order)
             VALUES ($1, $2, 'actor', 1)`,
            [movieId, person.rows[0].id],
        );

        await client.query(
            `INSERT INTO ${schema}.movie_languages
             (movie_id, language_id, display_order)
             VALUES ($1, $2, 1)`,
            [movieId, language.rows[0].id],
        );

        const result = await client.query(
            `
            SELECT
                m.title,
                m.imdb_rating,
                m.imdb_votes,
                g.name AS genre,
                p.name AS actor,
                mc.credit_type,
                l.name AS language
            FROM ${schema}.movies m
            JOIN ${schema}.movie_genres mg ON mg.movie_id = m.id
            JOIN ${schema}.genres g ON g.id = mg.genre_id
            JOIN ${schema}.movie_credits mc ON mc.movie_id = m.id
            JOIN ${schema}.people p ON p.id = mc.person_id
            JOIN ${schema}.movie_languages ml ON ml.movie_id = m.id
            JOIN ${schema}.languages l ON l.id = ml.language_id
            WHERE m.id = $1
            `,
            [movieId],
        );

        expect(result.rows).toEqual([
            {
                title: "Drive",
                imdb_rating: "7.8",
                imdb_votes: 775952,
                genre: "Action",
                actor: "Ryan Gosling",
                credit_type: "actor",
                language: "English",
            },
        ]);
    });

    test.each([
        ["imdb_rating", -0.1],
        ["imdb_rating", 10.1],
        ["imdb_votes", -1],
    ])("rejects invalid %s value %s", async (column, value) => {
        await expect(
            client.query(
                `
                INSERT INTO ${schema}.movies (
                    title,
                    duration_minutes,
                    ${column}
                )
                VALUES ('Invalid Metadata Movie', 100, $1)
                `,
                [value],
            ),
        ).rejects.toMatchObject({
            code: "23514",
        });
    });

    test("preserves existing movie records", async () => {
        if (schema !== "ci_upgrade") {
            return;
        }

        const result = await client.query(
            `
            SELECT
                id,
                title,
                release_year,
                release_date,
                imdb_rating,
                imdb_votes
            FROM ${schema}.movies
            WHERE id = 900001
            `,
        );

        expect(result.rows).toEqual([
            {
                id: 900001,
                title: "Migration Test Movie",
                release_year: 2024,
                release_date: null,
                imdb_rating: null,
                imdb_votes: null,
            },
        ]);
    });
});