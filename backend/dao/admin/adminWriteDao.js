import { pool } from "../../db/pool.js";

const BASE_TICKET_PRICE = 13.0;
const PREMIERE_TICKET_PRICE = 14.95;

function isScreeningOverlapError(error) {
    return (
        error?.code === "23P01" &&
        error?.constraint === "screenings_room_occupancy_no_overlap"
    );
}

function isUniqueViolationError(error) {
    return error?.code === "23505";
}

function mapScreeningRow(row) {
    const ticketPrice = Number(row.ticket_price);
    return {
        id: row.id,
        movieId: row.movie_id,
        movieTitle: row.movie_title,
        city: row.city,
        roomName: row.room_name,
        capacity: row.capacity,
        date: row.date,
        startTime: row.start_time,
        ticketPrice,
        isFirstScreening: ticketPrice > BASE_TICKET_PRICE,
    };
}

function mapTheatreRow(row, rooms = []) {
    return {
        id: row.id,
        name: row.name,
        city: row.city,
        address: row.address,
        timezone: row.timezone,
        rooms,
    };
}

function mapRoomRow(row) {
    return {
        id: row.id,
        theatreId: row.theatre_id,
        name: row.name,
        capacity: row.capacity,
    };
}

async function resolveRoomAndWindow(client, { movieId, city, roomName, date, startTime }) {
    const roomRes = await client.query(
        `SELECT r.id AS room_id, r.capacity AS room_capacity, t.timezone
         FROM rooms r
         JOIN theatres t ON t.id = r.theatre_id
         WHERE LOWER(t.city) = LOWER($1) AND LOWER(r.name) = LOWER($2)
         ORDER BY t.id ASC, r.id ASC
         LIMIT 1`,
        [city, roomName],
    );

    if (roomRes.rows.length === 0) {
        return { error: "ROOM_NOT_FOUND" };
    }

    const { room_id: roomId, room_capacity: roomCapacity, timezone } = roomRes.rows[0];
    const localTimestamp = `${date} ${startTime}:00`;

    const windowRes = await client.query(
        `SELECT
            ($1::timestamp AT TIME ZONE $2) AS start_ts,
            ($1::timestamp AT TIME ZONE $2) + (m.duration_minutes * INTERVAL '1 minute') AS end_ts
         FROM movies m
         WHERE m.id = $3`,
        [localTimestamp, timezone, movieId],
    );

    if (windowRes.rows.length === 0) {
        return { error: "MOVIE_NOT_FOUND" };
    }

    return {
        roomId,
        roomCapacity,
        startTs: windowRes.rows[0].start_ts,
        endTs: windowRes.rows[0].end_ts,
    };
}

async function findScreeningById(client, screeningId) {
    const result = await client.query(
        `SELECT
            s.id,
            s.movie_id,
            m.title AS movie_title,
            t.city,
            r.name AS room_name,
            r.capacity,
            TO_CHAR(s.start_time AT TIME ZONE t.timezone, 'YYYY-MM-DD') AS date,
            TO_CHAR(s.start_time AT TIME ZONE t.timezone, 'HH24:MI') AS start_time,
            s.ticket_price
         FROM screenings s
         JOIN movies m ON m.id = s.movie_id
         JOIN rooms r ON r.id = s.room_id
         JOIN theatres t ON t.id = r.theatre_id
         WHERE s.id = $1`,
        [screeningId],
    );

    return result.rows[0] ? mapScreeningRow(result.rows[0]) : null;
}

async function countActiveSoldSeats(client, screeningId) {
    const soldRes = await client.query(
        `SELECT COUNT(*)::INTEGER AS sold_count
         FROM reservations res
         JOIN reservation_statuses rs ON rs.id = res.status_id
         WHERE res.screening_id = $1
           AND NOT (res.seat_row = 1 AND res.seat_number = 1)
           AND rs.name <> 'cancelled'`,
        [screeningId],
    );

    return soldRes.rows[0].sold_count;
}

