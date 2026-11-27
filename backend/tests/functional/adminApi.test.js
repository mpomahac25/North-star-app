import { afterAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import request from "supertest";

class MockAdminServiceError extends Error {
    constructor(message, status = 400, code = "ADMIN_VALIDATION_ERROR") {
        super(message);
        this.name = "AdminServiceError";
        this.status = status;
        this.code = code;
    }
}

const mockPool = {
    query: jest.fn(),
};

const mockAdminService = {
    AdminServiceError: MockAdminServiceError,
    getAdminSales: jest.fn(),
    getAdminScreenings: jest.fn(),
    getAdminTheatres: jest.fn(),
    createAdminTheatre: jest.fn(),
    updateAdminTheatre: jest.fn(),
    deleteAdminTheatre: jest.fn(),
    createAdminRoom: jest.fn(),
    updateAdminRoom: jest.fn(),
    deleteAdminRoom: jest.fn(),
    createAdminScreening: jest.fn(),
    updateAdminScreening: jest.fn(),
    deleteAdminScreening: jest.fn(),
    importAdminMovie: jest.fn(),
};

jest.unstable_mockModule("../../db/pool.js", () => ({ pool: mockPool }));
jest.unstable_mockModule("../../services/adminService.js", () => mockAdminService);

const { default: app } = await import("../../app.js");

const originalFetch = global.fetch;
const ADMIN_COOKIE = "rio_session=valid-admin-session-token";

describe("Admin API routes functional tests", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
        mockPool.query.mockResolvedValue({
            rows: [
                {
                    id: 1,
                    username: "admin",
                    email: "admin@riocinema.fi",
                    is_admin_flag: "true",
                },
            ],
        });
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    test("enforces admin authentication (401) and authorization (403) on /api/admin/*", async () => {
        const noSessionRes = await request(app).get("/api/admin/sales");
        expect(noSessionRes.status).toBe(401);
        expect(noSessionRes.body.error.code).toBe("UNAUTHENTICATED");

        mockPool.query.mockResolvedValueOnce({ rows: [] });
        const invalidSessionRes = await request(app)
            .get("/api/admin/sales")
            .set("Cookie", "rio_session=expired-token");
        expect(invalidSessionRes.status).toBe(401);
        expect(invalidSessionRes.body.error.code).toBe("UNAUTHENTICATED");

        mockPool.query.mockResolvedValueOnce({
            rows: [
                {
                    id: 2,
                    username: "customer",
                    email: "customer@riocinema.fi",
                    is_admin_flag: "false",
                },
            ],
        });
        const nonAdminRes = await request(app)
            .post("/api/admin/screenings")
            .set("Cookie", "rio_session=customer-token")
            .send({});
        expect(nonAdminRes.status).toBe(403);
        expect(nonAdminRes.body.error.code).toBe("FORBIDDEN");
        expect(mockAdminService.createAdminScreening).not.toHaveBeenCalled();
    });

    test("GET /api/admin/sales returns 200 with sales rows and 500 on unexpected failure", async () => {
        const rows = [{ id: 1, movieTitle: "The Matrix", seatsSold: 12, revenue: 156 }];
        mockAdminService.getAdminSales.mockResolvedValueOnce(rows);

        const okRes = await request(app).get("/api/admin/sales").set("Cookie", ADMIN_COOKIE);
        expect(okRes.status).toBe(200);
        expect(okRes.body).toEqual(rows);

        mockAdminService.getAdminSales.mockRejectedValueOnce(new Error("DB connection lost"));
        const errRes = await request(app).get("/api/admin/sales").set("Cookie", ADMIN_COOKIE);
        expect(errRes.status).toBe(500);
        expect(errRes.body).toEqual({
            error: {
                code: "ADMIN_SALES_READ_FAILED",
                message: "Could not load sales overview from the database.",
            },
        });
    });

    test("GET /api/admin/screenings returns 200 with scheduled screenings", async () => {
        const screenings = [{ id: 4, city: "Oulu", roomName: "Room 1", startTime: "18:00" }];
        mockAdminService.getAdminScreenings.mockResolvedValueOnce(screenings);

        const res = await request(app).get("/api/admin/screenings").set("Cookie", ADMIN_COOKIE);
        expect(res.status).toBe(200);
        expect(res.body).toEqual(screenings);
    });

    test("POST /api/admin/screenings returns 201 on creation and 409 on schedule overlap", async () => {
        const created = { id: 10, movieId: 1, city: "Oulu", roomName: "Room 1", ticketPrice: 13 };
        mockAdminService.createAdminScreening.mockResolvedValueOnce(created);

        const okRes = await request(app)
            .post("/api/admin/screenings")
            .set("Cookie", ADMIN_COOKIE)
            .send({
                movieId: 1,
                city: "Oulu",
                roomName: "Room 1",
                date: "2026-12-01",
                startTime: "18:00",
            });
        expect(okRes.status).toBe(201);
        expect(okRes.body).toEqual(created);

        mockAdminService.createAdminScreening.mockRejectedValueOnce(
            new MockAdminServiceError(
                "This room already has another screening scheduled during that time.",
                409,
                "SCREENING_OVERLAP",
            ),
        );

        const conflictRes = await request(app)
            .post("/api/admin/screenings")
            .set("Cookie", ADMIN_COOKIE)
            .send({});
        expect(conflictRes.status).toBe(409);
        expect(conflictRes.body).toEqual({
            error: {
                code: "SCREENING_OVERLAP",
                message: "This room already has another screening scheduled during that time.",
            },
        });
    });

    test("PUT /api/admin/screenings/:id validates ID format and updates valid screening", async () => {
        const badRes = await request(app)
            .put("/api/admin/screenings/not-a-number")
            .set("Cookie", ADMIN_COOKIE)
            .send({});
        expect(badRes.status).toBe(400);
        expect(badRes.body.error.code).toBe("INVALID_SCREENING_ID");
        expect(mockAdminService.updateAdminScreening).not.toHaveBeenCalled();

        const updated = { id: 7, city: "Tampere", roomName: "Room 2", ticketPrice: 14.95 };
        mockAdminService.updateAdminScreening.mockResolvedValueOnce(updated);

        const okRes = await request(app)
            .put("/api/admin/screenings/7")
            .set("Cookie", ADMIN_COOKIE)
            .send({ city: "Tampere" });
        expect(okRes.status).toBe(200);
        expect(okRes.body).toEqual(updated);
    });

    test("DELETE /api/admin/screenings/:id rejects invalid ID, returns 409 if tickets sold, and 200 on delete", async () => {
        const badRes = await request(app)
            .delete("/api/admin/screenings/0")
            .set("Cookie", ADMIN_COOKIE);
        expect(badRes.status).toBe(400);
        expect(badRes.body.error.code).toBe("INVALID_SCREENING_ID");

        mockAdminService.deleteAdminScreening.mockRejectedValueOnce(
            new MockAdminServiceError(
                "Cannot delete a screening that already has sold tickets.",
                409,
                "SCREENING_HAS_SALES",
            ),
        );
        const conflictRes = await request(app)
            .delete("/api/admin/screenings/3")
            .set("Cookie", ADMIN_COOKIE);
        expect(conflictRes.status).toBe(409);
        expect(conflictRes.body.error.code).toBe("SCREENING_HAS_SALES");

        mockAdminService.deleteAdminScreening.mockResolvedValueOnce({ deleted: true, id: 3 });
        const okRes = await request(app)
            .delete("/api/admin/screenings/3")
            .set("Cookie", ADMIN_COOKIE);
        expect(okRes.status).toBe(200);
        expect(okRes.body).toEqual({ deleted: true, id: 3 });
    });

    test("POST /api/admin/movies/import returns 200 on import and 400 on validation error", async () => {
        mockAdminService.importAdminMovie.mockResolvedValueOnce({ id: 22, title: "Inception" });

        const okRes = await request(app)
            .post("/api/admin/movies/import")
            .set("Cookie", ADMIN_COOKIE)
            .send({ imdbId: "tt1375666" });
        expect(okRes.status).toBe(200);
        expect(okRes.body).toEqual({ id: 22, title: "Inception" });

        mockAdminService.importAdminMovie.mockRejectedValueOnce(
            new MockAdminServiceError(
                "IMDb ID must match format tt1234567.",
                400,
                "INVALID_IMDB_ID",
            ),
        );

        const errRes = await request(app)
            .post("/api/admin/movies/import")
            .set("Cookie", ADMIN_COOKIE)
            .send({ imdbId: "bad" });
        expect(errRes.status).toBe(400);
        expect(errRes.body.error.code).toBe("INVALID_IMDB_ID");
    });

    test("GET /api/admin/movies/search validates query and proxies IMDb ID vs title search", async () => {
        const emptyRes = await request(app)
            .get("/api/admin/movies/search?q=   ")
            .set("Cookie", ADMIN_COOKIE);
        expect(emptyRes.status).toBe(400);
        expect(emptyRes.body.error.code).toBe("INVALID_QUERY");

        global.fetch.mockResolvedValueOnce({
            status: 200,
            json: async () => ({ Title: "The Matrix", imdbID: "tt0133093" }),
        });
        const imdbRes = await request(app)
            .get("/api/admin/movies/search?q=tt0133093")
            .set("Cookie", ADMIN_COOKIE);
        expect(imdbRes.status).toBe(200);
        expect(imdbRes.body).toEqual({
            Title: "The Matrix",
            imdbID: "tt0133093",
        });

        global.fetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
        const downRes = await request(app)
            .get("/api/admin/movies/search?q=Matrix")
            .set("Cookie", ADMIN_COOKIE);
        expect(downRes.status).toBe(502);
        expect(downRes.body.error.code).toBe("MOVIES_SERVICE_ERROR");
    });

    test("supports admin theatre and room CRUD endpoints", async () => {
        mockAdminService.getAdminTheatres.mockResolvedValueOnce([
            { id: 1, name: "Rio Oulu", city: "Oulu", address: "Hallituskatu 11", rooms: [] },
        ]);
        const listRes = await request(app)
            .get("/api/admin/theatres")
            .set("Cookie", ADMIN_COOKIE);
        expect(listRes.status).toBe(200);
        expect(listRes.body).toHaveLength(1);

        mockAdminService.createAdminTheatre.mockResolvedValueOnce({
            id: 2,
            name: "Rio Turku",
            city: "Turku",
            address: "Aurakatu 5",
            rooms: [],
        });
        const createTheatreRes = await request(app)
            .post("/api/admin/theatres")
            .set("Cookie", ADMIN_COOKIE)
            .send({ name: "Rio Turku", city: "Turku", address: "Aurakatu 5" });
        expect(createTheatreRes.status).toBe(201);
        expect(createTheatreRes.body.city).toBe("Turku");

        mockAdminService.createAdminRoom.mockResolvedValueOnce({
            id: 5,
            theatreId: 2,
            name: "Main Hall",
            capacity: 150,
        });
        const createRoomRes = await request(app)
            .post("/api/admin/theatres/2/rooms")
            .set("Cookie", ADMIN_COOKIE)
            .send({ name: "Main Hall", capacity: 150 });
        expect(createRoomRes.status).toBe(201);
        expect(createRoomRes.body.capacity).toBe(150);

        mockAdminService.deleteAdminRoom.mockResolvedValueOnce({ deleted: true, id: 5 });
        const delRoomRes = await request(app)
            .delete("/api/admin/rooms/5")
            .set("Cookie", ADMIN_COOKIE);
        expect(delRoomRes.status).toBe(200);

        mockAdminService.deleteAdminTheatre.mockResolvedValueOnce({ deleted: true, id: 2 });
        const delTheatreRes = await request(app)
            .delete("/api/admin/theatres/2")
            .set("Cookie", ADMIN_COOKIE);
        expect(delTheatreRes.status).toBe(200);
    });
});
