
-- 1. USERS
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. MOVIES
CREATE TABLE movies (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    age_rating VARCHAR(10),
    poster_url TEXT
);

-- 3. THEATRES
CREATE TABLE theatres (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL
);

-- 4. ROOMS
CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,
    theatre_id INTEGER NOT NULL REFERENCES theatres(id),
    name VARCHAR(50) NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),

    UNIQUE (theatre_id, name)
);

-- 5. SCREENINGS
CREATE TABLE screenings (
    id SERIAL PRIMARY KEY,
    movie_id INTEGER NOT NULL REFERENCES movies(id),
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    ticket_price NUMERIC(8,2) NOT NULL CHECK (ticket_price >= 0),

    CHECK (end_time > start_time)
);

-- 6. ORDERS
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'cancelled'))
);

-- 7. RESERVATIONS
CREATE TABLE reservations (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    screening_id INTEGER NOT NULL REFERENCES screenings(id),
    seat_row INTEGER NOT NULL CHECK (seat_row > 0),
    seat_number INTEGER NOT NULL CHECK (seat_number > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'cancelled')),
    price NUMERIC(8,2) NOT NULL CHECK (price >= 0),

    UNIQUE (screening_id, seat_row, seat_number)
);
