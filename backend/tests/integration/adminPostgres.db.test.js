import { afterAll, afterEach, beforeAll, describe, expect, test } from "@jest/globals";
import { pool } from "../../db/pool.js";
import {
    deleteAdminScreeningById,
    ensureAdminReferenceData,
    insertAdminScreening,
    listAdminSales,
    listAdminScreenings,
    updateAdminScreeningById,
} from "../../dao/admin/adminDao.js";

if (!process.env.DB_TEST_URL && !process.env.DATABASE_URL) {
    throw new Error(
        "DB_TEST_URL or DATABASE_URL must be configured to run PostgreSQL integration tests.",
    );
}

function futureIsoDate(daysAhead = 30) {
    const date = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
}

describe("Admin PostgreSQL integration tests", () => {
    let testMovieId;
    const createdScreeningIds = [];
    const createdOrderIds = [];

    beforeAll(async () => {
        await ensureAdminReferenceData(pool);

        const movieRes = await pool.query(
            `INSERT INTO movies (imdb_id, title, duration_minutes)
             VALUES ('tt9988771', '[TEST] Rio Admin Integration Movie', 120)
             ON CONFLICT (imdb_id)
             DO UPDATE SET title = EXCLUDED.title, duration_minutes = EXCLUDED.duration_minutes
             RETURNING id`,
        );
        testMovieId = movieRes.rows[0].id;
    });

    afterEach(async () => {
        if (createdOrderIds.length > 0) {
            await pool.query(`DELETE FROM reservations WHERE order_id = ANY($1::int[])`, [
                createdOrderIds,
            ]);
            await pool.query(`DELETE FROM orders WHERE id = ANY($1::int[])`, [createdOrderIds]);
            createdOrderIds.length = 0;
        }

        if (createdScreeningIds.length > 0) {
            const ownerOrdersRes = await pool.query(
                `SELECT DISTINCT order_id FROM reservations WHERE screening_id = ANY($1::int[])`,
                [createdScreeningIds],
            );
            const ownerOrderIds = ownerOrdersRes.rows.map((r) => r.order_id);

            await pool.query(`DELETE FROM reservations WHERE screening_id = ANY($1::int[])`, [
                createdScreeningIds,
            ]);
            if (ownerOrderIds.length > 0) {
                await pool.query(`DELETE FROM orders WHERE id = ANY($1::int[])`, [ownerOrderIds]);
            }
            await pool.query(`DELETE FROM screenings WHERE id = ANY($1::int[])`, [
                createdScreeningIds,
            ]);
            createdScreeningIds.length = 0;
        }
    });

    afterAll(async () => {
        if (testMovieId) {
            await pool.query(`DELETE FROM movies WHERE id = $1`, [testMovieId]);
        }
        await pool.end();
    });

    test("ensureAdminReferenceData idempotently creates Oulu and Tampere with Room 1 (100) and Room 2 (200)", async () => {
        await ensureAdminReferenceData(pool);

        const roomsRes = await pool.query(
            `SELECT t.city, r.name, r.capacity
             FROM rooms r
             JOIN theatres t ON t.id = r.theatre_id
             WHERE LOWER(t.city) IN ('oulu', 'tampere')
             ORDER BY t.city ASC, r.name ASC`,
        );

        expect(roomsRes.rows).toEqual([
            { city: "Oulu", name: "Room 1", capacity: 100 },
            { city: "Oulu", name: "Room 2", capacity: 200 },
            { city: "Tampere", name: "Room 1", capacity: 100 },
            { city: "Tampere", name: "Room 2", capacity: 200 },
        ]);
    });

    test("insertAdminScreening persists screening, reserves Seat #1 for owner, and excludes it from sales", async () => {
        const screeningDate = futureIsoDate(31);

        const result = await insertAdminScreening(
            {
                movieId: testMovieId,
                city: "Oulu",
                roomName: "Room 1",
                date: screeningDate,
                startTime: "18:00",
                isFirstScreening: true,
                ticketPrice: 14.95,
            },
            pool,
        );

        expect(result.error).toBeUndefined();
        expect(result.screening).toMatchObject({
            movieId: testMovieId,
            movieTitle: "[TEST] Rio Admin Integration Movie",
            city: "Oulu",
            roomName: "Room 1",
            capacity: 100,
            date: screeningDate,
            startTime: "18:00",
            ticketPrice: 14.95,
            isFirstScreening: true,
        });
        createdScreeningIds.push(result.screening.id);

        const ownerSeatRes = await pool.query(
            `SELECT res.seat_row, res.seat_number, res.price, u.username
             FROM reservations res
             JOIN orders o ON o.id = res.order_id
             JOIN users u ON u.id = o.user_id
             WHERE res.screening_id = $1`,
            [result.screening.id],
        );
        expect(ownerSeatRes.rows).toEqual([
            { seat_row: 1, seat_number: 1, price: "0.00", username: "owner" },
        ]);

        const sales = await listAdminSales(pool);
        const createdSaleRow = sales.find((row) => row.id === result.screening.id);
        expect(createdSaleRow).toMatchObject({
            id: result.screening.id,
            seatsSold: 0,
            revenue: 0,
        });
    });

    test("insertAdminScreening blocks overlapping times in the same room but allows back-to-back or other rooms", async () => {
        const screeningDate = futureIsoDate(32);

        const first = await insertAdminScreening(
            {
                movieId: testMovieId,
                city: "Tampere",
                roomName: "Room 1",
                date: screeningDate,
                startTime: "16:00",
                isFirstScreening: false,
                ticketPrice: 13.0,
            },
            pool,
        );
        createdScreeningIds.push(first.screening.id);

        const overlap = await insertAdminScreening(
            {
                movieId: testMovieId,
                city: "Tampere",
                roomName: "Room 1",
                date: screeningDate,
                startTime: "17:30",
                isFirstScreening: false,
                ticketPrice: 13.0,
            },
            pool,
        );
        expect(overlap).toEqual({ error: "SCREENING_OVERLAP" });

        const backToBack = await insertAdminScreening(
            {
                movieId: testMovieId,
                city: "Tampere",
                roomName: "Room 1",
                date: screeningDate,
                startTime: "18:00",
                isFirstScreening: false,
                ticketPrice: 13.0,
            },
            pool,
        );
        expect(backToBack.error).toBeUndefined();
        createdScreeningIds.push(backToBack.screening.id);

        const otherRoom = await insertAdminScreening(
            {
                movieId: testMovieId,
                city: "Tampere",
                roomName: "Room 2",
                date: screeningDate,
                startTime: "16:30",
                isFirstScreening: false,
                ticketPrice: 13.0,
            },
            pool,
        );
        expect(otherRoom.error).toBeUndefined();
        createdScreeningIds.push(otherRoom.screening.id);
    });

    test("updateAdminScreeningById updates screening and deleteAdminScreeningById enforces sales protection", async () => {
        const screeningDate = futureIsoDate(33);

        const created = await insertAdminScreening(
            {
                movieId: testMovieId,
                city: "Oulu",
                roomName: "Room 2",
                date: screeningDate,
                startTime: "15:00",
                isFirstScreening: false,
                ticketPrice: 13.0,
            },
            pool,
        );
        const screeningId = created.screening.id;
        createdScreeningIds.push(screeningId);

        const updated = await updateAdminScreeningById(
            screeningId,
            {
                movieId: testMovieId,
                city: "Oulu",
                roomName: "Room 2",
                date: screeningDate,
                startTime: "15:30",
                isFirstScreening: true,
                ticketPrice: 14.95,
            },
            pool,
        );
        expect(updated.screening).toMatchObject({
            id: screeningId,
            startTime: "15:30",
            ticketPrice: 14.95,
            isFirstScreening: true,
        });

        const ownerRes = await pool.query(`SELECT id FROM users WHERE username = 'owner' LIMIT 1`);
        const confirmedRes = await pool.query(
            `SELECT id FROM order_statuses WHERE name = 'confirmed' LIMIT 1`,
        );
        const reservedRes = await pool.query(
            `SELECT id FROM reservation_statuses WHERE name = 'reserved' LIMIT 1`,
        );
        const cancelledRes = await pool.query(
            `SELECT id FROM reservation_statuses WHERE name = 'cancelled' LIMIT 1`,
        );

        const orderRes = await pool.query(
            `INSERT INTO orders (user_id, status_id) VALUES ($1, $2) RETURNING id`,
            [ownerRes.rows[0].id, confirmedRes.rows[0].id],
        );
        const orderId = orderRes.rows[0].id;
        createdOrderIds.push(orderId);

        await pool.query(
            `INSERT INTO reservations (order_id, screening_id, seat_row, seat_number, status_id, price)
             VALUES
               ($1, $2, 3, 4, $3, 14.95),
               ($1, $2, 3, 5, $4, 14.95)`,
            [orderId, screeningId, reservedRes.rows[0].id, cancelledRes.rows[0].id],
        );

        const salesWithCustomer = await listAdminSales(pool);
        const rowWithSale = salesWithCustomer.find((r) => r.id === screeningId);
        expect(rowWithSale).toMatchObject({
            seatsSold: 1,
            revenue: 14.95,
        });

        const blockedDelete = await deleteAdminScreeningById(screeningId, pool);
        expect(blockedDelete).toEqual({ error: "SCREENING_HAS_SALES" });

        await pool.query(`DELETE FROM reservations WHERE order_id = $1`, [orderId]);
        await pool.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
        createdOrderIds.length = 0;

        const deleted = await deleteAdminScreeningById(screeningId, pool);
        expect(deleted).toEqual({ deleted: true, id: screeningId });

        const remaining = await listAdminScreenings(pool);
        expect(remaining.some((s) => s.id === screeningId)).toBe(false);
    });
});
