import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { findMovieById, listMovies } from "../../dao/movies/movieReadDao.js";
import { upsertMovie } from "../../dao/movies/movieWriteDao.js";

const { Pool } = pg;
const testDatabaseName = process.env.TEST_DB_NAME;
const testDatabaseConfigured = Boolean(
  process.env.TEST_DB_HOST &&
  process.env.TEST_DB_PORT &&
  testDatabaseName &&
  process.env.TEST_DB_USER &&
  process.env.TEST_DB_PASSWORD,
);

const schemaName = `omdb_test_${randomUUID().replaceAll("-", "")}`;
const adminPool = testDatabaseConfigured
  ? new Pool({
      host: process.env.TEST_DB_HOST,
      port: Number(process.env.TEST_DB_PORT),
      database: testDatabaseName,
      user: process.env.TEST_DB_USER,
      password: process.env.TEST_DB_PASSWORD,
      connectionTimeoutMillis: 5000,
    })
  : null;
const databasePool = testDatabaseConfigured
  ? new Pool({
      host: process.env.TEST_DB_HOST,
      port: Number(process.env.TEST_DB_PORT),
      database: testDatabaseName,
      user: process.env.TEST_DB_USER,
      password: process.env.TEST_DB_PASSWORD,
      options: `-c search_path=${schemaName}`,
      connectionTimeoutMillis: 5000,
    })
  : null;

const usePostgres = testDatabaseConfigured ? describe : describe.skip;
let schemaCreated = false;

usePostgres("Movie DAOs with PostgreSQL", () => {
  beforeAll(async () => {
    if (!/_test$/i.test(testDatabaseName)) {
      throw new Error(
        'Refusing to run PostgreSQL integration tests: TEST_DB_NAME must end with "_test".',
      );
    }

    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    schemaCreated = true;

    const schemaPath = fileURLToPath(
      new URL("../../../db/schema.sql", import.meta.url),
    );
    const schemaSql = await readFile(path.resolve(schemaPath), "utf8");
    const client = await databasePool.connect();
    try {
      await client.query(schemaSql);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await databasePool.end();
    if (schemaCreated) {
      await adminPool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    }
    await adminPool.end();
  });

  test("persists OMDb movie fields and reads them back", async () => {
    const savedMovie = await upsertMovie(
      {
        imdbId: "tt0780504",
        title: "Drive",
        description: "A stunt driver gets involved in a heist.",
        durationMinutes: 100,
        releaseYear: 2011,
        ageRating: "R",
        posterUrl: "https://example.test/drive.jpg",
      },
      databasePool,
    );

    expect(savedMovie).toMatchObject({
      imdb_id: "tt0780504",
      title: "Drive",
      duration_minutes: 100,
      release_year: 2011,
      poster_url: "https://example.test/drive.jpg",
      age_rating: "R",
    });

    const listedMovies = await listMovies(
      {
        releaseYear: 2011,
        limit: 20,
        offset: 0,
      },
      databasePool,
    );
    expect(listedMovies.total).toBe(1);
    expect(listedMovies.items[0]).toMatchObject({
      imdbId: "tt0780504",
      title: "Drive",
      releaseYear: 2011,
      posterUrl: "https://example.test/drive.jpg",
      ageRating: "R",
    });

    await expect(
      findMovieById(savedMovie.id, databasePool),
    ).resolves.toMatchObject({
      id: savedMovie.id,
      imdbId: "tt0780504",
      title: "Drive",
    });
  });

  test("upserts by IMDb ID instead of inserting duplicates", async () => {
    const original = await upsertMovie(
      {
        imdbId: "tt0133093",
        title: "The Matrix",
        durationMinutes: 136,
        releaseYear: 1999,
        ageRating: "R",
        posterUrl: null,
        description: null,
      },
      databasePool,
    );

    const updated = await upsertMovie(
      {
        imdbId: "tt0133093",
        title: "The Matrix (Updated)",
        durationMinutes: 136,
        releaseYear: 1999,
        ageRating: null,
        posterUrl: null,
        description: "Updated plot.",
      },
      databasePool,
    );

    const result = await listMovies({ limit: 20, offset: 0 }, databasePool);
    expect(updated.id).toBe(original.id);
    expect(result.total).toBe(2);
    expect(
      result.items.find((movie) => movie.imdbId === "tt0133093"),
    ).toMatchObject({
      title: "The Matrix (Updated)",
      description: "Updated plot.",
      ageRating: null,
    });
  });

  test("rolls back a failed write without leaving a partial movie row", async () => {
    await expect(
      upsertMovie(
        {
          imdbId: "tt0000001",
          title: "Invalid Runtime",
          durationMinutes: 0,
          releaseYear: 2026,
          ageRating: "PG",
          posterUrl: null,
          description: null,
        },
        databasePool,
      ),
    ).rejects.toThrow();

    const result = await listMovies(
      { query: "Invalid Runtime", limit: 20, offset: 0 },
      databasePool,
    );
    expect(result.total).toBe(0);
  });
});
