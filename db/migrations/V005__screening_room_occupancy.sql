CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

ALTER TABLE screenings
ADD CONSTRAINT screenings_room_occupancy_no_overlap
EXCLUDE USING gist (
    room_id public.gist_int4_ops WITH =,
    tsrange(
        (start_time AT TIME ZONE 'UTC') - INTERVAL '27 minutes',
        (end_time AT TIME ZONE 'UTC') + INTERVAL '18 minutes',
        '[)'
    ) WITH &&
);