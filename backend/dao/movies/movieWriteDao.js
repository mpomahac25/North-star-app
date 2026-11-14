import { pool } from "../../db/pool.js";

export async function upsertMovie(movie, database = pool) {
  const client = await database.connect();

  try {
    await client.query("BEGIN");

    let ageRatingId = null;
    if (movie.ageRating) {
      const ratingResult = await client.query(
        `INSERT INTO age_ratings (rating)
                 VALUES ($1)
                 ON CONFLICT (rating) DO UPDATE SET rating = EXCLUDED.rating
                 RETURNING id`,
        [movie.ageRating],
      );
      ageRatingId = ratingResult.rows[0].id;
    }

    const result = await client.query(
      `INSERT INTO movies (
                imdb_id, title, description, duration_minutes,
                release_year, age_rating_id, poster_url
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (imdb_id) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                duration_minutes = EXCLUDED.duration_minutes,
                release_year = EXCLUDED.release_year,
                age_rating_id = EXCLUDED.age_rating_id,
                poster_url = EXCLUDED.poster_url
             RETURNING id`,
      [
        movie.imdbId,
        movie.title,
        movie.description,
        movie.durationMinutes,
        movie.releaseYear,
        ageRatingId,
        movie.posterUrl,
      ],
    );

    const savedMovie = await client.query(
      `SELECT m.id, m.imdb_id, m.title, m.description,
                    m.duration_minutes, m.release_year, m.poster_url,
                    ar.rating AS age_rating
             FROM movies m
             LEFT JOIN age_ratings ar ON ar.id = m.age_rating_id
             WHERE m.id = $1`,
      [result.rows[0].id],
    );

    await client.query("COMMIT");
    return savedMovie.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
