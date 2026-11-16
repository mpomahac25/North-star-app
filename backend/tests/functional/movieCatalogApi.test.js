import { afterEach, describe, expect, jest, test } from "@jest/globals";
import request from "supertest";

const movieCatalogMocks = {
    getComingSoonMovies: jest.fn(),
    getMovie: jest.fn(),
    getMovieByImdbId: jest.fn(),
    getMovieList: jest.fn(),
    getNowShowingMovies: jest.fn(),
    getUpcomingMovieScreenings: jest.fn(),
    importMovieByTitle: jest.fn(),
};
const poolMock = { query: jest.fn() };

class MockMovieCatalogError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "MovieCatalogError";
    this.status = status;
  }
}

jest.unstable_mockModule("../../services/movieCatalogService.js", () => ({
  ...movieCatalogMocks,
  MovieCatalogError: MockMovieCatalogError,
}));
jest.unstable_mockModule("../../db/pool.js", () => ({ pool: poolMock }));

const { default: app } = await import("../../app.js");

describe("Movie catalog API routes", () => {
  afterEach(() => {
    movieCatalogMocks.getComingSoonMovies.mockReset();
    movieCatalogMocks.getMovie.mockReset();
    movieCatalogMocks.getMovieList.mockReset();
    movieCatalogMocks.importMovieByTitle.mockReset();
    poolMock.query.mockReset();
    movieCatalogMocks.getMovieByImdbId.mockReset();
    movieCatalogMocks.getUpcomingMovieScreenings.mockReset();
    movieCatalogMocks.getNowShowingMovies.mockReset();
  });

  test("imports a movie by title and year without an authorization token", async () => {
    const savedMovie = { id: 1, imdbId: "tt0780504", title: "Drive" };
    movieCatalogMocks.importMovieByTitle.mockResolvedValueOnce(savedMovie);

    const response = await request(app)
      .post("/api/movies/import")
      .send({ title: "Drive", year: "2011" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(savedMovie);
    expect(movieCatalogMocks.importMovieByTitle).toHaveBeenCalledWith(
      "Drive",
      "2011",
    );
  });

  test("rejects invalid import inputs without calling the catalog service", async () => {
    const missingTitle = await request(app)
      .post("/api/movies/import")
      .send({ year: "2011" });
    const invalidYear = await request(app)
      .post("/api/movies/import")
      .send({ title: "Drive", year: "20xx" });

    expect(missingTitle.status).toBe(400);
    expect(missingTitle.body.error.code).toBe("INVALID_TITLE");
    expect(invalidYear.status).toBe(400);
    expect(invalidYear.body.error.code).toBe("INVALID_RELEASE_YEAR");
    expect(movieCatalogMocks.importMovieByTitle).not.toHaveBeenCalled();
  });

  test("returns catalog errors using their HTTP status", async () => {
    movieCatalogMocks.importMovieByTitle.mockRejectedValueOnce(
      new MockMovieCatalogError("Movie not found.", 404),
    );

    const response = await request(app)
      .post("/api/movies/import")
      .send({ title: "No such movie" });

    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({
      code: "MOVIE_IMPORT_FAILED",
      message: "Movie not found.",
    });
  });

  test("lists movies from the catalog using validated pagination and filters", async () => {
    movieCatalogMocks.getMovieList.mockResolvedValueOnce({
      items: [{ id: 1, title: "Drive", releaseYear: 2011 }],
      total: 1,
    });

    const response = await request(app)
      .get("/api/movies")
      .query({ q: "Drive", year: 2011, page: 2, limit: 5 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [{ id: 1, title: "Drive", releaseYear: 2011 }],
      total: 1,
      page: 2,
      limit: 5,
    });
    expect(movieCatalogMocks.getMovieList).toHaveBeenCalledWith({
      query: "Drive",
      releaseYear: 2011,
      limit: 5,
      offset: 5,
    });
  });

  test("returns a movie from PostgreSQL using its numerical ID", async () => {
    const movie = {
        id: 42,
        imdbId: "tt0780504",
        title: "Drive",
        releaseYear: 2011,
        genres: ["Action", "Drama"],
        directors: ["Nicolas Winding Refn"],
    };

    movieCatalogMocks.getMovie.mockResolvedValueOnce(movie);

    const response = await request(app).get("/api/movies/42");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(movie);
    expect(movieCatalogMocks.getMovie).toHaveBeenCalledWith(42);
    expect(movieCatalogMocks.getMovieByImdbId).not.toHaveBeenCalled();
  });

  test("returns 404 when a numerical movie ID does not exist", async () => {
    movieCatalogMocks.getMovie.mockResolvedValueOnce(null);

    const response = await request(app).get("/api/movies/999");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("MOVIE_NOT_FOUND");
    expect(movieCatalogMocks.getMovie).toHaveBeenCalledWith(999);
  });

  test("serves Coming Soon movies for the requested year", async () => {
    const movies = [
      {
        imdbId: "tt0780504",
        title: "Drive",
        year: 2011,
        poster: "https://example.test/drive.jpg",
      },
    ];
    movieCatalogMocks.getComingSoonMovies.mockResolvedValueOnce(movies);

    const response = await request(app)
      .get("/api/movies/coming-soon")
      .query({ year: 2011 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(movies);
    expect(movieCatalogMocks.getComingSoonMovies).toHaveBeenCalledWith(2011);
  });

  test("returns 503 when the PostgreSQL readiness query fails", async () => {
    poolMock.query.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await request(app).get("/api/ready");

    expect(response.status).toBe(503);
    expect(response.body.database).toBe("unavailable");
  });

  test("retrieves a movie using its IMDb ID", async () => {
    const movie = {
        id: 42,
        imdbId: "tt0780504",
        title: "Drive",
        releaseYear: 2011,
    };

    movieCatalogMocks.getMovieByImdbId.mockResolvedValueOnce(movie);

    const response = await request(app).get("/api/movies/tt0780504");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(movie);
    expect(movieCatalogMocks.getMovieByImdbId).toHaveBeenCalledWith("tt0780504");
    expect(movieCatalogMocks.getMovie).not.toHaveBeenCalled();
  });

  test("rejects invalid movie identifiers", async () => {
    const invalidNumericId = await request(app).get("/api/movies/0");
    const invalidImdbId = await request(app).get("/api/movies/ttinvalid");
    const invalidTextId = await request(app).get("/api/movies/invalid");

    expect(invalidNumericId.status).toBe(400);
    expect(invalidImdbId.status).toBe(400);
    expect(invalidTextId.status).toBe(400);

    expect(movieCatalogMocks.getMovie).not.toHaveBeenCalled();
    expect(movieCatalogMocks.getMovieByImdbId).not.toHaveBeenCalled();
  });

  test("returns 404 when an IMDb movie cannot be found", async () => {
    movieCatalogMocks.getMovieByImdbId.mockRejectedValueOnce(
        new MockMovieCatalogError("Movie not found.", 404),
    );

    const response = await request(app).get("/api/movies/tt9999999");

    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe("Movie not found.");
  });

  test("returns upcoming screenings for an existing movie", async () => {
    const movie = {
        id: 42,
        title: "Drive",
    };

    const screenings = [
        {
            id: 1,
            startTime: "2026-12-01T18:00:00.000Z",
            endTime: "2026-12-01T19:40:00.000Z",
            theatreName: "Rio Oulu",
            city: "Oulu",
            roomName: "Room 1",
        },
        {
            id: 2,
            startTime: "2026-12-02T19:00:00.000Z",
            endTime: "2026-12-02T20:40:00.000Z",
            theatreName: "Rio Tampere",
            city: "Tampere",
            roomName: "Room 2",
        },
    ];

    movieCatalogMocks.getMovie.mockResolvedValueOnce(movie);
    movieCatalogMocks.getUpcomingMovieScreenings.mockResolvedValueOnce(screenings);

    const response = await request(app).get("/api/movies/42/screenings");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(screenings);
    expect(movieCatalogMocks.getMovie).toHaveBeenCalledWith(42);
    expect(movieCatalogMocks.getUpcomingMovieScreenings).toHaveBeenCalledWith(42);
  });

  test("returns 404 for screenings of a nonexistent movie", async () => {
    movieCatalogMocks.getMovie.mockResolvedValueOnce(null);

    const response = await request(app).get("/api/movies/999/screenings");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("MOVIE_NOT_FOUND");
    expect(movieCatalogMocks.getUpcomingMovieScreenings).not.toHaveBeenCalled();
  });

  test("rejects invalid movie IDs when requesting screenings", async () => {
    const response = await request(app).get("/api/movies/invalid/screenings");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_MOVIE_ID");
    expect(movieCatalogMocks.getMovie).not.toHaveBeenCalled();
    expect(movieCatalogMocks.getUpcomingMovieScreenings).not.toHaveBeenCalled();
  });
});
