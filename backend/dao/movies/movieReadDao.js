import { pool } from "../../db/pool.js";

function mapMovie(row) {
  if (!row) return null;

  return {
    id: row.id,
    imdbId: row.imdb_id,
    title: row.title,
    description: row.description,
    durationMinutes: row.duration_minutes,
    releaseYear: row.release_year,
    ageRating: row.age_rating,
    posterUrl: row.poster_url,
  };
}

function buildFilters({ query, releaseYear }) {
  const values = [];
  const conditions = [];

  if (query) {
    values.push(`%${query}%`);
    conditions.push(`m.title ILIKE $${values.length}`);
  }

  if (releaseYear !== undefined) {
    values.push(releaseYear);
    conditions.push(`m.release_year = $${values.length}`);
  }

  return {
    values,
    where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
  };
}

export async function listMovies({ query, releaseYear, limit, offset }) {
  const { values, where } = buildFilters({ query, releaseYear });
  const countResult = await pool.query(
    `SELECT COUNT(*)::INTEGER AS total
         FROM movies m
         ${where}`,
    values,
  );

  const pageValues = [...values, limit, offset];
  const result = await pool.query(
    `SELECT m.id, m.imdb_id, m.title, m.description,
                m.duration_minutes, m.release_year, m.poster_url,
                ar.rating AS age_rating
         FROM movies m
         LEFT JOIN age_ratings ar ON ar.id = m.age_rating_id
         ${where}
         ORDER BY m.release_year DESC NULLS LAST, m.title ASC
         LIMIT $${pageValues.length - 1}
         OFFSET $${pageValues.length}`,
    pageValues,
  );

  return {
    items: result.rows.map(mapMovie),
    total: countResult.rows[0].total,
  };
}

export async function findMovieById(id) {
  const result = await pool.query(
    `SELECT m.id, m.imdb_id, m.title, m.description,
                m.duration_minutes, m.release_year, m.poster_url,
                ar.rating AS age_rating
         FROM movies m
         LEFT JOIN age_ratings ar ON ar.id = m.age_rating_id
         WHERE m.id = $1`,
    [id],
  );

  return mapMovie(result.rows[0]);
}
