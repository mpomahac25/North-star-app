ALTER TABLE movies
    ADD COLUMN release_date DATE,
    ADD COLUMN country TEXT,
    ADD COLUMN awards TEXT,
    ADD COLUMN imdb_rating NUMERIC(3,1)
        CHECK (imdb_rating BETWEEN 0 AND 10),
    ADD COLUMN imdb_votes INTEGER
        CHECK (imdb_votes >= 0),
    ADD COLUMN box_office TEXT;

CREATE TABLE genres (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE movie_genres (
    movie_id INTEGER NOT NULL
        REFERENCES movies(id) ON DELETE CASCADE,
    genre_id INTEGER NOT NULL
        REFERENCES genres(id),
    display_order INTEGER NOT NULL
        CHECK (display_order > 0),

    PRIMARY KEY (movie_id, genre_id),
    UNIQUE (movie_id, display_order)
);

CREATE TABLE people (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE movie_credits (
    movie_id INTEGER NOT NULL
        REFERENCES movies(id) ON DELETE CASCADE,
    person_id INTEGER NOT NULL
        REFERENCES people(id),
    credit_type VARCHAR(20) NOT NULL
        CHECK (credit_type IN ('actor', 'director', 'writer')),
    display_order INTEGER NOT NULL
        CHECK (display_order > 0),

    PRIMARY KEY (movie_id, person_id, credit_type),
    UNIQUE (movie_id, credit_type, display_order)
);

CREATE TABLE languages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE movie_languages (
    movie_id INTEGER NOT NULL
        REFERENCES movies(id) ON DELETE CASCADE,
    language_id INTEGER NOT NULL
        REFERENCES languages(id),
    display_order INTEGER NOT NULL
        CHECK (display_order > 0),

    PRIMARY KEY (movie_id, language_id),
    UNIQUE (movie_id, display_order)
);