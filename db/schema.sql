-- 1. USERS
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AGE RATINGS
CREATE TABLE age_ratings (
    id SERIAL PRIMARY KEY,
    rating VARCHAR(20) NOT NULL UNIQUE
);

-- 3. MOVIES
CREATE TABLE movies (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    age_rating_id INTEGER REFERENCES age_ratings(id),
    poster_url TEXT
);

-- 4. THEATRES
CREATE TABLE theatres (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Europe/Helsinki'
);

-- 5. ROOMS
CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,
    theatre_id INTEGER NOT NULL REFERENCES theatres(id),
    name VARCHAR(50) NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),

    UNIQUE (theatre_id, name)
);

-- 6. SCREENINGS
CREATE TABLE screenings (
    id SERIAL PRIMARY KEY,
    movie_id INTEGER NOT NULL REFERENCES movies(id),
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    ticket_price NUMERIC(8,2) NOT NULL CHECK (ticket_price >= 0),

    CHECK (end_time > start_time)
);

-- 7. ORDER STATUSES
CREATE TABLE order_statuses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(30) NOT NULL UNIQUE
);

-- 8. ORDERS
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status_id INTEGER NOT NULL REFERENCES order_statuses(id)
);

-- 9. RESERVATION STATUSES
CREATE TABLE reservation_statuses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(30) NOT NULL UNIQUE
);

-- 10. RESERVATIONS
CREATE TABLE reservations (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    screening_id INTEGER NOT NULL REFERENCES screenings(id),
    seat_row INTEGER NOT NULL CHECK (seat_row > 0),
    seat_number INTEGER NOT NULL CHECK (seat_number > 0),
    status_id INTEGER NOT NULL REFERENCES reservation_statuses(id),
    price NUMERIC(8,2) NOT NULL CHECK (price >= 0)
);

-- PREVENT DOUBLE BOOKING
CREATE UNIQUE INDEX unique_active_seat
ON reservations (screening_id, seat_row, seat_number);