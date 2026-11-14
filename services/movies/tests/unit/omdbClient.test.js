import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import {
  getMovieById,
  getMovieByTitle,
  searchMovies,
} from "../../omdbClient.js";

const originalApiKey = process.env.OMDB_API_KEY;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OMDb client", () => {
  beforeEach(() => {
    process.env.OMDB_API_KEY = "test-key";
    jest.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalApiKey === undefined) {
      delete process.env.OMDB_API_KEY;
    } else {
      process.env.OMDB_API_KEY = originalApiKey;
    }
  });

  test("searches by query and includes page, year, type, and API key", async () => {
    const payload = {
      Search: [{ Title: "Drive", Year: "2011", imdbID: "tt0780504" }],
      totalResults: "1",
      Response: "True",
    };
    fetch.mockResolvedValueOnce(jsonResponse(payload));

    await expect(
      searchMovies({ query: "Drive", page: 2, year: "2011", type: "movie" }),
    ).resolves.toEqual(payload);

    const requestUrl = new URL(fetch.mock.calls[0][0]);
    expect(requestUrl.origin).toBe("https://www.omdbapi.com");
    expect(requestUrl.searchParams.get("apikey")).toBe("test-key");
    expect(requestUrl.searchParams.get("s")).toBe("Drive");
    expect(requestUrl.searchParams.get("page")).toBe("2");
    expect(requestUrl.searchParams.get("y")).toBe("2011");
    expect(requestUrl.searchParams.get("type")).toBe("movie");
  });

  test("returns an empty search result when OMDb reports no matches", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse({
        Response: "False",
        Error: "Movie not found!",
      }),
    );

    await expect(
      searchMovies({ query: "No such title", page: 1 }),
    ).resolves.toEqual({ Search: [], totalResults: "0", Response: "True" });
  });

  test("loads a movie by exact title and optional year", async () => {
    const payload = { Title: "Drive", Year: "2011", imdbID: "tt0780504" };
    fetch.mockResolvedValueOnce(jsonResponse(payload));

    await expect(getMovieByTitle("Drive", "2011")).resolves.toEqual(payload);

    const requestUrl = new URL(fetch.mock.calls[0][0]);
    expect(requestUrl.searchParams.get("t")).toBe("Drive");
    expect(requestUrl.searchParams.get("y")).toBe("2011");
    expect(requestUrl.searchParams.get("plot")).toBe("full");
  });

  test("loads a movie by IMDb ID", async () => {
    const payload = { Title: "Drive", imdbID: "tt0780504" };
    fetch.mockResolvedValueOnce(jsonResponse(payload));

    await expect(getMovieById("tt0780504")).resolves.toEqual(payload);

    const requestUrl = new URL(fetch.mock.calls[0][0]);
    expect(requestUrl.searchParams.get("i")).toBe("tt0780504");
    expect(requestUrl.searchParams.get("plot")).toBe("full");
  });

  test("fails with 503 without calling OMDb when the API key is missing", async () => {
    delete process.env.OMDB_API_KEY;

    await expect(getMovieByTitle("Drive")).rejects.toMatchObject({
      name: "OmdbError",
      status: 503,
      message: "Movies service is not configured with an OMDb API key.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("maps an invalid API key response to 503", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse({ Error: "Invalid API key!" }, 401),
    );

    await expect(getMovieByTitle("Drive")).rejects.toMatchObject({
      name: "OmdbError",
      status: 503,
      message: expect.stringContaining("OMDb rejected the API key"),
    });
  });

  test("returns 404 for an exact-title lookup with no match", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse({
        Response: "False",
        Error: "Movie not found!",
      }),
    );

    await expect(getMovieByTitle("No such title")).rejects.toMatchObject({
      name: "OmdbError",
      status: 404,
      message: "Movie not found.",
    });
  });

  test("translates a timeout into an OMDb timeout error", async () => {
    const timeoutError = new Error("request timed out");
    timeoutError.name = "TimeoutError";
    fetch.mockRejectedValueOnce(timeoutError);

    await expect(getMovieByTitle("Drive")).rejects.toMatchObject({
      name: "OmdbError",
      status: 502,
      message: "OMDb request timed out.",
    });
  });

  test("translates network failures into a connection error", async () => {
    fetch.mockRejectedValueOnce(new Error("network unavailable"));

    await expect(getMovieByTitle("Drive")).rejects.toMatchObject({
      status: 502,
      message: "Could not connect to OMDb.",
    });
  });

  test("handles malformed JSON from OMDb", async () => {
    fetch.mockResolvedValueOnce(new Response("not json", { status: 200 }));

    await expect(getMovieByTitle("Drive")).rejects.toMatchObject({
      status: 502,
      message: "OMDb returned an invalid response.",
    });
  });

  test("surfaces OMDb HTTP errors as gateway errors", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse({ Error: "Service unavailable" }, 500),
    );

    await expect(getMovieByTitle("Drive")).rejects.toMatchObject({
      status: 502,
      message: "OMDb returned HTTP 500: Service unavailable.",
    });
  });
});
