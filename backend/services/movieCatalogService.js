import { timingSafeEqual } from "node:crypto";
import { findMovieById, listMovies } from "../dao/movies/movieReadDao.js";
import { upsertMovie } from "../dao/movies/movieWriteDao.js";

const MOVIES_API_URL = process.env.MOVIES_API_URL || "http://localhost:3005";

export class MovieCatalogError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "MovieCatalogError";
    this.status = status;
  }
}

export async function getMovieList(options) {
  return listMovies(options);
}

export async function getMovie(id) {
  return findMovieById(id);
}

export async function getComingSoonMovies(year = 2026) {
  const result = await listMovies({
    releaseYear: year,
    limit: 1000,
    offset: 0,
  });

  return result.items.map((movie) => ({
    imdbId: movie.imdbId,
    title: movie.title,
    year: movie.releaseYear,
    poster: movie.posterUrl,
  }));
}

export function isCatalogWriteAuthorized(authorizationHeader = "") {
  const expectedToken = process.env.MOVIES_CATALOG_WRITE_TOKEN;

  if (!expectedToken) {
    return process.env.NODE_ENV !== "production";
  }

  const [scheme, suppliedToken] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !suppliedToken) return false;

  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);
  return (
    expected.length === supplied.length && timingSafeEqual(expected, supplied)
  );
}

export async function importMovieByTitle(title, year) {
  const url = new URL("/api/movies/title", MOVIES_API_URL);
  url.searchParams.set("title", title);
  if (year) url.searchParams.set("year", year);

  let response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    const message =
      error.name === "TimeoutError"
        ? "Movies service request timed out."
        : "Could not connect to the movies service.";
    throw new MovieCatalogError(message, 502);
  }

  const omdbMovie = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof omdbMovie?.error === "string"
        ? omdbMovie.error
        : omdbMovie?.error?.message ||
          `Movies service returned HTTP ${response.status}.`;
    throw new MovieCatalogError(message, response.status === 404 ? 404 : 502);
  }

  const durationMatch = /^\s*(\d+)\s+min\b/i.exec(omdbMovie.Runtime || "");
  if (!durationMatch) {
    throw new MovieCatalogError(
      "OMDb did not provide a runtime required by the movies table.",
      422,
    );
  }

  const yearMatch = /\b(\d{4})\b/.exec(omdbMovie.Year || "");
  const movie = {
    imdbId: omdbMovie.imdbID,
    title: omdbMovie.Title,
    description:
      omdbMovie.Plot && omdbMovie.Plot !== "N/A" ? omdbMovie.Plot : null,
    durationMinutes: Number(durationMatch[1]),
    releaseYear: yearMatch ? Number(yearMatch[1]) : null,
    ageRating:
      omdbMovie.Rated && omdbMovie.Rated !== "N/A" ? omdbMovie.Rated : null,
    posterUrl:
      omdbMovie.Poster && omdbMovie.Poster !== "N/A" ? omdbMovie.Poster : null,
  };

  if (!movie.imdbId || !movie.title) {
    throw new MovieCatalogError("OMDb returned incomplete movie data.", 502);
  }

  return upsertMovie(movie);
}
