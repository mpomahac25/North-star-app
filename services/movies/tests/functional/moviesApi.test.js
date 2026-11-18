import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import request from "supertest";
import app from "../../app.js";

const originalApiKey = process.env.OMDB_API_KEY;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Movies API routes", () => {
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

  test.each([
    [{}, "title"],
    [{ title: "" }, "title"],
    [{ title: "   " }, "title"],
    [{ title: "A".repeat(101) }, "title"],
    [{ title: "Drive", year: "20xx" }, "year"],
    [{ title: "Drive", year: "201" }, "year"],
  ])("rejects invalid title lookup parameters %j", async (params, field) => {
    const response = await request(app)
        .get("/api/movies/title")
        .query(params);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain(`"${field}"`);
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each([
    [{}, "q"],
    [{ q: "" }, "q"],
    [{ q: "   " }, "q"],
    [{ q: "A".repeat(101) }, "q"],
    [{ q: "Drive", page: 0 }, "page"],
    [{ q: "Drive", page: 101 }, "page"],
    [{ q: "Drive", page: 1.5 }, "page"],
    [{ q: "Drive", year: "201x" }, "year"],
    [{ q: "Drive", type: "documentary" }, "type"],
  ])("rejects invalid search parameters %j", async (params, field) => {
    const response = await request(app)
        .get("/api/movies/search")
        .query(params);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain(`"${field}"`);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("returns exact-title OMDb data and forwards title and year", async () => {
    const payload = {
      Title: "Drive",
      Year: "2011",
      imdbID: "tt0780504",
      Runtime: "100 min",
    };
    fetch.mockResolvedValueOnce(jsonResponse(payload));

    const response = await request(app)
      .get("/api/movies/title")
      .query({ title: "Drive", year: "2011" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    const requestUrl = new URL(fetch.mock.calls[0][0]);
    expect(requestUrl.searchParams.get("t")).toBe("Drive");
    expect(requestUrl.searchParams.get("y")).toBe("2011");
  });

  test("returns search results from OMDb", async () => {
    const payload = {
      Search: [{ Title: "Drive", Year: "2011", imdbID: "tt0780504" }],
      totalResults: "1",
      Response: "True",
    };
    fetch.mockResolvedValueOnce(jsonResponse(payload));

    const response = await request(app)
      .get("/api/movies/search")
      .query({ q: "Drive", page: 1, year: "2011", type: "movie" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    const requestUrl = new URL(fetch.mock.calls[0][0]);
    expect(requestUrl.searchParams.get("s")).toBe("Drive");
    expect(requestUrl.searchParams.get("page")).toBe("1");
    expect(requestUrl.searchParams.get("y")).toBe("2011");
    expect(requestUrl.searchParams.get("type")).toBe("movie");
  });

  test("validates IMDb IDs and returns movie details", async () => {
    const invalidId = await request(app).get("/api/movies/not-an-imdb-id");
    expect(invalidId.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();

    const payload = { Title: "Drive", imdbID: "tt0780504" };
    fetch.mockResolvedValueOnce(jsonResponse(payload));
    const response = await request(app).get("/api/movies/tt0780504");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    const requestUrl = new URL(fetch.mock.calls[0][0]);
    expect(requestUrl.searchParams.get("i")).toBe("tt0780504");
  });

  test("maps an invalid OMDb API key response to HTTP 503", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse({ Error: "Invalid API key!" }, 401),
    );

    const response = await request(app)
      .get("/api/movies/title")
      .query({ title: "Drive" });

    expect(response.status).toBe(503);
    expect(response.body.error).toContain("OMDb rejected the API key");
  });

  test("maps an OMDb title miss to HTTP 404", async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse({
        Response: "False",
        Error: "Movie not found!",
      }),
    );

    const response = await request(app)
      .get("/api/movies/title")
      .query({ title: "No such title" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Movie not found." });
  });

  test("maps an OMDb timeout to HTTP 502", async () => {
    const timeoutError = new Error("request timed out");
    timeoutError.name = "TimeoutError";
    fetch.mockRejectedValueOnce(timeoutError);

    const response = await request(app)
      .get("/api/movies/title")
      .query({ title: "Drive" });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: "OMDb request timed out." });
  });

  test("normalizes title lookup input before forwarding it to OMDb", async () => {
    const payload = {
        Title: "Drive",
        Year: "2011",
        imdbID: "tt0780504",
    };

    fetch.mockResolvedValueOnce(jsonResponse(payload));

    const response = await request(app)
        .get("/api/movies/title")
        .query({
            title: "  Drive  ",
            year: "2011",
        });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);

    const requestUrl = new URL(fetch.mock.calls[0][0]);

    expect(requestUrl.searchParams.get("t")).toBe("Drive");
    expect(requestUrl.searchParams.get("y")).toBe("2011");
  });

  test("uses the default search page and trims the search query", async () => {
    const payload = {
        Search: [],
        totalResults: "0",
        Response: "True",
    };

    fetch.mockResolvedValueOnce(jsonResponse(payload));

    const response = await request(app)
        .get("/api/movies/search")
        .query({ q: "  Drive  " });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);

    const requestUrl = new URL(fetch.mock.calls[0][0]);

    expect(requestUrl.searchParams.get("s")).toBe("Drive");
    expect(requestUrl.searchParams.get("page")).toBe("1");
    expect(requestUrl.searchParams.has("y")).toBe(false);
    expect(requestUrl.searchParams.has("type")).toBe(false);
  });

  test("returns HTTP 404 when an IMDb ID is not found", async () => {
    fetch.mockResolvedValueOnce(
        jsonResponse({
            Response: "False",
            Error: "Movie not found!",
        }),
    );

    const response = await request(app)
        .get("/api/movies/tt9999999");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
        error: "Movie not found.",
    });
  });

  test("returns HTTP 502 when OMDb provides invalid response data", async () => {
    fetch.mockResolvedValueOnce(jsonResponse(null));

    const response = await request(app)
        .get("/api/movies/title")
        .query({ title: "Drive" });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
        error: "OMDb returned an invalid response.",
    });
  });
});
