import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const mockDao = {
    listAdminSales: jest.fn(),
    listAdminScreenings: jest.fn(),
    insertAdminScreening: jest.fn(),
    updateAdminScreeningById: jest.fn(),
    deleteAdminScreeningById: jest.fn(),
};

const mockCatalog = {
    getMovieByImdbId: jest.fn(),
    importMovieByTitle: jest.fn(),
};

jest.unstable_mockModule("../../dao/admin/adminDao.js", () => mockDao);
jest.unstable_mockModule("../../services/movieCatalogService.js", () => mockCatalog);

const {
    AdminServiceError,
    createAdminScreening,
    deleteAdminScreening,
    getAdminSales,
    getAdminScreenings,
    importAdminMovie,
    updateAdminScreening,
} = await import("../../services/adminService.js");

function futureIsoDate(daysAhead = 14) {
    const date = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
}

describe("adminService unit tests", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("getAdminSales and getAdminScreenings delegate to DAO", async () => {
        mockDao.listAdminSales.mockResolvedValue([{ id: 1, seatsSold: 5, revenue: 65 }]);
        mockDao.listAdminScreenings.mockResolvedValue([{ id: 1, city: "Oulu" }]);

        await expect(getAdminSales()).resolves.toEqual([{ id: 1, seatsSold: 5, revenue: 65 }]);
        await expect(getAdminScreenings()).resolves.toEqual([{ id: 1, city: "Oulu" }]);
    });

    test("createAdminScreening normalizes city/room and sets standard 13.00 EUR price", async () => {
        const date = futureIsoDate(10);
        const created = { id: 12, movieId: 3, city: "Oulu", roomName: "Room 1", ticketPrice: 13.0 };
        mockDao.insertAdminScreening.mockResolvedValue({ screening: created });

        const result = await createAdminScreening({
            movieId: "3",
            city: "  oulu ",
            roomName: " room 1 ",
            date,
            startTime: "18:30",
            isFirstScreening: false,
        });

        expect(mockDao.insertAdminScreening).toHaveBeenCalledWith({
            movieId: 3,
            city: "Oulu",
            roomName: "Room 1",
            date,
            startTime: "18:30",
            isFirstScreening: false,
            ticketPrice: 13.0,
        });
        expect(result).toEqual(created);
    });

    test("createAdminScreening applies +15% premiere price (14.95 EUR) when isFirstScreening is true", async () => {
        const date = futureIsoDate(15);
        mockDao.insertAdminScreening.mockResolvedValue({
            screening: { id: 15, ticketPrice: 14.95, isFirstScreening: true },
        });

        await createAdminScreening({
            movieId: 7,
            city: "Tampere",
            roomName: "Room 2",
            date,
            startTime: "20:00",
            isFirstScreening: true,
        });

        expect(mockDao.insertAdminScreening).toHaveBeenCalledWith(
            expect.objectContaining({
                city: "Tampere",
                roomName: "Room 2",
                isFirstScreening: true,
                ticketPrice: 14.95,
            }),
        );
    });

    test.each([
        [
            {
                movieId: 0,
                city: "Oulu",
                roomName: "Room 1",
                date: futureIsoDate(),
                startTime: "18:00",
            },
            "INVALID_MOVIE_ID",
        ],
        [
            {
                movieId: -4,
                city: "Oulu",
                roomName: "Room 1",
                date: futureIsoDate(),
                startTime: "18:00",
            },
            "INVALID_MOVIE_ID",
        ],
        [
            {
                movieId: 1.5,
                city: "Oulu",
                roomName: "Room 1",
                date: futureIsoDate(),
                startTime: "18:00",
            },
            "INVALID_MOVIE_ID",
        ],
        [
            {
                movieId: 1,
                city: "Helsinki",
                roomName: "Room 1",
                date: futureIsoDate(),
                startTime: "18:00",
            },
            "INVALID_LOCATION",
        ],
        [
            {
                movieId: 1,
                city: "Oulu",
                roomName: "Room 3",
                date: futureIsoDate(),
                startTime: "18:00",
            },
            "INVALID_ROOM",
        ],
        [
            {
                movieId: 1,
                city: "Oulu",
                roomName: "Room 1",
                date: "16-11-2026",
                startTime: "18:00",
            },
            "INVALID_DATE",
        ],
        [
            {
                movieId: 1,
                city: "Oulu",
                roomName: "Room 1",
                date: "2026-02-30",
                startTime: "18:00",
            },
            "INVALID_DATE",
        ],
        [
            {
                movieId: 1,
                city: "Oulu",
                roomName: "Room 1",
                date: futureIsoDate(),
                startTime: "24:00",
            },
            "INVALID_START_TIME",
        ],
        [
            {
                movieId: 1,
                city: "Oulu",
                roomName: "Room 1",
                date: futureIsoDate(),
                startTime: "18:60",
            },
            "INVALID_START_TIME",
        ],
    ])("createAdminScreening rejects invalid payload with %s", async (payload, expectedCode) => {
        await expect(createAdminScreening(payload)).rejects.toMatchObject({
            name: "AdminServiceError",
            status: 400,
            code: expectedCode,
        });
        expect(mockDao.insertAdminScreening).not.toHaveBeenCalled();
    });

    test.each([
        ["MOVIE_NOT_FOUND", 404],
        ["ROOM_NOT_FOUND", 404],
        ["SCREENING_OVERLAP", 409],
        ["UNEXPECTED_DB_FLAG", 500],
    ])("createAdminScreening maps DAO error %s to HTTP %i", async (daoError, expectedStatus) => {
        mockDao.insertAdminScreening.mockResolvedValue({ error: daoError });

        await expect(
            createAdminScreening({
                movieId: 1,
                city: "Oulu",
                roomName: "Room 1",
                date: futureIsoDate(),
                startTime: "19:00",
            }),
        ).rejects.toMatchObject({
            status: expectedStatus,
            code: daoError === "UNEXPECTED_DB_FLAG" ? "ADMIN_ERROR" : daoError,
        });
    });

    test("updateAdminScreening maps SCREENING_NOT_FOUND to 404 and returns updated record on success", async () => {
        const payload = {
            movieId: 2,
            city: "Tampere",
            roomName: "Room 1",
            date: futureIsoDate(20),
            startTime: "17:15",
            isFirstScreening: false,
        };

        mockDao.updateAdminScreeningById.mockResolvedValueOnce({ error: "SCREENING_NOT_FOUND" });
        await expect(updateAdminScreening(999, payload)).rejects.toMatchObject({
            status: 404,
            code: "SCREENING_NOT_FOUND",
        });

        const updated = { id: 5, ...payload, ticketPrice: 13.0 };
        mockDao.updateAdminScreeningById.mockResolvedValueOnce({ screening: updated });
        await expect(updateAdminScreening(5, payload)).resolves.toEqual(updated);
    });

    test("deleteAdminScreening maps SCREENING_HAS_SALES to 409 and returns deleted object on success", async () => {
        mockDao.deleteAdminScreeningById.mockResolvedValueOnce({ error: "SCREENING_HAS_SALES" });
        await expect(deleteAdminScreening(8)).rejects.toMatchObject({
            status: 409,
            code: "SCREENING_HAS_SALES",
        });

        mockDao.deleteAdminScreeningById.mockResolvedValueOnce({ deleted: true, id: 8 });
        await expect(deleteAdminScreening(8)).resolves.toEqual({ deleted: true, id: 8 });
    });

    test("importAdminMovie validates IMDb ID, title, and release year", async () => {
        await expect(importAdminMovie({ imdbId: "12345" })).rejects.toMatchObject({
            status: 400,
            code: "INVALID_IMDB_ID",
        });

        await expect(importAdminMovie({ title: "   " })).rejects.toMatchObject({
            status: 400,
            code: "INVALID_TITLE",
        });

        await expect(importAdminMovie({ title: "x".repeat(101) })).rejects.toMatchObject({
            status: 400,
            code: "INVALID_TITLE",
        });

        await expect(importAdminMovie({ title: "Dune", year: "24" })).rejects.toMatchObject({
            status: 400,
            code: "INVALID_RELEASE_YEAR",
        });

        mockCatalog.getMovieByImdbId.mockResolvedValue({ id: 10, imdbId: "tt0133093" });
        await expect(importAdminMovie({ imdbId: " tt0133093 " })).resolves.toEqual({
            id: 10,
            imdbId: "tt0133093",
        });
        expect(mockCatalog.getMovieByImdbId).toHaveBeenCalledWith("tt0133093");

        mockCatalog.importMovieByTitle.mockResolvedValue({ id: 11, title: "Alien" });
        await expect(importAdminMovie({ title: " Alien ", year: 1979 })).resolves.toEqual({
            id: 11,
            title: "Alien",
        });
        expect(mockCatalog.importMovieByTitle).toHaveBeenCalledWith("Alien", "1979");
    });
});
