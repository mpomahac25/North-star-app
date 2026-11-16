ALTER TABLE movies
    ADD COLUMN imdb_id VARCHAR(20);

ALTER TABLE movies
    ADD CONSTRAINT movies_imdb_id_unique UNIQUE (imdb_id);
