import request from "supertest";
import { jest } from "@jest/globals";
import { createApp } from "../../app.js";
import { assertApiError } from "../helpers/assertApiError.js";

const movieReadDao = {
    findMovieById: jest.fn(),
    listMovies: jest.fn(),
};

const movieWriteDao = {
    upsertMovie: jest.fn(),
};

jest.unstable_mockModule("../../../backend/dao/movies/movieReadDao.js", () => movieReadDao);
jest.unstable_mockModule("../../../backend/dao/movies/movieWriteDao.js", () => movieWriteDao);

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
        movieReadDao.findMovieById.mockReset();
        movieReadDao.listMovies.mockReset();
        movieWriteDao.upsertMovie.mockReset();
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
            Search: [
                {
                    imdbID: "tt1013752",
                    Title: "Fast & Furious",
                    Year: "2009",
                    Poster: "N/A",
                },
            ],
            totalResults: "1",
            Response: "True",
        };

        const upstreamFetch = jest.spyOn(globalThis, "fetch")
            .mockResolvedValue(
                new Response(JSON.stringify(movies), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                    },
                }),
            );

        const response = await request(frontendApp)
            .get("/api/movies/search")
            .query({
                q: "Fast & Furious",
                page: "2",
                type: "movie",
            });

        expect(response.status).toBe(200);
        expect(response.body).toEqual(movies);

        expect(upstreamFetch).toHaveBeenCalledTimes(1);

        const upstreamUrl = new URL(upstreamFetch.mock.calls[0][0]);

        expect(upstreamUrl.pathname).toBe("/api/movies/search");

        expect(Object.fromEntries(upstreamUrl.searchParams)).toEqual({
            q: "Fast & Furious",
            page: "2",
            type: "movie",
        });
    });

    test("Preserves movie service errors through the real frontend and backend", async () => {
        const upstreamError = {
            error: {
                code: "MOVIES_SERVICE_UNAVAILABLE",
                message: "The movies service is unavailable.",
            },
        };

        jest.spyOn(globalThis, "fetch")
            .mockResolvedValue(
                new Response(JSON.stringify(upstreamError), {
                    status: 503,
                    headers: {
                        "Content-Type": "application/json",
                    },
                }),
            );

        const response = await request(frontendApp)
            .get("/api/movies/search")
            .query({
                q: "Drive",
                page: "1",
                type: "movie",
            });

        assertApiError(response, 503, "MOVIES_SERVICE_UNAVAILABLE");

        expect(response.body).toEqual(upstreamError);
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
});
