import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";

const readDaoMocks = {
  findMovieById: jest.fn(),
  listMovies: jest.fn(),
};
const writeDaoMocks = { upsertMovie: jest.fn() };
const originalMoviesApiUrl = process.env.MOVIES_API_URL;
process.env.MOVIES_API_URL = "http://movies.test:3005";

jest.unstable_mockModule("../../dao/movies/movieReadDao.js", () => readDaoMocks);
jest.unstable_mockModule("../../dao/movies/movieWriteDao.js", () => writeDaoMocks);

const {
  getComingSoonMovies,
  importMovieByTitle,
  MovieCatalogError,
} = await import("../../services/movieCatalogService.js");

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Movie catalog service", () => {
  beforeEach(() => {
    jest.spyOn(globalThis, "fetch");
    readDaoMocks.findMovieById.mockReset();
    readDaoMocks.listMovies.mockReset();
    writeDaoMocks.upsertMovie.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (originalMoviesApiUrl === undefined) {
      delete process.env.MOVIES_API_URL;
    } else {
      process.env.MOVIES_API_URL = originalMoviesApiUrl;
    }
  });

  test("fetches by exact title and persists normalized OMDb fields through the write DAO", async () => {
    const omdbMovie = {
      Title: "Drive",
      Year: "2011",
      imdbID: "tt0780504",
      Runtime: "100 min",
      Plot: "A driver gets caught in a robbery.",
      Rated: "R",
      Poster: "https://example.test/drive.jpg",
    };
    const savedMovie = { id: 42, imdb_id: "tt0780504", title: "Drive" };
    fetch.mockResolvedValueOnce(jsonResponse(omdbMovie));
    writeDaoMocks.upsertMovie.mockResolvedValueOnce(savedMovie);

    await expect(importMovieByTitle("Drive", "2011")).resolves.toBe(savedMovie);

    const requestUrl = new URL(fetch.mock.calls[0][0]);
    expect(requestUrl.origin).toBe("http://movies.test:3005");
    expect(requestUrl.pathname).toBe("/api/movies/title");
    expect(requestUrl.searchParams.get("title")).toBe("Drive");
    expect(requestUrl.searchParams.get("year")).toBe("2011");
    expect(writeDaoMocks.upsertMovie).toHaveBeenCalledWith({
      imdbId: "tt0780504",
      title: "Drive",
      description: "A driver gets caught in a robbery.",
      durationMinutes: 100,
      releaseYear: 2011,
      ageRating: "R",
      posterUrl: "https://example.test/drive.jpg",
    });
  });

  test("normalizes OMDb N/A optional fields to null", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({
      Title: "Mystery",
      Year: "2026",
      imdbID: "tt1234567",
      Runtime: "90 min",
      Plot: "N/A",
      Rated: "N/A",
      Poster: "N/A",
    }));
    writeDaoMocks.upsertMovie.mockResolvedValueOnce({ id: 1 });

    await importMovieByTitle("Mystery");

    expect(writeDaoMocks.upsertMovie).toHaveBeenCalledWith(expect.objectContaining({
      description: null,
      ageRating: null,
      posterUrl: null,
      releaseYear: 2026,
    }));
  });

  test("rejects movies without runtime before writing to the database", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({
      Title: "Drive",
      Year: "2011",
      imdbID: "tt0780504",
      Runtime: "N/A",
    }));

    await expect(importMovieByTitle("Drive", "2011")).rejects.toMatchObject({
      name: "MovieCatalogError",
      status: 422,
      message: "OMDb did not provide a runtime required by the movies table.",
    });
    expect(writeDaoMocks.upsertMovie).not.toHaveBeenCalled();
  });

  test("rejects incomplete OMDb data before writing to the database", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({
      Title: "Drive",
      Runtime: "100 min",
    }));

    await expect(importMovieByTitle("Drive")).rejects.toMatchObject({
      name: "MovieCatalogError",
      status: 502,
      message: "OMDb returned incomplete movie data.",
    });
    expect(writeDaoMocks.upsertMovie).not.toHaveBeenCalled();
  });

  test("converts a movies-service not-found response into a 404 catalog error", async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ error: "Movie not found." }, 404));

    await expect(importMovieByTitle("No such movie")).rejects.toMatchObject({
      name: "MovieCatalogError",
      status: 404,
      message: "Movie not found.",
    });
    expect(writeDaoMocks.upsertMovie).not.toHaveBeenCalled();
  });

  test("converts movies-service connection errors into a 502 catalog error", async () => {
    fetch.mockRejectedValueOnce(new Error("connection refused"));

    await expect(importMovieByTitle("Drive")).rejects.toMatchObject({
      name: "MovieCatalogError",
      status: 502,
      message: "Could not connect to the movies service.",
    });
    expect(writeDaoMocks.upsertMovie).not.toHaveBeenCalled();
  });

  test("passes 2026 catalog movies to the frontend response shape", async () => {
    readDaoMocks.listMovies.mockResolvedValueOnce({
      total: 1,
      items: [{
        imdbId: "tt0780504",
        title: "Drive",
        releaseYear: 2026,
        posterUrl: "https://example.test/poster.jpg",
      }],
    });

    await expect(getComingSoonMovies()).resolves.toEqual([{
      imdbId: "tt0780504",
      title: "Drive",
      year: 2026,
      poster: "https://example.test/poster.jpg",
    }]);
    expect(readDaoMocks.listMovies).toHaveBeenCalledWith({
      releaseYear: 2026,
      limit: 1000,
      offset: 0,
    });
  });

  test("uses a supplied year when loading Coming Soon movies", async () => {
    readDaoMocks.listMovies.mockResolvedValueOnce({ total: 0, items: [] });

    await expect(getComingSoonMovies(2011)).resolves.toEqual([]);
    expect(readDaoMocks.listMovies).toHaveBeenCalledWith(expect.objectContaining({
      releaseYear: 2011,
    }));
  });

  test("exports the catalog error type for route-level error handling", () => {
    expect(new MovieCatalogError("failure", 502)).toBeInstanceOf(Error);
  });
});
