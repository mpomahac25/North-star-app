import pg from "pg";

const schemas = ["ci_fresh", "ci_upgrade"];
const databaseUrl = process.env.DB_TEST_URL;

const firstStart = "2027-01-15T16:00:00Z";
const firstEnd = "2027-01-15T18:00:00Z";

describe.each(schemas)("V005 screening room occupancy in %s", (schema) => {
    let client;
    let movieId;
    let theatreId;
    let roomOneId;
    let roomTwoId;

    const insertScreening = (connection, roomId, startTime, endTime) =>
        connection.query(
            `INSERT INTO ${schema}.screenings
                (movie_id, room_id, start_time, end_time, ticket_price)
             VALUES ($1, $2, $3, $4, 13.00)
             RETURNING id`,
            [movieId, roomId, startTime, endTime],
        );

    beforeAll(async () => {
        if (!databaseUrl) throw new Error("DB_TEST_URL is required");

        client = new pg.Client({
            connectionString: databaseUrl,
            connectionTimeoutMillis: 5000,
        });

        await client.connect();

        const movie = await client.query(
            `INSERT INTO ${schema}.movies (title, duration_minutes)
             VALUES ('V005 Occupancy Test Movie', 120)
             RETURNING id`,
        );

        movieId = movie.rows[0].id;

        const theatre = await client.query(
            `INSERT INTO ${schema}.theatres (name, city, address)
             VALUES ('V005 Test Theatre', 'Oulu', 'Test Street 1')
             RETURNING id`,
        );

        theatreId = theatre.rows[0].id;

        const rooms = await client.query(
            `INSERT INTO ${schema}.rooms (theatre_id, name, capacity)
             VALUES ($1, 'Room 1', 100), ($1, 'Room 2', 100)
             RETURNING id, name`,
            [theatreId],
        );

        roomOneId = rooms.rows.find((row) => row.name === "Room 1").id;
        roomTwoId = rooms.rows.find((row) => row.name === "Room 2").id;
    }, 30000);

    afterAll(async () => {
        if (!client) return;

        try {
            if (roomOneId && roomTwoId) {
                await client.query(
                    `DELETE FROM ${schema}.screenings
                     WHERE room_id = ANY($1::integer[])`,
                    [[roomOneId, roomTwoId]],
                );

                await client.query(
                    `DELETE FROM ${schema}.rooms
                     WHERE id = ANY($1::integer[])`,
                    [[roomOneId, roomTwoId]],
                );
            }

            if (theatreId) {
                await client.query(
                    `DELETE FROM ${schema}.theatres WHERE id = $1`,
                    [theatreId],
                );
            }

            if (movieId) {
                await client.query(
                    `DELETE FROM ${schema}.movies WHERE id = $1`,
                    [movieId],
                );
            }
        } finally {
            await client.end();
        }
    }, 30000);

    beforeEach(async () => client.query("BEGIN"));
    afterEach(async () => client.query("ROLLBACK"));

    test("installs a valid exclusion constraint", async () => {
        const result = await client.query(
            `SELECT con.contype, con.convalidated
             FROM pg_constraint con
             JOIN pg_class cls ON cls.oid = con.conrelid
             JOIN pg_namespace ns ON ns.oid = cls.relnamespace
             WHERE ns.nspname = $1
               AND cls.relname = 'screenings'
               AND con.conname = 'screenings_room_occupancy_no_overlap'`,
            [schema],
        );

        expect(result.rows).toEqual([
            { contype: "x", convalidated: true },
        ]);
    });

    test("rejects two screenings at the same time in one room", async () => {
        await insertScreening(client, roomOneId, firstStart, firstEnd);

        await expect(
            insertScreening(client, roomOneId, firstStart, firstEnd),
        ).rejects.toMatchObject({ code: "23P01" });
    });

    test("rejects a start 44 minutes after the previous movie ends", async () => {
        await insertScreening(client, roomOneId, firstStart, firstEnd);

        await expect(
            insertScreening(
                client,
                roomOneId,
                "2027-01-15T18:44:00Z",
                "2027-01-15T20:44:00Z",
            ),
        ).rejects.toMatchObject({ code: "23P01" });
    });

    test("allows a start exactly 45 minutes after the previous movie ends", async () => {
        await insertScreening(client, roomOneId, firstStart, firstEnd);

        const second = await insertScreening(
            client,
            roomOneId,
            "2027-01-15T18:45:00Z",
            "2027-01-15T20:45:00Z",
        );

        expect(second.rowCount).toBe(1);
    });

    test("allows simultaneous screenings in different rooms", async () => {
        await insertScreening(client, roomOneId, firstStart, firstEnd);

        const other = await insertScreening(
            client,
            roomTwoId,
            firstStart,
            firstEnd,
        );

        expect(other.rowCount).toBe(1);
    });

    test("rejects an update that introduces an overlap", async () => {
        await insertScreening(client, roomOneId, firstStart, firstEnd);

        const second = await insertScreening(
            client,
            roomOneId,
            "2027-01-15T21:00:00Z",
            "2027-01-15T23:00:00Z",
        );

        await expect(
            client.query(
                `UPDATE ${schema}.screenings
                 SET start_time = $1, end_time = $2
                 WHERE id = $3`,
                [
                    "2027-01-15T18:44:00Z",
                    "2027-01-15T20:44:00Z",
                    second.rows[0].id,
                ],
            ),
        ).rejects.toMatchObject({ code: "23P01" });
    });

    test("allows only one of two concurrent conflicting inserts", async () => {
        const one = new pg.Client({ connectionString: databaseUrl });
        const two = new pg.Client({ connectionString: databaseUrl });

        try {
            await Promise.all([one.connect(), two.connect()]);

            const results = await Promise.allSettled([
                insertScreening(one, roomOneId, firstStart, firstEnd),
                insertScreening(two, roomOneId, firstStart, firstEnd),
            ]);

            expect(
                results.filter((result) => result.status === "fulfilled"),
            ).toHaveLength(1);

            expect(
                results.filter((result) => result.status === "rejected"),
            ).toHaveLength(1);

            const failure = results.find(
                (result) => result.status === "rejected",
            );

            expect(failure.reason).toMatchObject({ code: "23P01" });
        } finally {
            await Promise.allSettled([one.end(), two.end()]);
        }
    }, 20000);
});