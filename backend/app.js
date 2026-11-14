/* This file will handle the following:
 *  - create and configure express instance
 *  - register and configure middleware and API routes
 *  - configure request validation
 *  - export express app
 */

import express from "express";
import { pool } from "./db/pool.js";
import {
  getComingSoonMovies,
  getMovie,
  getMovieList,
  importMovieByTitle,
  MovieCatalogError,
} from "./services/movieCatalogService.js";

const app = express();
const SERVICE_IDENTIFIER = "backend";
const MOVIES_API_URL = process.env.MOVIES_API_URL || "http://localhost:3005";

app.use(express.json());

app.get("/api/live", (req, res) => {
  res.json({
    status: "alive",
    service: SERVICE_IDENTIFIER,
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: SERVICE_IDENTIFIER,
  });
});

app.get("/api/ready", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.json({
      status: "ready",
      service: SERVICE_IDENTIFIER,
      database: "ready",
    });
  } catch {
    return res.status(503).json({
      status: "not-ready",
      service: SERVICE_IDENTIFIER,
      database: "unavailable",
    });
  }
});

app.get("/api/movies/coming-soon", async (req, res) => {
  const year = req.query.year === undefined ? 2026 : Number(req.query.year);
  if (!Number.isInteger(year) || year < 1888 || year > 2100) {
    return res.status(400).json({
      error: {
        code: "INVALID_RELEASE_YEAR",
        message: 'Query parameter "year" must be a year from 1888 to 2100.',
      },
    });
  }

  try {
    return res.json(await getComingSoonMovies(year));
  } catch (error) {
    console.error("Could not load Coming Soon movies from PostgreSQL:", error);
    return res.status(500).json({
      error: {
        code: "MOVIE_CATALOG_READ_FAILED",
        message: "Could not load movies from the database.",
      },
    });
  }
});

app.get("/api/movies", async (req, res) => {
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
  const query =
    typeof req.query.q === "string" ? req.query.q.trim() : undefined;
  const releaseYear =
    req.query.year === undefined ? undefined : Number(req.query.year);

  if (!Number.isInteger(page) || page < 1) {
    return res
      .status(400)
      .json({
        error: {
          code: "INVALID_PAGE",
          message: "Page must be a positive integer.",
        },
      });
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res
      .status(400)
      .json({
        error: {
          code: "INVALID_LIMIT",
          message: "Limit must be between 1 and 100.",
        },
      });
  }
  if (query !== undefined && query.length > 100) {
    return res
      .status(400)
      .json({
        error: {
          code: "INVALID_QUERY",
          message: "Search query cannot exceed 100 characters.",
        },
      });
  }
  if (
    releaseYear !== undefined &&
    (!Number.isInteger(releaseYear) || releaseYear < 1888 || releaseYear > 2100)
  ) {
    return res
      .status(400)
      .json({
        error: {
          code: "INVALID_RELEASE_YEAR",
          message: "Year must be from 1888 to 2100.",
        },
      });
  }

  try {
    const result = await getMovieList({
      query: query || undefined,
      releaseYear,
      limit,
      offset: (page - 1) * limit,
    });
    return res.json({ ...result, page, limit });
  } catch (error) {
    console.error("Could not list movies from PostgreSQL:", error);
    return res.status(500).json({
      error: {
        code: "MOVIE_CATALOG_READ_FAILED",
        message: "Could not load movies from the database.",
      },
    });
  }
});

app.get("/api/movies/search", async (req, res) => {
  try {
    const queryString = new URLSearchParams(req.query).toString();
    const targetUrl = new URL(
      `/api/movies/search?${queryString}`,
      MOVIES_API_URL,
    );

    const response = await fetch(targetUrl);
    const data = await response.json();

    return res.status(response.status).json(data);
  } catch (error) {
    console.error("Could not fetch search results from movies service:", error);
    return res.status(500).json({
      error: {
        code: "MOVIES_SERVICE_ERROR",
        message: "Could not fetch search results from the movies service.",
      },
    });
  }
});

app.get("/api/movies/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({
      error: {
        code: "INVALID_MOVIE_ID",
        message: "Movie ID must be a positive integer.",
      },
    });
  }

  try {
    const movie = await getMovie(id);
    if (!movie) {
      return res.status(404).json({
        error: { code: "MOVIE_NOT_FOUND", message: "Movie was not found." },
      });
    }
    return res.json(movie);
  } catch (error) {
    console.error("Could not read movie from PostgreSQL:", error);
    return res.status(500).json({
      error: {
        code: "MOVIE_CATALOG_READ_FAILED",
        message: "Could not load movie from the database.",
      },
    });
  }
});

app.post("/api/movies/import", async (req, res) => {
  const title =
    typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const year = req.body?.year === undefined ? undefined : String(req.body.year);

  if (!title || title.length > 100) {
    return res.status(400).json({
      error: {
        code: "INVALID_TITLE",
        message: "Title must contain 1 to 100 characters.",
      },
    });
  }
  if (year !== undefined && !/^\d{4}$/.test(year)) {
    return res.status(400).json({
      error: {
        code: "INVALID_RELEASE_YEAR",
        message: "Year must be a four-digit year.",
      },
    });
  }

  try {
    const movie = await importMovieByTitle(title, year);
    return res.status(200).json(movie);
  } catch (error) {
    if (error instanceof MovieCatalogError) {
      return res.status(error.status).json({
        error: { code: "MOVIE_IMPORT_FAILED", message: error.message },
      });
    }
    console.error("Could not import movie into PostgreSQL:", error);
    return res.status(500).json({
      error: {
        code: "MOVIE_IMPORT_FAILED",
        message: "Could not save movie to the database.",
      },
    });
  }
});

// MUST BE KEPT AFTER ALL ROUTES!!!
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: "The requested API route does not exist.",
    },
  });
});

export default app;
