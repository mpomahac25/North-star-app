import express from "express";
import {
  getMovieById,
  getMovieByTitle,
  OmdbError,
  searchMovies,
} from "./omdbClient.js";

const app = express();
const SERVICE_IDENTIFIER = "movies-api";

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

// Non-strict search by title /api/movies/search?q=Drive
app.get("/api/movies/search", async (req, res, next) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const year =
    req.query.year === undefined ? undefined : String(req.query.year);
  const type =
    req.query.type === undefined ? undefined : String(req.query.type);

  if (!query || query.length > 100) {
    return res.status(400).json({
      error: 'Query parameter "q" must contain 1 to 100 characters.',
    });
  }

  if (!Number.isInteger(page) || page < 1 || page > 100) {
    return res.status(400).json({
      error: 'Query parameter "page" must be an integer from 1 to 100.',
    });
  }

  if (year !== undefined && !/^\d{4}$/.test(year)) {
    return res.status(400).json({
      error: 'Query parameter "year" must be a four-digit year.',
    });
  }

  if (type !== undefined && !["movie", "series", "episode"].includes(type)) {
    return res.status(400).json({
      error: 'Query parameter "type" must be movie, series, or episode.',
    });
  }

  try {
    const movies = await searchMovies({ query, page, year, type });
    return res.json(movies);
  } catch (error) {
    return next(error);
  }
});

// Search by title and year /api/movies/title?title=Drive&year=2011
app.get("/api/movies/title", async (req, res, next) => {
  const title =
    typeof req.query.title === "string" ? req.query.title.trim() : "";
  const year =
    req.query.year === undefined ? undefined : String(req.query.year);

  if (!title || title.length > 100) {
    return res.status(400).json({
      error: 'Query parameter "title" must contain 1 to 100 characters.',
    });
  }

  if (year !== undefined && !/^\d{4}$/.test(year)) {
    return res.status(400).json({
      error: 'Query parameter "year" must be a four-digit year.',
    });
  }

  try {
    const movie = await getMovieByTitle(title, year);
    return res.json(movie);
  } catch (error) {
    return next(error);
  }
});

// Search by id /api/movies/tt0780504
app.get("/api/movies/:imdbId", async (req, res, next) => {
  const { imdbId } = req.params;

  if (!/^tt\d+$/.test(imdbId)) {
    return res.status(400).json({
      error: "Movie ID must be an IMDb ID, such as tt0780504.",
    });
  }

  try {
    const movie = await getMovieById(imdbId);
    return res.json(movie);
  } catch (error) {
    return next(error);
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const status = error instanceof OmdbError ? error.status : 500;
  const message =
    status === 500 ? "Internal movies service error." : error.message;

  if (status === 500) {
    console.error("Movies service error:", error);
  }

  return res.status(status).json({ error: message });
});

export default app;
