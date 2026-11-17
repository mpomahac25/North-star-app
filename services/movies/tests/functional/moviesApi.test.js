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

  test("validates title lookup inputs before calling OMDb", async () => {
    const missingTitle = await request(app).get("/api/movies/title");
    const invalidYear = await request(app)
      .get("/api/movies/title")
      .query({ title: "Drive", year: "20xx" });

    expect(missingTitle.status).toBe(400);
    expect(missingTitle.body.error).toContain('"title"');
    expect(invalidYear.status).toBe(400);
    expect(invalidYear.body.error).toContain('"year"');
    expect(fetch).not.toHaveBeenCalled();
  });

  test("validates search query, page, year, and type before calling OMDb", async () => {
    const missingQuery = await request(app).get("/api/movies/search");
    const invalidPage = await request(app)
      .get("/api/movies/search")
      .query({ q: "Drive", page: 0 });
    const invalidYear = await request(app)
      .get("/api/movies/search")
      .query({ q: "Drive", year: "201x" });
    const invalidType = await request(app)
      .get("/api/movies/search")
      .query({ q: "Drive", type: "documentary" });

    expect(missingQuery.status).toBe(400);
    expect(invalidPage.status).toBe(400);
    expect(invalidYear.status).toBe(400);
    expect(invalidType.status).toBe(400);
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

  test("maps an OMDb missing-key response to HTTP 503", async () => {
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
});
