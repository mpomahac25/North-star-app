import { afterEach, describe, expect, jest, test } from "@jest/globals";
import request from "supertest";

const movieCatalogMocks = {
  getComingSoonMovies: jest.fn(),
  getMovie: jest.fn(),
  getMovieList: jest.fn(),
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
});
