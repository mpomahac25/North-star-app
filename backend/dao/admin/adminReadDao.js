import { pool } from "../../db/pool.js";

const BASE_TICKET_PRICE = 13.0;

function mapScreeningRow(row) {
    const ticketPrice = Number(row.ticket_price);
    return {
        id: row.id,
        movieId: row.movie_id,
        movieTitle: row.movie_title,
        city: row.city,
        roomName: row.room_name,
        capacity: row.capacity,
        date: row.date,
        startTime: row.start_time,
        ticketPrice,
        isFirstScreening: ticketPrice > BASE_TICKET_PRICE,
    };
}

export async function listAdminSales(database = pool) {
    const result = await database.query(
        `SELECT
            s.id,
            s.movie_id,
            m.title AS movie_title,
            t.city,
            r.name AS room_name,
            r.capacity,
            TO_CHAR(s.start_time AT TIME ZONE t.timezone, 'YYYY-MM-DD') AS date,
            TO_CHAR(s.start_time AT TIME ZONE t.timezone, 'HH24:MI') AS showtime,
            s.ticket_price,
            COUNT(res.id) FILTER (WHERE rs.name IS DISTINCT FROM 'cancelled')::INTEGER AS seats_sold,
            COALESCE(
                SUM(res.price) FILTER (WHERE rs.name IS DISTINCT FROM 'cancelled'),
                0
            )::NUMERIC(10, 2) AS revenue
         FROM screenings s
         JOIN movies m ON m.id = s.movie_id
         JOIN rooms r ON r.id = s.room_id
         JOIN theatres t ON t.id = r.theatre_id
         LEFT JOIN reservations res
            ON res.screening_id = s.id
           AND NOT (res.seat_row = 1 AND res.seat_number = 1)
         LEFT JOIN reservation_statuses rs ON rs.id = res.status_id
         GROUP BY s.id, m.title, t.city, r.name, r.capacity, t.timezone, s.start_time, s.ticket_price
         ORDER BY s.start_time ASC, s.id ASC`,
    );

    return result.rows.map((row) => ({
        id: row.id,
        movieId: row.movie_id,
        movieTitle: row.movie_title,
        city: row.city,
        roomName: row.room_name,
        capacity: row.capacity,
        date: row.date,
        showtime: row.showtime,
        ticketPrice: Number(row.ticket_price),
        seatsSold: row.seats_sold,
        revenue: Number(row.revenue),
    }));
}

export async function listAdminScreenings(database = pool) {
    const result = await database.query(
        `SELECT
            s.id,
            s.movie_id,
            m.title AS movie_title,
            t.city,
            r.name AS room_name,
            r.capacity,
            TO_CHAR(s.start_time AT TIME ZONE t.timezone, 'YYYY-MM-DD') AS date,
            TO_CHAR(s.start_time AT TIME ZONE t.timezone, 'HH24:MI') AS start_time,
            s.ticket_price
         FROM screenings s
         JOIN movies m ON m.id = s.movie_id
         JOIN rooms r ON r.id = s.room_id
         JOIN theatres t ON t.id = r.theatre_id
         ORDER BY s.start_time ASC, s.id ASC`,
    );

    return result.rows.map(mapScreeningRow);
}

export async function listAdminTheatres(database = pool) {
    const theatresRes = await database.query(
        `SELECT id, name, city, address, timezone
         FROM theatres
         ORDER BY city ASC, name ASC, id ASC`,
    );

    const roomsRes = await database.query(
        `SELECT id, theatre_id, name, capacity
         FROM rooms
         ORDER BY name ASC, id ASC`,
    );

    const roomsByTheatreId = new Map();
    for (const row of roomsRes.rows) {
        const list = roomsByTheatreId.get(row.theatre_id) || [];
        list.push({
            id: row.id,
            theatreId: row.theatre_id,
            name: row.name,
            capacity: row.capacity,
        });
        roomsByTheatreId.set(row.theatre_id, list);
    }

    return theatresRes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        city: row.city,
        address: row.address,
        timezone: row.timezone,
        rooms: roomsByTheatreId.get(row.id) || [],
    }));
}
