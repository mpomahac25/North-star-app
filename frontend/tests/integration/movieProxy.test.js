import express from "express";
import request from "supertest";
import { createServer } from "node:net";
import { jest } from "@jest/globals";
import { createApp } from "../../app.js";
import { assertApiError } from "../helpers/assertApiError.js";

describe("Frontend Movies API Proxy", () => {
  let backendServer;
  let app;
  let nonApiRequests;
  let internalAuthRequests;

  beforeAll(async () => {
    const backend = express();

    backend.post("/api/test-payload", express.json(), (req, res) => {
      return res.json({
        received: req.body,
      });
    });

    nonApiRequests = 0;
    internalAuthRequests = 0;

    backend.use("/api/internal/auth", (req, res) => {
      internalAuthRequests++;
      res.json({ shouldNotReachPublicProxy: true });
    });

    backend.get("/api/movies/search", (req, res) => {
      if (!req.query.q) {
        return res.status(400).json({
          error: {
            code: "INVALID_SEARCH_QUERY",
            message: "A search query is required.",
          },
        });
      }

      if (req.query.q === "missing") {
        return res.status(404).json({
          error: {
            code: "MOVIE_NOT_FOUND",
            message: "The requested movie does not exist.",
          },
        });
      }

      if (req.query.q === "unavailable") {
        return res.status(503).json({
          error: {
            code: "MOVIES_SERVICE_UNAVAILABLE",
            message: "The movies service is unavailable.",
          },
        });
      }

      return res.json({
        Search: [
          {
            imdbID: "tt1013752",
            Title: "Fast & Furious",
            Year: "2009",
            Poster: "N/A",
          },
        ],
        totalResults: "1",
        Response: "True",
        query: req.query.q,
        page: req.query.page,
        type: req.query.type,
      });
    });

    backend.get("/api/movies/coming-soon", (req, res) => {
      return res.json([
        {
          imdbId: "tt0780504",
          title: "Drive",
          year: "2011",
          poster: null,
        },
      ]);
    });

    backend.get("/not-an-api-route", (req, res) => {
      nonApiRequests++;

      return res.status(200).json({
        forwarded: true,
      });
    });

    await new Promise((resolve) => {
      backendServer = backend.listen(0, "127.0.0.1", resolve);
    });

    const port = backendServer.address().port;

    app = createApp(`http://127.0.0.1:${port}`);
  });

  afterAll(async () => {
    await new Promise((resolve, reject) => {
      backendServer.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  });

  test("Forwards movie search requests and query parameters", async () => {
    const response = await request(app).get("/api/movies/search").query({
      q: "Fast & Furious",
      page: "2",
      type: "movie",
    });

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      Search: [
        {
          imdbID: "tt1013752",
          Title: "Fast & Furious",
          Year: "2009",
          Poster: "N/A",
        },
      ],
      totalResults: "1",
      Response: "True",
      query: "Fast & Furious",
      page: "2",
      type: "movie",
    });
  });

  test("Forwards POST requests and JSON bodies without modification", async () => {
    const payload = {
      title: "Drive",
      year: "2011",
      metadata: {
        source: "OMDb",
      },
    };

    const response = await request(app).post("/api/test-payload").send(payload);

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      received: payload,
    });
  });

  test("Forwards featured movies requests", async () => {
    const response = await request(app).get("/api/movies/coming-soon");

    expect(response.status).toBe(200);

    expect(response.body).toEqual([
      {
        imdbId: "tt0780504",
        title: "Drive",
        year: "2011",
        poster: null,
      },
    ]);
  });

  test("Preserves HTTP 400 validation errors", async () => {
    const response = await request(app).get("/api/movies/search");

    assertApiError(response, 400, "INVALID_SEARCH_QUERY");

    expect(response.body.error.message).toBe("A search query is required.");
  });

  test("Preserves HTTP 404 resource errors", async () => {
    const response = await request(app).get("/api/movies/search").query({
      q: "missing",
    });

    assertApiError(response, 404, "MOVIE_NOT_FOUND");

    expect(response.body.error.message).toBe(
      "The requested movie does not exist.",
    );
  });

  test("Preserves HTTP 503 service errors", async () => {
    const response = await request(app).get("/api/movies/search").query({
      q: "unavailable",
    });

    assertApiError(response, 503, "MOVIES_SERVICE_UNAVAILABLE");

    expect(response.body.error.message).toBe(
      "The movies service is unavailable.",
    );
  });

  test("Does not forward requests outside the API", async () => {
    const response = await request(app).get("/not-an-api-route");

    expect(response.status).toBe(404);
    expect(nonApiRequests).toBe(0);
  });

  test("Does not expose auth persistence endpoints through the public proxy", async () => {
    const response = await request(app)
      .post("/api/internal/auth/google-users")
      .send({ subject: "attacker", email: "attacker@example.test" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
    expect(internalAuthRequests).toBe(0);
  });

  test("Returns standardized HTTP 502 when backend is unavailable", async () => {
    const temporaryServer = createServer();

    await new Promise((resolve) => {
      temporaryServer.listen(0, "127.0.0.1", resolve);
    });

    const unavailablePort = temporaryServer.address().port;

    await new Promise((resolve, reject) => {
      temporaryServer.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    const unavailableApp = createApp(`http://127.0.0.1:${unavailablePort}`);

    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      const response = await request(unavailableApp).get(
        "/api/movies/search?q=drive",
      );

      assertApiError(response, 502, "BACKEND_UNAVAILABLE");

      expect(response.body.error.message).toBe(
        "The backend service is unavailable.",
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
