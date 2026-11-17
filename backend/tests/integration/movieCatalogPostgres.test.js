import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import {
    findMovieById,
    listMovies,
    listNowShowingMovies,
    listUpcomingScreeningsByMovieId,
} from "../../dao/movies/movieReadDao.js";
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

    const migrationsPath = fileURLToPath(
      new URL("../../../db/migrations/", import.meta.url),
    );
    const migrationFiles = (await readdir(migrationsPath))
      .filter((file) => /^V\d+__.*\.sql$/.test(file))
      .sort();
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
  });

  afterAll(async () => {
    await databasePool.end();
    if (schemaCreated) {
      await adminPool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    }
    await adminPool.end();
  });

  async function withScreeningFixtures(callback) {
    const client = await databasePool.connect();

    try {
        await client.query("BEGIN");

        const movieResult = await client.query(`
        INSERT INTO movies (title, duration_minutes, release_year)
        VALUES
            ('Screening Test A', 100, 2026),
            ('Screening Test B', 110, 2026),
            ('Screening Test Empty', 90, 2026)
        RETURNING id, title
        `);

        const movieIds = Object.fromEntries(
            movieResult.rows.map((row) => [row.title, row.id]),
        );

        const theatreResult = await client.query(`
        INSERT INTO theatres (name, city, address)
        VALUES
            ('Rio Oulu', 'Oulu', 'Test Address 1'),
            ('Rio Tampere', 'Tampere', 'Test Address 2')
        RETURNING id, city
        `);

        const theatreIds = Object.fromEntries(
            theatreResult.rows.map((row) => [row.city, row.id]),
        );

        const roomResult = await client.query(`
        INSERT INTO rooms (theatre_id, name, capacity)
        VALUES
            ($1, 'Room 1', 80),
            ($2, 'Room 2', 60)
        RETURNING id, theatre_id`,
            [theatreIds.Oulu, theatreIds.Tampere],
        );

        const ouluRoom = roomResult.rows.find(
            (row) => row.theatre_id === theatreIds.Oulu,
        );

        const tampereRoom = roomResult.rows.find(
            (row) => row.theatre_id === theatreIds.Tampere,
        );

        const now = Date.now();
        const hour = 60 * 60 * 1000;

        async function insertScreening(movieId, roomId, startTime) {
            const endTime = new Date(startTime.getTime() + 2 * hour);

            const result = await client.query(`
            INSERT INTO screenings (movie_id, room_id, start_time, end_time, ticket_price)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id`,
                [movieId, roomId, startTime, endTime, 12.5],
            );

            return {
                id: result.rows[0].id,
                startTime,
                endTime,
            };
        }

        const movieId = movieIds["Screening Test A"];
        const otherMovieId = movieIds["Screening Test B"];
        const emptyMovieId = movieIds["Screening Test Empty"];

        const past = await insertScreening(
            movieId,
            ouluRoom.id,
            new Date(now - 4 * hour),
        );

        const late = await insertScreening(
            movieId,
            tampereRoom.id,
            new Date(now + 6 * hour),
        );

        const early = await insertScreening(
            movieId,
            ouluRoom.id,
            new Date(now + hour),
        );

        const other = await insertScreening(
            otherMovieId,
            tampereRoom.id,
            new Date(now + 2 * hour),
        );

        await callback({
            client,
            movieId,
            otherMovieId,
            emptyMovieId,
            past,
            early,
            late,
            other,
        });
    } finally {
        try {
            await client.query("ROLLBACK");
        } finally {
            client.release();
        }
    }
  }

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
        releaseDate: "2011-09-16",
        genres: ["Action", "Drama"],
        directors: ["Nicolas Winding Refn"],
        writers: ["Hossein Amini", "James Sallis"],
        actors: ["Ryan Gosling", "Carey Mulligan"],
        languages: ["English", "Spanish"],
        country: "United States",
        awards: "Nominated for 1 Oscar.",
        imdbRating: 7.8,
        imdbVotes: 775952,
        boxOffice: "$35,061,555",
      },
      databasePool,
    );

    expect(savedMovie).toMatchObject({
        imdbId: "tt0780504",
        title: "Drive",
        durationMinutes: 100,
        releaseYear: 2011,
        ageRating: "R",
        posterUrl: "https://example.test/drive.jpg",
        releaseDate: "2011-09-16",
        genres: ["Action", "Drama"],
        directors: ["Nicolas Winding Refn"],
        writers: ["Hossein Amini", "James Sallis"],
        actors: ["Ryan Gosling", "Carey Mulligan"],
        languages: ["English", "Spanish"],
        country: "United States",
        awards: "Nominated for 1 Oscar.",
        imdbRating: 7.8,
        imdbVotes: 775952,
        boxOffice: "$35,061,555",
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
      releaseDate: "2011-09-16",
      genres: ["Action", "Drama"],
      directors: ["Nicolas Winding Refn"],
      writers: ["Hossein Amini", "James Sallis"],
      actors: ["Ryan Gosling", "Carey Mulligan"],
      languages: ["English", "Spanish"],
      imdbRating: 7.8,
      imdbVotes: 775952,
    });

    await expect(
      findMovieById(savedMovie.id, databasePool),
    ).resolves.toMatchObject({
      id: savedMovie.id,
      imdbId: "tt0780504",
      title: "Drive",
    });

    const storedGenres = await databasePool.query(
        `SELECT g.name
            FROM movie_genres mg
            JOIN genres g ON g.id = mg.genre_id
            WHERE mg.movie_id = $1
            ORDER BY mg.display_order`,
        [savedMovie.id],
    );

    expect(storedGenres.rows.map((row) => row.name)).toEqual([
        "Action",
        "Drama",
    ]);

    const storedCredits = await databasePool.query(
        `SELECT p.name, mc.credit_type
            FROM movie_credits mc
            JOIN people p ON p.id = mc.person_id
            WHERE mc.movie_id = $1
            ORDER BY mc.credit_type, mc.display_order`,
        [savedMovie.id],
    );

    expect(storedCredits.rows).toEqual([
        { name: "Ryan Gosling", credit_type: "actor" },
        { name: "Carey Mulligan", credit_type: "actor" },
        { name: "Nicolas Winding Refn", credit_type: "director" },
        { name: "Hossein Amini", credit_type: "writer" },
        { name: "James Sallis", credit_type: "writer" },
    ]);
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
        genres: ["Action", "Sci-Fi"],
        directors: ["Lana Wachowski", "Lilly Wachowski"],
        writers: ["Lana Wachowski", "Lilly Wachowski"],
        actors: ["Keanu Reeves", "Laurence Fishburne"],
        languages: ["English"],
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
        genres: ["Action", "Thriller"],
        directors: ["Lana Wachowski", "Lilly Wachowski"],
        writers: ["Lana Wachowski", "Lilly Wachowski"],
        actors: ["Keanu Reeves"],
        languages: ["English", "French"],
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

    expect(updated.genres).toEqual(["Action", "Thriller"]);
    expect(updated.actors).toEqual(["Keanu Reeves"]);
    expect(updated.languages).toEqual(["English", "French"]);

    const storedRelations = await databasePool.query(
        `SELECT
          (SELECT COUNT(*)::INTEGER
          FROM movie_genres
          WHERE movie_id = $1) AS genres,
          (SELECT COUNT(*)::INTEGER
          FROM movie_languages
          WHERE movie_id = $1) AS languages,
          (SELECT COUNT(*)::INTEGER
          FROM movie_credits
          WHERE movie_id = $1) AS credits`,
        [updated.id],
    );

    expect(storedRelations.rows[0]).toEqual({
        genres: 2,
        languages: 2,
        credits: 5,
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

  test("returns only upcoming screenings for the requested movie in chronological order", async () => {
    await withScreeningFixtures(async ({
        client,
        movieId,
        emptyMovieId,
        early,
        late,
    }) => {
        const screenings = await listUpcomingScreeningsByMovieId(
            movieId,
            client,
        );

        expect(screenings).toEqual([
            {
                id: early.id,
                startTime: early.startTime,
                endTime: early.endTime,
                roomName: "Room 1",
                theatreName: "Rio Oulu",
                city: "Oulu",
            },
            {
                id: late.id,
                startTime: late.startTime,
                endTime: late.endTime,
                roomName: "Room 2",
                theatreName: "Rio Tampere",
                city: "Tampere",
            },
        ]);

        await expect(
            listUpcomingScreeningsByMovieId(emptyMovieId, client),
        ).resolves.toEqual([]);
    });
  });

  test("groups now-showing movies with their upcoming screenings", async () => {
    await withScreeningFixtures(async ({
        client,
        movieId,
        otherMovieId,
        early,
        late,
        other,
    }) => {
        const movies = await listNowShowingMovies(client);

        expect(movies).toEqual([
            {
                id: movieId,
                imdbId: null,
                title: "Screening Test A",
                releaseYear: 2026,
                posterUrl: null,
                screenings: [
                    {
                        id: early.id,
                        startTime: early.startTime,
                        theatreName: "Rio Oulu",
                        city: "Oulu",
                    },
                    {
                        id: late.id,
                        startTime: late.startTime,
                        theatreName: "Rio Tampere",
                        city: "Tampere",
                    },
                ],
            },
            {
                id: otherMovieId,
                imdbId: null,
                title: "Screening Test B",
                releaseYear: 2026,
                posterUrl: null,
                screenings: [
                    {
                        id: other.id,
                        startTime: other.startTime,
                        theatreName: "Rio Tampere",
                        city: "Tampere",
                    },
                ],
            },
        ]);
    });
  });
});
