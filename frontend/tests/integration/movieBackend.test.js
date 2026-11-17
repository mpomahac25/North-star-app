import request from "supertest";
import { jest } from "@jest/globals";
import { createApp } from "../../app.js";
import { assertApiError } from "../helpers/assertApiError.js";

const movieReadDao = {
    findMovieById: jest.fn(),
    findMovieByImdbId: jest.fn(),
    listMovies: jest.fn(),
    listNowShowingMovies: jest.fn(),
    listUpcomingScreeningsByMovieId: jest.fn(),
};

const movieWriteDao = {
    upsertMovie: jest.fn(),
};

const databasePool = {
    query: jest.fn(),
};

jest.unstable_mockModule("../../../backend/dao/movies/movieReadDao.js", () => movieReadDao);
jest.unstable_mockModule("../../../backend/dao/movies/movieWriteDao.js", () => movieWriteDao);
jest.unstable_mockModule("../../../backend/db/pool.js", () => ({
    pool: databasePool,
}));

const { default: backendApp } = await import("../../../backend/app.js");

describe("Frontend and Backend Movies Integration", () => {
    let backendServer;
    let frontendApp;

    beforeAll(async () => {
        await new Promise((resolve) => {
            backendServer = backendApp.listen(0, "127.0.0.1", resolve);
        });

        const port = backendServer.address().port;

        frontendApp = createApp(`http://127.0.0.1:${port}`);
    });

    afterEach(() => {
        jest.restoreAllMocks();

        for (const mock of Object.values(movieReadDao)) {
            mock.mockReset();
        }

        movieWriteDao.upsertMovie.mockReset();
        databasePool.query.mockReset();
    });

    afterAll(async () => {
        await new Promise((resolve, reject) => {
            backendServer.close((error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    });

    test("Forwards movie searches through the real frontend and backend", async () => {
        const movies = {
            items: [
                {
                    id: 42,
                    imdbId: "tt1013752",
                    title: "Fast & Furious",
                    releaseYear: 2009,
                    posterUrl: null,
                },
            ],
            total: 11,
        };

        movieReadDao.listMovies.mockResolvedValueOnce(movies);

        const response = await request(frontendApp)
            .get("/api/movies")
            .query({
                q: "Fast & Furious",
                page: 2,
                limit: 10,
            });

        expect(response.status).toBe(200);

        expect(response.body).toEqual({
            ...movies,
            page: 2,
            limit: 10,
        });

        expect(movieReadDao.listMovies).toHaveBeenCalledWith({
            query: "Fast & Furious",
            releaseYear: undefined,
            limit: 10,
            offset: 10,
        });
    });

    test("Preserves backend catalog errors through the frontend proxy", async () => {
        movieReadDao.listMovies.mockRejectedValueOnce(
            new Error("Database unavailable"),
        );

        const response = await request(frontendApp)
            .get("/api/movies")
            .query({
                q: "Drive",
                page: 1,
                limit: 10,
            });

        assertApiError(response, 500, "MOVIE_CATALOG_READ_FAILED");

        expect(response.body).toEqual({
            error: {
                code: "MOVIE_CATALOG_READ_FAILED",
                message: "Could not load movies from the database.",
            },
        });
    });

    test("Retrieves and transforms coming-soon movies through both applications", async () => {
        const upstreamFetch = jest.spyOn(globalThis, "fetch");
        movieReadDao.listMovies.mockResolvedValueOnce({
            total: 1,
            items: [{
                imdbId: "tt1234567",
                title: "Coming Soon Test Movie",
                releaseYear: 2026,
                posterUrl: null,
            }],
        });

        const response = await request(frontendApp)
            .get("/api/movies/coming-soon");

        expect(response.status).toBe(200);
        expect(response.body).toEqual([{
            imdbId: "tt1234567",
            title: "Coming Soon Test Movie",
            year: 2026,
            poster: null,
        }]);
        expect(movieReadDao.listMovies).toHaveBeenCalledWith({
            releaseYear: 2026,
            limit: 1000,
            offset: 0,
        });
        expect(upstreamFetch).not.toHaveBeenCalled();
    });

    test("Retrieves movie details through both applications", async () => {
        const movie = {
            id: 42,
            imdbId: "tt0780504",
            title: "Drive",
            description: "A stunt driver gets involved in a heist.",
            releaseYear: 2011,
            durationMinutes: 100,
            genres: ["Action", "Drama"],
            directors: ["Nicolas Winding Refn"],
        };

        movieReadDao.findMovieById.mockResolvedValueOnce(movie);

        const response = await request(frontendApp)
            .get("/api/movies/42");

        expect(response.status).toBe(200);
        expect(response.body).toEqual(movie);
        expect(movieReadDao.findMovieById).toHaveBeenCalledWith(42);
    });

    test("Returns 404 when a requested movie does not exist", async () => {
        movieReadDao.findMovieById.mockResolvedValueOnce(null);

        const response = await request(frontendApp)
            .get("/api/movies/999");

        assertApiError(response, 404, "MOVIE_NOT_FOUND");

        expect(response.body.error.message).toBe("Movie was not found.");
    });

    test("Retrieves a cached movie using its IMDb ID", async () => {
        const movie = {
            id: 42,
            imdbId: "tt0780504",
            title: "Drive",
            releaseYear: 2011,
        };

        movieReadDao.findMovieByImdbId.mockResolvedValueOnce(movie);

        const response = await request(frontendApp)
            .get("/api/movies/tt0780504");

        expect(response.status).toBe(200);
        expect(response.body).toEqual(movie);

        expect(movieReadDao.findMovieByImdbId)
            .toHaveBeenCalledWith("tt0780504");
    });

    test("Retrieves upcoming movie screenings through both applications", async () => {
        const movie = {
            id: 42,
            imdbId: "tt0780504",
            title: "Drive",
        };

        const screenings = [
            {
                id: 1,
                startTime: "2030-12-01T18:00:00.000Z",
                endTime: "2030-12-01T19:40:00.000Z",
                theatreName: "Rio Oulu",
                city: "Oulu",
                roomName: "Room 1",
            },
            {
                id: 2,
                startTime: "2030-12-02T19:00:00.000Z",
                endTime: "2030-12-02T20:40:00.000Z",
                theatreName: "Rio Tampere",
                city: "Tampere",
                roomName: "Room 2",
            },
        ];

        movieReadDao.findMovieById.mockResolvedValueOnce(movie);

        movieReadDao.listUpcomingScreeningsByMovieId
            .mockResolvedValueOnce(screenings);

        const response = await request(frontendApp)
            .get("/api/movies/42/screenings");

        expect(response.status).toBe(200);
        expect(response.body).toEqual(screenings);

        expect(movieReadDao.findMovieById).toHaveBeenCalledWith(42);

        expect(movieReadDao.listUpcomingScreeningsByMovieId)
            .toHaveBeenCalledWith(42);
    });

    test("Retrieves now-showing movies through both applications", async () => {
        const movies = [
            {
                id: 42,
                imdbId: "tt0780504",
                title: "Drive",
                releaseYear: 2011,
                posterUrl: null,
                screenings: [
                    {
                        id: 1,
                        startTime: "2030-12-01T18:00:00.000Z",
                        theatreName: "Rio Oulu",
                        city: "Oulu",
                    },
                ],
            },
        ];

        movieReadDao.listNowShowingMovies.mockResolvedValueOnce(movies);

        const response = await request(frontendApp)
            .get("/api/movies/now-showing");

        expect(response.status).toBe(200);
        expect(response.body).toEqual(movies);
    });
});
