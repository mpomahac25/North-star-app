import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";

const testDatabaseConfigured = Boolean(
  process.env.TEST_DB_HOST &&
  process.env.TEST_DB_PORT &&
  process.env.TEST_DB_NAME &&
  process.env.TEST_DB_USER &&
  process.env.TEST_DB_PASSWORD,
);

let app;
let pool;
let mockMoviesServer;
let serviceCalls = [];

if (testDatabaseConfigured) {
  if (!/_test$/i.test(process.env.TEST_DB_NAME)) {
    throw new Error(
      'Refusing to run OMDb import flow test: TEST_DB_NAME must end with "_test".',
    );
  }

  const moviesApp = express();
  moviesApp.get("/api/movies/title", (req, res) => {
    serviceCalls.push({ title: req.query.title, year: req.query.year });
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

  mockMoviesServer = await new Promise((resolve) => {
    const server = moviesApp.listen(0, "127.0.0.1", () => resolve(server));
  });

  process.env.DB_HOST = process.env.TEST_DB_HOST;
  process.env.DB_PORT = process.env.TEST_DB_PORT;
  process.env.DB_NAME = process.env.TEST_DB_NAME;
  process.env.DB_USER = process.env.TEST_DB_USER;
  process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD;
  process.env.MOVIES_API_URL = `http://127.0.0.1:${mockMoviesServer.address().port}`;

  ({ default: app } = await import("../../app.js"));
  ({ pool } = await import("../../db/pool.js"));
}

const usePostgres = testDatabaseConfigured ? describe : describe.skip;

usePostgres("OMDb import to PostgreSQL API flow", () => {
  beforeAll(async () => {
    serviceCalls = [];
    await pool.query("DELETE FROM movies WHERE imdb_id = $1", ["tt9000001"]);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM movies WHERE imdb_id = $1", ["tt9000001"]);
    await pool.end();
    await new Promise((resolve, reject) => {
      mockMoviesServer.close((error) => (error ? reject(error) : resolve()));
    });
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

    expect(serviceCalls).toEqual([
        { title: "Drive", year: "2011" },
    ]);

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
  });
});
