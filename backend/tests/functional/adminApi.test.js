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

const mockAdminService = {
    AdminServiceError: MockAdminServiceError,
    getAdminSales: jest.fn(),
    getAdminScreenings: jest.fn(),
    createAdminScreening: jest.fn(),
    updateAdminScreening: jest.fn(),
    deleteAdminScreening: jest.fn(),
    importAdminMovie: jest.fn(),
};

jest.unstable_mockModule("../../services/adminService.js", () => mockAdminService);

const { default: app } = await import("../../app.js");

const originalFetch = global.fetch;

describe("Admin API routes functional tests", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    test("GET /api/admin/sales returns 200 with sales rows and 500 on unexpected failure", async () => {
        const rows = [{ id: 1, movieTitle: "The Matrix", seatsSold: 12, revenue: 156 }];
        mockAdminService.getAdminSales.mockResolvedValueOnce(rows);

        const okRes = await request(app).get("/api/admin/sales");
        expect(okRes.status).toBe(200);
        expect(okRes.body).toEqual(rows);

        mockAdminService.getAdminSales.mockRejectedValueOnce(new Error("DB connection lost"));
        const errRes = await request(app).get("/api/admin/sales");
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

        const res = await request(app).get("/api/admin/screenings");
        expect(res.status).toBe(200);
        expect(res.body).toEqual(screenings);
    });

    test("POST /api/admin/screenings returns 201 on creation and 409 on schedule overlap", async () => {
        const created = { id: 10, movieId: 1, city: "Oulu", roomName: "Room 1", ticketPrice: 13 };
        mockAdminService.createAdminScreening.mockResolvedValueOnce(created);

        const okRes = await request(app).post("/api/admin/screenings").send({
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

        const conflictRes = await request(app).post("/api/admin/screenings").send({});
        expect(conflictRes.status).toBe(409);
        expect(conflictRes.body).toEqual({
            error: {
                code: "SCREENING_OVERLAP",
                message: "This room already has another screening scheduled during that time.",
            },
        });
    });

    test("PUT /api/admin/screenings/:id validates ID format and updates valid screening", async () => {
        const badRes = await request(app).put("/api/admin/screenings/not-a-number").send({});
        expect(badRes.status).toBe(400);
        expect(badRes.body.error.code).toBe("INVALID_SCREENING_ID");
        expect(mockAdminService.updateAdminScreening).not.toHaveBeenCalled();

        const updated = { id: 7, city: "Tampere", roomName: "Room 2", ticketPrice: 14.95 };
        mockAdminService.updateAdminScreening.mockResolvedValueOnce(updated);

        const okRes = await request(app).put("/api/admin/screenings/7").send({ city: "Tampere" });
        expect(okRes.status).toBe(200);
        expect(okRes.body).toEqual(updated);
    });

    test("DELETE /api/admin/screenings/:id rejects invalid ID, returns 409 if tickets sold, and 200 on delete", async () => {
        const badRes = await request(app).delete("/api/admin/screenings/0");
        expect(badRes.status).toBe(400);
        expect(badRes.body.error.code).toBe("INVALID_SCREENING_ID");

        mockAdminService.deleteAdminScreening.mockRejectedValueOnce(
            new MockAdminServiceError(
                "Cannot delete a screening that already has sold tickets.",
                409,
                "SCREENING_HAS_SALES",
            ),
        );
        const conflictRes = await request(app).delete("/api/admin/screenings/3");
        expect(conflictRes.status).toBe(409);
        expect(conflictRes.body.error.code).toBe("SCREENING_HAS_SALES");

        mockAdminService.deleteAdminScreening.mockResolvedValueOnce({ deleted: true, id: 3 });
        const okRes = await request(app).delete("/api/admin/screenings/3");
        expect(okRes.status).toBe(200);
        expect(okRes.body).toEqual({ deleted: true, id: 3 });
    });

    test("POST /api/admin/movies/import returns 200 on import and 400 on validation error", async () => {
        mockAdminService.importAdminMovie.mockResolvedValueOnce({ id: 22, title: "Inception" });

        const okRes = await request(app)
            .post("/api/admin/movies/import")
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

        const errRes = await request(app).post("/api/admin/movies/import").send({ imdbId: "bad" });
        expect(errRes.status).toBe(400);
        expect(errRes.body.error.code).toBe("INVALID_IMDB_ID");
    });

    test("GET /api/admin/movies/search validates query and proxies IMDb ID vs title search", async () => {
        const emptyRes = await request(app).get("/api/admin/movies/search?q=   ");
        expect(emptyRes.status).toBe(400);
        expect(emptyRes.body.error.code).toBe("INVALID_QUERY");

        global.fetch.mockResolvedValueOnce({
            status: 200,
            json: async () => ({ Title: "The Matrix", imdbID: "tt0133093" }),
        });
        const imdbRes = await request(app).get("/api/admin/movies/search?q=tt0133093");
        expect(imdbRes.status).toBe(200);
        expect(imdbRes.body).toEqual({
            Title: "The Matrix",
            imdbID: "tt0133093",
        });

        global.fetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
        const downRes = await request(app).get("/api/admin/movies/search?q=Matrix");
        expect(downRes.status).toBe(502);
        expect(downRes.body.error.code).toBe("MOVIES_SERVICE_ERROR");
    });
});
