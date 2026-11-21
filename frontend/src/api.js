const USE_ADMIN_MOCK = true;

const MOCK_LIBRARY_MOVIES = [
    {
        id: 1,
        imdbId: "tt9376612",
        title: "Shang-Chi",
        releaseYear: 2021,
        durationMinutes: 132,
        directors: ["Destin Daniel Cretton"],
        posterUrl:
            "https://m.media-amazon.com/images/M/MV5BNTliYjlkNDQtMjFlNS00NjgzLWFmMWEtYmM2Mzc2Zjg3ZjEyXkEyXkFqcGdeQXVyMTkxNjUyNQ@@._V1_SX300.jpg",
    },
    {
        id: 2,
        imdbId: "tt1825683",
        title: "Black Panther",
        releaseYear: 2018,
        durationMinutes: 134,
        directors: ["Ryan Coogler"],
        posterUrl:
            "https://m.media-amazon.com/images/M/MV5BMTg1MTY2MjYzNV5BMl5BanBnXkFtZTgwMTc4NTMwNDI@._V1_SX300.jpg",
    },
    {
        id: 3,
        imdbId: "tt0899043",
        title: "The Amateur",
        releaseYear: 2025,
        durationMinutes: 123,
        directors: ["James Hawes"],
        posterUrl:
            "https://m.media-amazon.com/images/M/MV5BYjhkZjM3ZWYtMjUxMS00YzhlLTkxZWYtM2QxMzQ1NzI2NWU1XkEyXkFqcGc@._V1_SX300.jpg",
    },
];

const MOCK_OMDB_CATALOG = [
    ...MOCK_LIBRARY_MOVIES,
    {
        id: null,
        imdbId: "tt15239678",
        title: "Dune: Part Two",
        releaseYear: 2024,
        durationMinutes: 166,
        directors: ["Denis Villeneuve"],
        posterUrl:
            "https://m.media-amazon.com/images/M/MV5BNTc0YmQxMjEtODI5MC00NjFiLTlkMWUtOGQ5NjFmYWUyZGViXkEyXkFqcGc@._V1_SX300.jpg",
    },
    {
        id: null,
        imdbId: "tt15398776",
        title: "Oppenheimer",
        releaseYear: 2023,
        durationMinutes: 180,
        directors: ["Christopher Nolan"],
        posterUrl:
            "https://m.media-amazon.com/images/M/MV5BMDBmYTZjNjUtN2M1MS00MTQ2LTk2ODgtNzc2M2QyZGE5NTVjXkEyXkFqcGdeQXVyNzAwMjU2MTY@._V1_SX300.jpg",
    },
    {
        id: null,
        imdbId: "tt0816692",
        title: "Interstellar",
        releaseYear: 2014,
        durationMinutes: 169,
        directors: ["Christopher Nolan"],
        posterUrl:
            "https://m.media-amazon.com/images/M/MV5BZjdkOTU3MDktN2IxOS00OGEyLWFmMjktY2FiMmZkNWIyODZiXkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_SX300.jpg",
    },
];

const MOCK_SALES_SCREENINGS = [
    {
        id: 101,
        movieId: 1,
        movieTitle: "Shang-Chi",
        city: "Oulu",
        roomName: "Room 1",
        capacity: 100,
        dateKey: "today",
        dateLabel: "16.11.2026",
        showtime: "18:00",
        seatsSold: 68,
        revenue: 884.0,
    },
    {
        id: 102,
        movieId: 2,
        movieTitle: "Black Panther",
        city: "Tampere",
        roomName: "Room 2",
        capacity: 200,
        dateKey: "today",
        dateLabel: "16.11.2026",
        showtime: "20:00",
        seatsSold: 46,
        revenue: 601.0,
    },
    {
        id: 103,
        movieId: 3,
        movieTitle: "The Amateur",
        city: "Oulu",
        roomName: "Room 2",
        capacity: 200,
        dateKey: "tomorrow",
        dateLabel: "17.11.2026",
        showtime: "14:00",
        seatsSold: 32,
        revenue: 478.4,
    },
];

const MOCK_SCHEDULED_SCREENINGS = [
    {
        id: 201,
        movieId: 1,
        movieTitle: "Shang-Chi",
        city: "Oulu",
        roomName: "Room 1",
        capacity: 100,
        date: "2026-11-16",
        startTime: "18:00",
        isFirstScreening: false,
    },
    {
        id: 202,
        movieId: 2,
        movieTitle: "Black Panther",
        city: "Tampere",
        roomName: "Room 2",
        capacity: 200,
        date: "2026-11-16",
        startTime: "20:00",
        isFirstScreening: false,
    },
    {
        id: 203,
        movieId: 3,
        movieTitle: "The Amateur",
        city: "Oulu",
        roomName: "Room 2",
        capacity: 200,
        date: "2026-11-17",
        startTime: "14:00",
        isFirstScreening: true,
    },
];

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
        ...options,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error?.message || data.error || "Request failed.");
    }

    return data;
}

export async function fetchAdminDashboardInitialData() {
    if (USE_ADMIN_MOCK) {
        return {
            libraryMovies: structuredClone(MOCK_LIBRARY_MOVIES),
            omdbCatalog: structuredClone(MOCK_OMDB_CATALOG),
            salesScreenings: structuredClone(MOCK_SALES_SCREENINGS),
            scheduledScreenings: structuredClone(MOCK_SCHEDULED_SCREENINGS),
        };
    }

    const [sales, movies, screenings] = await Promise.all([
        apiRequest("/api/admin/sales"),
        apiRequest("/api/movies?page=1&limit=100"),
        apiRequest("/api/admin/screenings"),
    ]);

    return {
        libraryMovies: movies.items || [],
        omdbCatalog: [],
        salesScreenings: sales.items || [],
        scheduledScreenings: screenings.items || [],
    };
}

export async function importMovieFromOmdb(moviePayload) {
    if (USE_ADMIN_MOCK) {
        return {
            ...moviePayload,
            id: moviePayload.id ?? Date.now(),
        };
    }

    return apiRequest("/api/admin/movies/import", {
        method: "POST",
        body: JSON.stringify({
            imdbId: moviePayload.imdbId,
            title: moviePayload.title,
        }),
    });
}

export async function createAdminScreening(screeningPayload) {
    if (USE_ADMIN_MOCK) {
        return {
            ...screeningPayload,
            id: Date.now(),
        };
    }

    return apiRequest("/api/admin/screenings", {
        method: "POST",
        body: JSON.stringify(screeningPayload),
    });
}

export async function updateAdminScreening(id, screeningPayload) {
    if (USE_ADMIN_MOCK) {
        return {
            ...screeningPayload,
            id,
        };
    }

    return apiRequest(`/api/admin/screenings/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(screeningPayload),
    });
}

export async function deleteAdminScreening(id) {
    if (USE_ADMIN_MOCK) {
        return { deleted: true, id };
    }

    return apiRequest(`/api/admin/screenings/${encodeURIComponent(id)}`, {
        method: "DELETE",
    });
}
