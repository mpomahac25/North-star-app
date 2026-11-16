import request from "supertest";
import { jest } from "@jest/globals";
import backendApp from "../../../backend/app.js";
import { createApp } from "../../app.js";
import { assertApiError } from "../helpers/assertApiError.js";

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
        const upstreamFetch = jest.spyOn(globalThis, "fetch")
            .mockImplementation(async (url) => {
                const target = new URL(url);

                expect(target.pathname).toBe("/api/movies/title");

                return new Response(JSON.stringify({
                    imdbID: "tt1234567",
                    Title: target.searchParams.get("title"),
                    Year: target.searchParams.get("year"),
                    Poster: "N/A",
                }), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                    },
                });
            });

        const response = await request(frontendApp)
            .get("/api/movies/coming-soon");

        expect(response.status).toBe(200);
        expect(response.body.length).toBeGreaterThan(0);

        for (const movie of response.body) {
            expect(movie).toEqual({
                imdbId: expect.any(String),
                title: expect.any(String),
                year: expect.any(String),
                poster: null,
            });
        }

        expect(upstreamFetch).toHaveBeenCalledTimes(response.body.length);
    });
});