import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";

const databaseUrl = process.env.DB_TEST_URL;

if (!databaseUrl) {
    throw new Error(
        "DB_TEST_URL is required to run PostgreSQL integration tests.",
    );
}

const { Pool } = pg;

const schemaName = `omdb_import_test_${randomUUID().replaceAll("-", "")}`;

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

let app;
let mockMoviesServer;
let schemaCreated = false;
let serviceCalls = [];
let moviesServiceAvailable = true;

const originalMoviesApiUrl = process.env.MOVIES_API_URL;

const moviesApp = express();
moviesApp.get("/api/movies/title", (req, res) => {
    serviceCalls.push({ title: req.query.title, year: req.query.year });

    if (!moviesServiceAvailable) {
        return res.status(503).json({
            error: "Movies service unavailable.",
        });
    }

    return res.json({
        Title: "Drive",
        Year: "2011",
        imdbID: "tt9000001",
        Runtime: "100 min",
        Plot: "A stunt driver gets involved in a heist.",
        Rated: "R",
        Poster: "https://example.test/drive.jpg",
        Released: "16 Sep 2011",
        Genre: "Action, Drama",
        Director: "Nicolas Winding Refn",
        Writer: "Hossein Amini, James Sallis",
        Actors: "Ryan Gosling, Carey Mulligan",
        Language: "English, Spanish",
        Country: "United States",
        Awards: "Nominated for 1 Oscar.",
        imdbRating: "7.8",
        imdbVotes: "775,952",
        BoxOffice: "$35,061,555",
    });
});

describe("OMDb import to PostgreSQL API flow", () => {
    beforeEach(() => {
        serviceCalls = [];
        moviesServiceAvailable = true;
    });

    beforeAll(async () => {
        serviceCalls = [];

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

        mockMoviesServer = await new Promise((resolve) => {
            const server = moviesApp.listen(0, "127.0.0.1", () => {
                resolve(server);
            });
        });

        process.env.MOVIES_API_URL =
            `http://127.0.0.1:${mockMoviesServer.address().port}`;

        ({ default: app } = await import("../../app.js"));
    }, 30000);

    afterAll(async () => {
        try {
            if (mockMoviesServer) {
                await new Promise((resolve, reject) => {
                    mockMoviesServer.close((error) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    });
                });
            }
        } finally {
            try {
                await databasePool.end();
            } finally {
                try {
                    if (schemaCreated) {
                        await adminPool.query(
                            `DROP SCHEMA "${schemaName}" CASCADE`,
                        );
                    }
                } finally {
                    await adminPool.end();

                    if (originalMoviesApiUrl === undefined) {
                        delete process.env.MOVIES_API_URL;
                    } else {
                        process.env.MOVIES_API_URL = originalMoviesApiUrl;
                    }
                }
            }
        }
    });

    test("imports from the movies service, stores in PostgreSQL, and serves the saved row", async () => {
        const imported = await request(app)
            .post("/api/movies/import")
            .send({ title: "Drive", year: "2011" });

        expect(imported.status).toBe(200);
        expect(imported.body).toMatchObject({
            imdbId: "tt9000001",
            title: "Drive",
            durationMinutes: 100,
            releaseYear: 2011,
            ageRating: "R",
            posterUrl: "https://example.test/drive.jpg",
            genres: ["Action", "Drama"],
            directors: ["Nicolas Winding Refn"],
            writers: ["Hossein Amini", "James Sallis"],
            actors: ["Ryan Gosling", "Carey Mulligan"],
            languages: ["English", "Spanish"],
            country: "United States",
            awards: "Nominated for 1 Oscar.",
            imdbVotes: 775952,
            boxOffice: "$35,061,555",
        });

        expect(imported.body.releaseDate).toMatch(/^2011-09-16/);
        expect(Number(imported.body.imdbRating)).toBe(7.8);
        expect(Number.isInteger(imported.body.id)).toBe(true);

        moviesServiceAvailable = false;
        const catalog = await request(app).get("/api/movies?year=2011");
        expect(catalog.status).toBe(200);
        expect(catalog.body.items).toContainEqual(
            expect.objectContaining({
                imdbId: "tt9000001",
                title: "Drive",
                releaseYear: 2011,
            }),
        );

        const storedMovie = catalog.body.items.find(
            (movie) => movie.imdbId === "tt9000001",
        );

        expect(storedMovie).toMatchObject({
            id: imported.body.id,
            title: "Drive",
            genres: ["Action", "Drama"],
            directors: ["Nicolas Winding Refn"],
            actors: ["Ryan Gosling", "Carey Mulligan"],
            languages: ["English", "Spanish"],
        });

        const movieById = await request(app).get(
            `/api/movies/${imported.body.id}`,
        );

        expect(movieById.status).toBe(200);

        expect(movieById.body).toMatchObject({
            id: imported.body.id,
            imdbId: "tt9000001",
            title: "Drive",
            genres: ["Action", "Drama"],
            directors: ["Nicolas Winding Refn"],
            actors: ["Ryan Gosling", "Carey Mulligan"],
        });

        const movieByImdbId = await request(app).get(
            "/api/movies/tt9000001",
        );

        expect(movieByImdbId.status).toBe(200);

        expect(movieByImdbId.body).toMatchObject({
            id: imported.body.id,
            imdbId: "tt9000001",
            title: "Drive",
        });

        const comingSoon = await request(app)
            .get("/api/movies/coming-soon")
            .query({ year: 2011 });
        expect(comingSoon.status).toBe(200);
        expect(comingSoon.body).toContainEqual({
            imdbId: "tt9000001",
            title: "Drive",
            year: 2011,
            poster: "https://example.test/drive.jpg",
        });

        expect(serviceCalls).toEqual([
            { title: "Drive", year: "2011" },
        ]);
    });

    test("rejects imports when the Movies service is unavailable without persisting data", async () => {
        moviesServiceAvailable = false;

        const response = await request(app)
            .post("/api/movies/import")
            .send({
                title: "Offline Movie",
                year: "2030",
            });

        expect(response.status).toBe(502);

        expect(response.body.error).toEqual({
            code: "MOVIE_IMPORT_FAILED",
            message: "Movies service unavailable.",
        });

        expect(serviceCalls).toEqual([
            { title: "Offline Movie", year: "2030" },
        ]);

        const storedMovie = await databasePool.query(
            `SELECT id
         FROM movies
         WHERE title = $1`,
            ["Offline Movie"],
        );

        expect(storedMovie.rows).toHaveLength(0);
    });
});
