INSERT INTO users (
    id, username, email, password_hash
)
VALUES (
    900001,
    'migration_test_user',
    'migration-test@example.com',
    'test_password_hash'
);

INSERT INTO age_ratings (
    id, rating
)
VALUES (
    900001, 'PG-13'
);

INSERT INTO movies (
    id, title, duration_minutes, age_rating_id, release_year
)
VALUES (
    900001, 'Migration Test Movie', 120, 900001, 2024
);

INSERT INTO theatres (
    id, name, city, address
)
VALUES (
    900001,
    'Migration Test Theatre',
    'Oulu',
    'Test Street 1'
);

INSERT INTO rooms (
    id, theatre_id, name, capacity
)
VALUES (
    900001, 900001, 'Test Room', 100
);

INSERT INTO screenings (
    id, movie_id, room_id,
    start_time, end_time, ticket_price
)
VALUES (
    900001, 900001, 900001,
    '2026-12-01 18:00:00+02',
    '2026-12-01 20:00:00+02',
    12.50
);

INSERT INTO order_statuses (
    id, name
)
VALUES (
    900001, 'pending'
);

INSERT INTO reservation_statuses (
    id, name
)
VALUES (
    900001, 'reserved'
);

INSERT INTO orders (
    id, user_id, status_id
)
VALUES (
    900001, 900001, 900001
);

INSERT INTO reservations (
    id, order_id, screening_id,
    seat_row, seat_number, status_id, price
)
VALUES (
    900001, 900001, 900001,
    1, 1, 900001, 12.50
);