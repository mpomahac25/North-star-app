import {
    findMovieById,
    findMovieByImdbId,
    listMovies,
    listNowShowingMovies,
    listUpcomingScreeningsByMovieId,
} from "../dao/movies/movieReadDao.js";
import { upsertMovie } from "../dao/movies/movieWriteDao.js";

const MOVIES_API_URL = process.env.MOVIES_API_URL || "http://localhost:3005";

function optionalOmdbText(value) {
    if (typeof value !== "string") return null;

    const text = value.trim();
    return text && text.toUpperCase() !== "N/A" ? text : null;
}

function parseOmdbList(value) {
    const text = optionalOmdbText(value);

    return text
        ? text.split(",").map((item) => item.trim()).filter(Boolean)
        : [];
}

function parseOmdbDate(value) {
    const text = optionalOmdbText(value);
    if (!text) return null;

    const match = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(text);
    if (!match) return null;

    const months = [
        "jan", "feb", "mar", "apr", "may", "jun",
        "jul", "aug", "sep", "oct", "nov", "dec",
    ];

    const day = Number(match[1]);
    const month = months.indexOf(match[2].toLowerCase());
    const year = Number(match[3]);

    if (month === -1) return null;

    const date = new Date(Date.UTC(year, month, day));

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return date.toISOString().slice(0, 10);
}

function parseOmdbRating(value) {
    const text = optionalOmdbText(value);
    if (!text) return null;

    const rating = Number(text);

    return Number.isFinite(rating) && rating >= 0 && rating <= 10
        ? rating
        : null;
}

function parseOmdbVotes(value) {
    const text = optionalOmdbText(value);
    if (!text || !/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) {
        return null;
    }

    const votes = Number(text.replaceAll(",", ""));

    return Number.isSafeInteger(votes) && votes >= 0 && votes <= 2147483647
        ? votes
        : null;
}

export class MovieCatalogError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "MovieCatalogError";
    this.status = status;
  }
}

function normalizeOmdbMovie(omdbMovie) {
    const durationMatch = /^\s*(\d+)\s+min\b/i.exec(omdbMovie?.Runtime || "");

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
        releaseDate: parseOmdbDate(omdbMovie.Released),
        genres: parseOmdbList(omdbMovie.Genre),
        directors: parseOmdbList(omdbMovie.Director),
        writers: parseOmdbList(omdbMovie.Writer),
        actors: parseOmdbList(omdbMovie.Actors),
        languages: parseOmdbList(omdbMovie.Language),
        country: optionalOmdbText(omdbMovie.Country),
        awards: optionalOmdbText(omdbMovie.Awards),
        imdbRating: parseOmdbRating(omdbMovie.imdbRating),
        imdbVotes: parseOmdbVotes(omdbMovie.imdbVotes),
        boxOffice: optionalOmdbText(omdbMovie.BoxOffice),
    };

    if (!movie.imdbId || !movie.title) {
        throw new MovieCatalogError("OMDb returned incomplete movie data.", 502);
    }

    return movie;
}

export async function getMovieList(options) {
  return listMovies(options);
}

export async function getMovie(id) {
  return findMovieById(id);
}

export async function getUpcomingMovieScreenings(movieId) {
    return listUpcomingScreeningsByMovieId(movieId);
}

export async function getMovieByImdbId(imdbId) {
    const cachedMovie = await findMovieByImdbId(imdbId);

    if (cachedMovie) {
        return cachedMovie;
    }

    const url = new URL(
        `/api/movies/${encodeURIComponent(imdbId)}`,
        MOVIES_API_URL,
    );

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

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message =
            typeof data?.error === "string"
                ? data.error
                : data?.error?.message ||
                `Movies service returned HTTP ${response.status}.`;

        throw new MovieCatalogError(
            message,
            response.status === 404 ? 404 : 502,
        );
    }

    if (!data) {
        throw new MovieCatalogError(
            "Movies service returned an invalid response.",
            502,
        );
    }

    return upsertMovie(normalizeOmdbMovie(data));
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

export async function getNowShowingMovies() {
    return listNowShowingMovies();
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

  return upsertMovie(normalizeOmdbMovie(omdbMovie));
}