export async function insertAdminTheatre(
    { name, city, address, timezone = "Europe/Helsinki" },
    database = pool,
) {
    const client = await database.connect();

    try {
        await client.query("BEGIN");

        const duplicateRes = await client.query(
            `SELECT id
             FROM theatres
             WHERE LOWER(city) = LOWER($1) AND LOWER(name) = LOWER($2)
             LIMIT 1`,
            [city, name],
        );
        if (duplicateRes.rows.length > 0) {
            await client.query("ROLLBACK");
            return { error: "THEATRE_ALREADY_EXISTS" };
        }

        const insertRes = await client.query(
            `INSERT INTO theatres (name, city, address, timezone)
             VALUES ($1, $2, $3, $4)
             RETURNING id, name, city, address, timezone`,
            [name, city, address, timezone],
        );

        await client.query("COMMIT");
        return { theatre: mapTheatreRow(insertRes.rows[0], []) };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function updateAdminTheatreById(
    theatreId,
    { name, city, address, timezone = "Europe/Helsinki" },
    database = pool,
) {
    const client = await database.connect();

    try {
        await client.query("BEGIN");

        const existingRes = await client.query(
            `SELECT id FROM theatres WHERE id = $1`,
            [theatreId],
        );
        if (existingRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return { error: "THEATRE_NOT_FOUND" };
        }

        const duplicateRes = await client.query(
            `SELECT id
             FROM theatres
             WHERE id <> $1 AND LOWER(city) = LOWER($2) AND LOWER(name) = LOWER($3)
             LIMIT 1`,
            [theatreId, city, name],
        );
        if (duplicateRes.rows.length > 0) {
            await client.query("ROLLBACK");
            return { error: "THEATRE_ALREADY_EXISTS" };
        }

        const updateRes = await client.query(
            `UPDATE theatres
             SET name = $1, city = $2, address = $3, timezone = $4
             WHERE id = $5
             RETURNING id, name, city, address, timezone`,
            [name, city, address, timezone, theatreId],
        );

        const roomsRes = await client.query(
            `SELECT id, theatre_id, name, capacity
             FROM rooms
             WHERE theatre_id = $1
             ORDER BY name ASC, id ASC`,
            [theatreId],
        );

        await client.query("COMMIT");
        return {
            theatre: mapTheatreRow(updateRes.rows[0], roomsRes.rows.map(mapRoomRow)),
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function deleteAdminTheatreById(theatreId, database = pool) {
    const client = await database.connect();

    try {
        await client.query("BEGIN");

        const existingRes = await client.query(
            `SELECT id FROM theatres WHERE id = $1`,
            [theatreId],
        );
        if (existingRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return { error: "THEATRE_NOT_FOUND" };
        }

        const screeningsRes = await client.query(
            `SELECT EXISTS (
                SELECT 1
                FROM screenings s
                JOIN rooms r ON r.id = s.room_id
                WHERE r.theatre_id = $1
            ) AS has_screenings`,
            [theatreId],
        );
        if (screeningsRes.rows[0].has_screenings) {
            await client.query("ROLLBACK");
            return { error: "THEATRE_HAS_SCREENINGS" };
        }

        await client.query(`DELETE FROM rooms WHERE theatre_id = $1`, [theatreId]);
        await client.query(`DELETE FROM theatres WHERE id = $1`, [theatreId]);

        await client.query("COMMIT");
        return { deleted: true, id: theatreId };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function insertAdminRoom(theatreId, { name, capacity }, database = pool) {
    const client = await database.connect();

    try {
        await client.query("BEGIN");

        const theatreRes = await client.query(
            `SELECT id FROM theatres WHERE id = $1`,
            [theatreId],
        );
        if (theatreRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return { error: "THEATRE_NOT_FOUND" };
        }

        const dupRes = await client.query(
            `SELECT id
             FROM rooms
             WHERE theatre_id = $1 AND LOWER(name) = LOWER($2)
             LIMIT 1`,
            [theatreId, name],
        );
        if (dupRes.rows.length > 0) {
            await client.query("ROLLBACK");
            return { error: "ROOM_ALREADY_EXISTS" };
        }

        const insertRes = await client.query(
            `INSERT INTO rooms (theatre_id, name, capacity)
             VALUES ($1, $2, $3)
             RETURNING id, theatre_id, name, capacity`,
            [theatreId, name, capacity],
        );

        await client.query("COMMIT");
        return { room: mapRoomRow(insertRes.rows[0]) };
    } catch (error) {
        await client.query("ROLLBACK");
        if (isUniqueViolationError(error)) {
            return { error: "ROOM_ALREADY_EXISTS" };
        }
        throw error;
    } finally {
        client.release();
    }
}

export async function updateAdminRoomById(roomId, { name, capacity }, database = pool) {
    const client = await database.connect();

    try {
        await client.query("BEGIN");

        const existingRes = await client.query(
            `SELECT id, theatre_id FROM rooms WHERE id = $1`,
            [roomId],
        );
        if (existingRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return { error: "ROOM_NOT_FOUND" };
        }

        const theatreId = existingRes.rows[0].theatre_id;

        const dupRes = await client.query(
            `SELECT id
             FROM rooms
             WHERE theatre_id = $1 AND id <> $2 AND LOWER(name) = LOWER($3)
             LIMIT 1`,
            [theatreId, roomId, name],
        );
        if (dupRes.rows.length > 0) {
            await client.query("ROLLBACK");
            return { error: "ROOM_ALREADY_EXISTS" };
        }

        const maxSoldRes = await client.query(
            `SELECT COALESCE(MAX(sold_per_screening), 0)::INTEGER AS max_sold
             FROM (
                 SELECT COUNT(res.id) AS sold_per_screening
                 FROM screenings s
                 LEFT JOIN reservations res
                    ON res.screening_id = s.id
                   AND NOT (res.seat_row = 1 AND res.seat_number = 1)
                 LEFT JOIN reservation_statuses rs
                    ON rs.id = res.status_id
                 WHERE s.room_id = $1
                   AND (res.id IS NULL OR rs.name <> 'cancelled')
                 GROUP BY s.id
             ) counts`,
            [roomId],
        );

        const maxSold = maxSoldRes.rows[0].max_sold;
        const maxGuestSeats = Math.max(0, capacity - 1);
        if (maxSold > maxGuestSeats) {
            await client.query("ROLLBACK");
            return { error: "ROOM_CAPACITY_EXCEEDED" };
        }

        const updateRes = await client.query(
            `UPDATE rooms
             SET name = $1, capacity = $2
             WHERE id = $3
             RETURNING id, theatre_id, name, capacity`,
            [name, capacity, roomId],
        );

        await client.query("COMMIT");
        return { room: mapRoomRow(updateRes.rows[0]) };
    } catch (error) {
        await client.query("ROLLBACK");
        if (isUniqueViolationError(error)) {
            return { error: "ROOM_ALREADY_EXISTS" };
        }
        throw error;
    } finally {
        client.release();
    }
}

export async function deleteAdminRoomById(roomId, database = pool) {
    const client = await database.connect();

    try {
        await client.query("BEGIN");

        const existingRes = await client.query(
            `SELECT id FROM rooms WHERE id = $1`,
            [roomId],
        );
        if (existingRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return { error: "ROOM_NOT_FOUND" };
        }

        const screeningsRes = await client.query(
            `SELECT EXISTS (
                SELECT 1 FROM screenings WHERE room_id = $1
            ) AS has_screenings`,
            [roomId],
        );
        if (screeningsRes.rows[0].has_screenings) {
            await client.query("ROLLBACK");
            return { error: "ROOM_HAS_SCREENINGS" };
        }

        await client.query(`DELETE FROM rooms WHERE id = $1`, [roomId]);
        await client.query("COMMIT");
        return { deleted: true, id: roomId };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function insertAdminScreening(data, database = pool) {
    const client = await database.connect();

    try {
        await client.query("BEGIN");

        const resolved = await resolveRoomAndWindow(client, data);
        if (resolved.error) {
            await client.query("ROLLBACK");
            return { error: resolved.error };
        }

        const priorRes = await client.query(
            `SELECT EXISTS (
                SELECT 1 FROM screenings WHERE movie_id = $1
            ) AS has_prior_screenings`,
            [data.movieId],
        );
        const isFirstScreening = !priorRes.rows[0].has_prior_screenings;
        const ticketPrice = isFirstScreening ? PREMIERE_TICKET_PRICE : BASE_TICKET_PRICE;

        const insertRes = await client.query(
            `INSERT INTO screenings (movie_id, room_id, start_time, end_time, ticket_price)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [data.movieId, resolved.roomId, resolved.startTs, resolved.endTs, ticketPrice],
        );
        const screeningId = insertRes.rows[0].id;

        const ownerRes = await client.query(
            `SELECT id FROM users WHERE username = 'owner' LIMIT 1`,
        );
        const orderStatusRes = await client.query(
            `SELECT id FROM order_statuses WHERE name = 'confirmed' LIMIT 1`,
        );
        const resStatusRes = await client.query(
            `SELECT id FROM reservation_statuses WHERE name = 'reserved' LIMIT 1`,
        );

        if (
            ownerRes.rows.length > 0 &&
            orderStatusRes.rows.length > 0 &&
            resStatusRes.rows.length > 0
        ) {
            const orderRes = await client.query(
                `INSERT INTO orders (user_id, status_id)
                 VALUES ($1, $2)
                 RETURNING id`,
                [ownerRes.rows[0].id, orderStatusRes.rows[0].id],
            );

            await client.query(
                `INSERT INTO reservations (order_id, screening_id, seat_row, seat_number, status_id, price)
                 VALUES ($1, $2, 1, 1, $3, 0.00)`,
                [orderRes.rows[0].id, screeningId, resStatusRes.rows[0].id],
            );
        }

        const created = await findScreeningById(client, screeningId);
        await client.query("COMMIT");
        return { screening: created };
    } catch (error) {
        await client.query("ROLLBACK");

        if (isScreeningOverlapError(error)) {
            return { error: "SCREENING_OVERLAP" };
        }

        throw error;
    } finally {
        client.release();
    }
}

export async function updateAdminScreeningById(screeningId, data, database = pool) {
    const client = await database.connect();

    try {
        await client.query("BEGIN");

        const existing = await findScreeningById(client, screeningId);
        if (!existing) {
            await client.query("ROLLBACK");
            return { error: "SCREENING_NOT_FOUND" };
        }

        const resolved = await resolveRoomAndWindow(client, data);
        if (resolved.error) {
            await client.query("ROLLBACK");
            return { error: resolved.error };
        }

        const soldCount = await countActiveSoldSeats(client, screeningId);
        const maxGuestSeats = Math.max(0, resolved.roomCapacity - 1);
        if (soldCount > maxGuestSeats) {
            await client.query("ROLLBACK");
            return { error: "ROOM_CAPACITY_EXCEEDED" };
        }

        const earlierRes = await client.query(
            `SELECT EXISTS (
                SELECT 1
                FROM screenings
                WHERE movie_id = $1
                  AND id <> $2
                  AND start_time <= $3
            ) AS has_earlier_screenings`,
            [data.movieId, screeningId, resolved.startTs],
        );
        const isFirstScreening = !earlierRes.rows[0].has_earlier_screenings;
        const ticketPrice = isFirstScreening ? PREMIERE_TICKET_PRICE : BASE_TICKET_PRICE;

        await client.query(
            `UPDATE screenings
             SET movie_id = $1,
                 room_id = $2,
                 start_time = $3,
                 end_time = $4,
                 ticket_price = $5
             WHERE id = $6`,
            [
                data.movieId,
                resolved.roomId,
                resolved.startTs,
                resolved.endTs,
                ticketPrice,
                screeningId,
            ],
        );

        const updated = await findScreeningById(client, screeningId);
        await client.query("COMMIT");
        return { screening: updated };
    } catch (error) {
        await client.query("ROLLBACK");

        if (isScreeningOverlapError(error)) {
            return { error: "SCREENING_OVERLAP" };
        }

        throw error;
    } finally {
        client.release();
    }
}

export async function deleteAdminScreeningById(screeningId, database = pool) {
    const client = await database.connect();

    try {
        await client.query("BEGIN");

        const existing = await findScreeningById(client, screeningId);
        if (!existing) {
            await client.query("ROLLBACK");
            return { error: "SCREENING_NOT_FOUND" };
        }

        const soldCount = await countActiveSoldSeats(client, screeningId);
        if (soldCount > 0) {
            await client.query("ROLLBACK");
            return { error: "SCREENING_HAS_SALES" };
        }

        const orderIdsRes = await client.query(
            `SELECT DISTINCT order_id FROM reservations WHERE screening_id = $1`,
            [screeningId],
        );
        const orderIds = orderIdsRes.rows.map((r) => r.order_id);

        await client.query(`DELETE FROM reservations WHERE screening_id = $1`, [screeningId]);

        if (orderIds.length > 0) {
            await client.query(
                `DELETE FROM orders
                 WHERE id = ANY($1::int[])
                   AND NOT EXISTS (
                       SELECT 1 FROM reservations r WHERE r.order_id = orders.id
                   )`,
                [orderIds],
            );
        }

        await client.query(`DELETE FROM screenings WHERE id = $1`, [screeningId]);
        await client.query("COMMIT");
        return { deleted: true, id: screeningId };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
