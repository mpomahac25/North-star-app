import { pool } from "../../db/pool.js";
import { findMovieById } from "./movieReadDao.js";

function uniqueNames(values) {
    const names = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : []) {
        if (typeof value !== "string") continue;

        const name = value.trim();
        const key = name.toLowerCase();

        if (!name || key === "n/a" || seen.has(key)) continue;

        names.push(name);
        seen.add(key);
    }

    return names;
}

async function upsertNamedEntity(client, table, name) {
    const result = await client.query(
        `INSERT INTO ${table} (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
        [name],
    );

    return result.rows[0].id;
}

async function replaceMovieRelations(
    client,
    movieId,
    names,
    entityTable,
    relationTable,
    entityColumn,
) {
    await client.query(
        `DELETE FROM ${relationTable} WHERE movie_id = $1`,
        [movieId],
    );

    for (const [index, name] of uniqueNames(names).entries()) {
        const entityId = await upsertNamedEntity(client, entityTable, name);

        await client.query(
            `INSERT INTO ${relationTable} (movie_id, ${entityColumn}, display_order)
       VALUES ($1, $2, $3)`,
            [movieId, entityId, index + 1],
        );
    }
}

async function replaceMovieCredits(client, movieId, movie) {
    await client.query(
        "DELETE FROM movie_credits WHERE movie_id = $1",
        [movieId],
    );

    const creditGroups = [
        ["director", movie.directors],
        ["writer", movie.writers],
        ["actor", movie.actors],
    ];

    for (const [creditType, names] of creditGroups) {
        for (const [index, name] of uniqueNames(names).entries()) {
            const personId = await upsertNamedEntity(client, "people", name);

            await client.query(
                `INSERT INTO movie_credits (
          movie_id, person_id, credit_type, display_order
        )
        VALUES ($1, $2, $3, $4)`,
                [movieId, personId, creditType, index + 1],
            );
        }
    }
}

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
                release_year, age_rating_id, poster_url,
                release_date, country, awards, imdb_rating,
                imdb_votes, box_office
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (imdb_id) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                duration_minutes = EXCLUDED.duration_minutes,
                release_year = EXCLUDED.release_year,
                age_rating_id = EXCLUDED.age_rating_id,
                poster_url = EXCLUDED.poster_url,
                release_date = EXCLUDED.release_date,
                country = EXCLUDED.country,
                awards = EXCLUDED.awards,
                imdb_rating = EXCLUDED.imdb_rating,
                imdb_votes = EXCLUDED.imdb_votes,
                box_office = EXCLUDED.box_office
             RETURNING id`,
          [
              movie.imdbId,
              movie.title,
              movie.description,
              movie.durationMinutes,
              movie.releaseYear,
              ageRatingId,
              movie.posterUrl,
              movie.releaseDate ?? null,
              movie.country ?? null,
              movie.awards ?? null,
              movie.imdbRating ?? null,
              movie.imdbVotes ?? null,
              movie.boxOffice ?? null,
          ],
      );

      const movieId = result.rows[0].id;

      await replaceMovieRelations(
          client,
          movieId,
          movie.genres,
          "genres",
          "movie_genres",
          "genre_id",
      );

      await replaceMovieRelations(
          client,
          movieId,
          movie.languages,
          "languages",
          "movie_languages",
          "language_id",
      );

      await replaceMovieCredits(client, movieId, movie);

      const savedMovie = await findMovieById(movieId, client);

      await client.query("COMMIT");
      return savedMovie;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
