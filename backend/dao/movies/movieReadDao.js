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
        releaseDate: row.release_date,
        ageRating: row.age_rating,
        posterUrl: row.poster_url,
        country: row.country,
        awards: row.awards,
        imdbRating: row.imdb_rating === null ? null : Number(row.imdb_rating),
        imdbVotes: row.imdb_votes,
        boxOffice: row.box_office,
        genres: row.genres,
        directors: row.directors,
        writers: row.writers,
        actors: row.actors,
        languages: row.languages,
    };
}

const movieFields = `
    m.id,
    m.imdb_id,
    m.title,
    m.description,
    m.duration_minutes,
    m.release_year,
    m.release_date::text AS release_date,
    m.poster_url,
    m.country,
    m.awards,
    m.imdb_rating,
    m.imdb_votes,
    m.box_office,
    ar.rating AS age_rating,

    ARRAY(
        SELECT g.name
        FROM movie_genres mg
        JOIN genres g ON g.id = mg.genre_id
        WHERE mg.movie_id = m.id
        ORDER BY mg.display_order
    ) AS genres,

    ARRAY(
        SELECT p.name
        FROM movie_credits mc
        JOIN people p ON p.id = mc.person_id
        WHERE mc.movie_id = m.id
          AND mc.credit_type = 'director'
        ORDER BY mc.display_order
    ) AS directors,

    ARRAY(
        SELECT p.name
        FROM movie_credits mc
        JOIN people p ON p.id = mc.person_id
        WHERE mc.movie_id = m.id
          AND mc.credit_type = 'writer'
        ORDER BY mc.display_order
    ) AS writers,

    ARRAY(
        SELECT p.name
        FROM movie_credits mc
        JOIN people p ON p.id = mc.person_id
        WHERE mc.movie_id = m.id
          AND mc.credit_type = 'actor'
        ORDER BY mc.display_order
    ) AS actors,

    ARRAY(
        SELECT l.name
        FROM movie_languages ml
        JOIN languages l ON l.id = ml.language_id
        WHERE ml.movie_id = m.id
        ORDER BY ml.display_order
    ) AS languages
`;

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

export async function listMovies(
  { query, releaseYear, limit, offset },
  database = pool,
) {
  const { values, where } = buildFilters({ query, releaseYear });
  const countResult = await database.query(
    `SELECT COUNT(*)::INTEGER AS total
         FROM movies m
         ${where}`,
    values,
  );

  const pageValues = [...values, limit, offset];
    const result = await database.query(
        `SELECT ${movieFields}
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

export async function findMovieById(id, database = pool) {
    const result = await database.query(
        `SELECT ${movieFields}
         FROM movies m
         LEFT JOIN age_ratings ar ON ar.id = m.age_rating_id
         WHERE m.id = $1`,
        [id],
    );

    return mapMovie(result.rows[0]);
}

export async function findMovieByImdbId(imdbId, database = pool) {
    const result = await database.query(
        `SELECT ${movieFields}
     FROM movies m
     LEFT JOIN age_ratings ar ON ar.id = m.age_rating_id
     WHERE m.imdb_id = $1`,
        [imdbId],
    );

    return mapMovie(result.rows[0]);
}

export async function listNowShowingMovies(database = pool) {
    const result = await database.query(
        `SELECT
        m.id,
        m.imdb_id,
        m.title,
        m.release_year,
        m.poster_url,
        s.id AS screening_id,
        s.start_time,
        t.name AS theatre_name,
        t.city AS theatre_city
     FROM movies m
     JOIN screenings s ON s.movie_id = m.id
     JOIN rooms r ON r.id = s.room_id
     JOIN theatres t ON t.id = r.theatre_id
     WHERE s.start_time >= NOW()
     ORDER BY s.start_time ASC, m.title ASC, s.id ASC`,
    );

    const movies = new Map();

    for (const row of result.rows) {
        if (!movies.has(row.id)) {
            movies.set(row.id, {
                id: row.id,
                imdbId: row.imdb_id,
                title: row.title,
                releaseYear: row.release_year,
                posterUrl: row.poster_url,
                screenings: [],
            });
        }

        movies.get(row.id).screenings.push({
            id: row.screening_id,
            startTime: row.start_time,
            theatreName: row.theatre_name,
            city: row.theatre_city,
        });
    }

    return Array.from(movies.values());
}

export async function listUpcomingScreeningsByMovieId(movieId, database = pool) {
    const result = await database.query(
        `SELECT
        s.id,
        s.start_time,
        s.end_time,
        r.name AS room_name,
        t.name AS theatre_name,
        t.city
     FROM screenings s
     JOIN rooms r ON r.id = s.room_id
     JOIN theatres t ON t.id = r.theatre_id
     WHERE s.movie_id = $1
       AND s.start_time >= NOW()
     ORDER BY s.start_time ASC, s.id ASC`,
        [movieId],
    );

    return result.rows.map((row) => ({
        id: row.id,
        startTime: row.start_time,
        endTime: row.end_time,
        roomName: row.room_name,
        theatreName: row.theatre_name,
        city: row.city,
    }));
}
