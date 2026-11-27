const USE_ADMIN_MOCK = false; // Set to true to use mock data for admin dashboard

const MOCK_THEATRES = [
    {
        id: 1,
        name: "Rio Cinema Oulu",
        city: "Oulu",
        address: "Hallituskatu 11",
        timezone: "Europe/Helsinki",
        rooms: [
            { id: 1, theatreId: 1, name: "Room 1", capacity: 100 },
            { id: 2, theatreId: 1, name: "Room 2", capacity: 200 },
        ],
    },
    {
        id: 2,
        name: "Rio Cinema Tampere",
        city: "Tampere",
        address: "Hämeenkatu 14",
        timezone: "Europe/Helsinki",
        rooms: [
            { id: 3, theatreId: 2, name: "Room 1", capacity: 100 },
            { id: 4, theatreId: 2, name: "Room 2", capacity: 200 },
        ],
    },
];

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

function getDateKeyFromIso(isoDate) {
    if (!isoDate) return "all";
    const now = new Date();
    const toIso = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const todayStr = toIso(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowStr = toIso(tomorrow);

    if (isoDate === todayStr) return "today";
    if (isoDate === tomorrowStr) return "tomorrow";
    return isoDate;
}

function normalizeOmdbSearchItem(item) {
    if (!item || typeof item !== "object") return null;
    const yearMatch = /\b(\d{4})\b/.exec(String(item.Year || item.releaseYear || ""));
    const runtimeMatch = /^\s*(\d+)\s+min\b/i.exec(String(item.Runtime || ""));
    const directors = Array.isArray(item.directors)
        ? item.directors
        : typeof item.Director === "string" && item.Director !== "N/A"
          ? item.Director.split(",")
                .map((d) => d.trim())
                .filter(Boolean)
          : [];

    return {
        id: item.id ?? null,
        imdbId: item.imdbID || item.imdbId || "",
        title: item.Title || item.title || "",
        releaseYear: yearMatch ? Number(yearMatch[1]) : null,
        durationMinutes: item.durationMinutes ?? (runtimeMatch ? Number(runtimeMatch[1]) : null),
        directors,
        posterUrl:
            (item.Poster && item.Poster !== "N/A" ? item.Poster : null) ||
            item.posterUrl ||
            "https://placehold.co/300x450/18181b/d4af37?text=No+Poster",
    };
}

export async function fetchAdminDashboardInitialData() {
    if (USE_ADMIN_MOCK) {
        return {
            theatres: structuredClone(MOCK_THEATRES),
            libraryMovies: structuredClone(MOCK_LIBRARY_MOVIES),
            omdbCatalog: structuredClone(MOCK_OMDB_CATALOG),
            salesScreenings: structuredClone(MOCK_SALES_SCREENINGS),
            scheduledScreenings: structuredClone(MOCK_SCHEDULED_SCREENINGS),
        };
    }

    const [sales, movies, screenings, theatres] = await Promise.all([
        apiRequest("/api/admin/sales"),
        apiRequest("/api/movies?page=1&limit=100"),
        apiRequest("/api/admin/screenings"),
        apiRequest("/api/admin/theatres"),
    ]);

    const rawSales = Array.isArray(sales) ? sales : sales.items || [];
    const rawScreenings = Array.isArray(screenings) ? screenings : screenings.items || [];
    const rawTheatres = Array.isArray(theatres) ? theatres : theatres.items || [];

    return {
        theatres: rawTheatres,
        libraryMovies: movies.items || [],
        omdbCatalog: [],
        salesScreenings: rawSales.map((item) => ({
            ...item,
            dateKey: item.dateKey || getDateKeyFromIso(item.date),
        })),
        scheduledScreenings: rawScreenings,
    };
}

export async function createAdminTheatre(theatrePayload) {
    if (USE_ADMIN_MOCK) {
        return { ...theatrePayload, id: Date.now(), rooms: [] };
    }
    return apiRequest("/api/admin/theatres", {
        method: "POST",
        body: JSON.stringify(theatrePayload),
    });
}

export async function updateAdminTheatre(id, theatrePayload) {
    if (USE_ADMIN_MOCK) {
        return { ...theatrePayload, id, rooms: [] };
    }
    return apiRequest(`/api/admin/theatres/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(theatrePayload),
    });
}

export async function deleteAdminTheatre(id) {
    if (USE_ADMIN_MOCK) {
        return { deleted: true, id };
    }
    return apiRequest(`/api/admin/theatres/${encodeURIComponent(id)}`, {
        method: "DELETE",
    });
}

export async function createAdminRoom(theatreId, roomPayload) {
    if (USE_ADMIN_MOCK) {
        return { ...roomPayload, id: Date.now(), theatreId };
    }
    return apiRequest(`/api/admin/theatres/${encodeURIComponent(theatreId)}/rooms`, {
        method: "POST",
        body: JSON.stringify(roomPayload),
    });
}

export async function updateAdminRoom(id, roomPayload) {
    if (USE_ADMIN_MOCK) {
        return { ...roomPayload, id };
    }
    return apiRequest(`/api/admin/rooms/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(roomPayload),
    });
}

export async function deleteAdminRoom(id) {
    if (USE_ADMIN_MOCK) {
        return { deleted: true, id };
    }
    return apiRequest(`/api/admin/rooms/${encodeURIComponent(id)}`, {
        method: "DELETE",
    });
}

export async function searchAdminOmdbMovies(query) {
    if (USE_ADMIN_MOCK) {
        const cleaned = query.trim().toLowerCase();
        return MOCK_OMDB_CATALOG.filter(
            (m) =>
                m.title.toLowerCase().includes(cleaned) ||
                (m.imdbId && m.imdbId.toLowerCase().includes(cleaned)),
        );
    }

    const data = await apiRequest(`/api/admin/movies/search?q=${encodeURIComponent(query.trim())}`);
    const list = Array.isArray(data?.Search) ? data.Search : [];
    return list.map(normalizeOmdbSearchItem).filter(Boolean);
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
