import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from "@jest/globals";

const databaseUrl = process.env.DB_TEST_URL;

if (!databaseUrl) {
    throw new Error(
        "DB_TEST_URL is required to run PostgreSQL integration tests.",
    );
}

const { Pool } = pg;

const schemaName = `admin_test_${randomUUID().replaceAll("-", "")}`;

const adminPool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
});

const databasePool = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schemaName}`,
    connectionTimeoutMillis: 5000,
});

jest.unstable_mockModule("../../db/pool.js", () => ({
    pool: databasePool,
}));

const { listAdminSales, listAdminScreenings } = await import(
    "../../dao/admin/adminReadDao.js"
);
const {
    deleteAdminScreeningById,
    ensureAdminReferenceData,
    insertAdminScreening,
    updateAdminScreeningById,
} = await import("../../dao/admin/adminWriteDao.js");

function futureIsoDate(daysAhead = 30) {
    const date = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
}

describe("Admin PostgreSQL integration tests", () => {
    let testMovieId;
    let schemaCreated = false;
    const createdScreeningIds = [];
    const createdOrderIds = [];

    beforeAll(async () => {
        await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
        schemaCreated = true;

        const migrationsPath = fileURLToPath(
            new URL("../../../db/migrations/", import.meta.url),
        );

        const migrationFiles = (await readdir(migrationsPath))
            .filter((file) => /^V\d+__.*\.sql$/.test(file))
            .sort();

        if (migrationFiles.length === 0) {
            throw new Error("No database migration files were found.");
        }

        const client = await databasePool.connect();
        try {
            for (const file of migrationFiles) {
                const migrationSql = await readFile(
                    path.join(migrationsPath, file),
                    "utf8",
                );
                await client.query(migrationSql);
            }
        } finally {
            client.release();
        }

        await ensureAdminReferenceData(databasePool);

        const movieRes = await databasePool.query(
            `INSERT INTO movies (imdb_id, title, duration_minutes)
             VALUES ('tt9988771', '[TEST] Rio Admin Integration Movie', 120)
             ON CONFLICT (imdb_id)
             DO UPDATE SET title = EXCLUDED.title, duration_minutes = EXCLUDED.duration_minutes
             RETURNING id`,
        );
        testMovieId = movieRes.rows[0].id;
    }, 30000);

    afterEach(async () => {
        if (createdOrderIds.length > 0) {
            await databasePool.query(`DELETE FROM reservations WHERE order_id = ANY($1::int[])`, [
                createdOrderIds,
            ]);
            await databasePool.query(`DELETE FROM orders WHERE id = ANY($1::int[])`, [
                createdOrderIds,
            ]);
            createdOrderIds.length = 0;
        }

        if (createdScreeningIds.length > 0) {
            const ownerOrdersRes = await databasePool.query(
                `SELECT DISTINCT order_id FROM reservations WHERE screening_id = ANY($1::int[])`,
                [createdScreeningIds],
            );
            const ownerOrderIds = ownerOrdersRes.rows.map((r) => r.order_id);

            await databasePool.query(`DELETE FROM reservations WHERE screening_id = ANY($1::int[])`, [
                createdScreeningIds,
            ]);
            if (ownerOrderIds.length > 0) {
                await databasePool.query(`DELETE FROM orders WHERE id = ANY($1::int[])`, [
                    ownerOrderIds,
                ]);
            }
            await databasePool.query(`DELETE FROM screenings WHERE id = ANY($1::int[])`, [
                createdScreeningIds,
            ]);
            createdScreeningIds.length = 0;
        }
    });

    afterAll(async () => {
        try {
            if (schemaCreated) {
                await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
            }
        } finally {
            await databasePool.end();
            await adminPool.end();
        }
    });

    test("ensureAdminReferenceData idempotently creates Oulu and Tampere with Room 1 (100) and Room 2 (200)", async () => {
        await ensureAdminReferenceData(databasePool);

        const roomsRes = await databasePool.query(
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
            databasePool,
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

        const ownerSeatRes = await databasePool.query(
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

        const sales = await listAdminSales(databasePool);
        const createdSaleRow = sales.find((row) => row.id === result.screening.id);
        expect(createdSaleRow).toMatchObject({
            id: result.screening.id,
            seatsSold: 0,
            revenue: 0,
        });
    });

    test("insertAdminScreening enforces room occupancy and allows adjacent occupancy windows or other rooms", async () => {
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
            databasePool,
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
            databasePool,
        );
        expect(overlap).toEqual({ error: "SCREENING_OVERLAP" });

        const insufficientTurnaround = await insertAdminScreening(
            {
                movieId: testMovieId,
                city: "Tampere",
                roomName: "Room 1",
                date: screeningDate,
                startTime: "18:44",
                isFirstScreening: false,
                ticketPrice: 13.0,
            },
            databasePool,
        );

        expect(insufficientTurnaround).toEqual({
            error: "SCREENING_OVERLAP",
        });

        const nextAvailable = await insertAdminScreening(
            {
                movieId: testMovieId,
                city: "Tampere",
                roomName: "Room 1",
                date: screeningDate,
                startTime: "18:45",
                isFirstScreening: false,
                ticketPrice: 13.0,
            },
            databasePool,
        );

        expect(nextAvailable.error).toBeUndefined();
        createdScreeningIds.push(nextAvailable.screening.id);

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
            databasePool,
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
            databasePool,
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
            databasePool,
        );
        expect(updated.screening).toMatchObject({
            id: screeningId,
            startTime: "15:30",
            ticketPrice: 14.95,
            isFirstScreening: true,
        });

        const ownerRes = await databasePool.query(
            `SELECT id FROM users WHERE username = 'owner' LIMIT 1`,
        );
        const confirmedRes = await databasePool.query(
            `SELECT id FROM order_statuses WHERE name = 'confirmed' LIMIT 1`,
        );
        const reservedRes = await databasePool.query(
            `SELECT id FROM reservation_statuses WHERE name = 'reserved' LIMIT 1`,
        );
        const cancelledRes = await databasePool.query(
            `SELECT id FROM reservation_statuses WHERE name = 'cancelled' LIMIT 1`,
        );

        const orderRes = await databasePool.query(
            `INSERT INTO orders (user_id, status_id) VALUES ($1, $2) RETURNING id`,
            [ownerRes.rows[0].id, confirmedRes.rows[0].id],
        );
        const orderId = orderRes.rows[0].id;
        createdOrderIds.push(orderId);

        await databasePool.query(
            `INSERT INTO reservations (order_id, screening_id, seat_row, seat_number, status_id, price)
             VALUES
               ($1, $2, 3, 4, $3, 14.95),
               ($1, $2, 3, 5, $4, 14.95)`,
            [orderId, screeningId, reservedRes.rows[0].id, cancelledRes.rows[0].id],
        );

        const salesWithCustomer = await listAdminSales(databasePool);
        const rowWithSale = salesWithCustomer.find((r) => r.id === screeningId);
        expect(rowWithSale).toMatchObject({
            seatsSold: 1,
            revenue: 14.95,
        });

        const blockedDelete = await deleteAdminScreeningById(screeningId, databasePool);
        expect(blockedDelete).toEqual({ error: "SCREENING_HAS_SALES" });

        await databasePool.query(`DELETE FROM reservations WHERE order_id = $1`, [orderId]);
        await databasePool.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
        createdOrderIds.length = 0;

        const deleted = await deleteAdminScreeningById(screeningId, databasePool);
        expect(deleted).toEqual({ deleted: true, id: screeningId });

        const remaining = await listAdminScreenings(databasePool);
        expect(remaining.some((s) => s.id === screeningId)).toBe(false);
    });

    test("concurrent screening creation allows only one request", async () => {
        const screeningDate = futureIsoDate(34);

        const payload = {
            movieId: testMovieId,
            city: "Oulu",
            roomName: "Room 1",
            date: screeningDate,
            startTime: "18:00",
            isFirstScreening: false,
            ticketPrice: 13.0,
        };

        const results = await Promise.all([
            insertAdminScreening(payload, databasePool),
            insertAdminScreening(payload, databasePool),
        ]);

        const created = results.filter((result) => result.screening);
        const conflicts = results.filter(
            (result) => result.error === "SCREENING_OVERLAP",
        );

        expect(created).toHaveLength(1);
        expect(conflicts).toHaveLength(1);

        createdScreeningIds.push(
            ...created.map((result) => result.screening.id),
        );
    });
});
