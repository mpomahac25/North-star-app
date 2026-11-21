/* This file will handle the following:
 *  - create and configure express instance
 *  - register and configure middleware and API routes
 *  - configure request validation
 *  - export express app
 */

import express from "express";
import { pool } from "./db/pool.js";
import {
    getNowShowingMovies,
    getComingSoonMovies,
    getMovie,
    getUpcomingMovieScreenings,
    getMovieByImdbId,
    getMovieList,
    importMovieByTitle,
    MovieCatalogError,
} from "./services/movieCatalogService.js";

import {
    AdminServiceError,
    createAdminScreening,
    deleteAdminScreening,
    getAdminSales,
    getAdminScreenings,
    importAdminMovie,
    updateAdminScreening,
} from "./services/adminService.js";

const app = express();
const SERVICE_IDENTIFIER = "backend";
const MOVIES_API_URL = process.env.MOVIES_API_URL || "http://localhost:3005";

app.use(express.json());

app.get("/api/live", (req, res) => {
    res.json({
        status: "alive",
        service: SERVICE_IDENTIFIER,
    });
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        service: SERVICE_IDENTIFIER,
    });
});

app.get("/api/ready", async (req, res) => {
    try {
        await pool.query("SELECT 1");
        return res.json({
            status: "ready",
            service: SERVICE_IDENTIFIER,
            database: "ready",
        });
    } catch {
        return res.status(503).json({
            status: "not-ready",
            service: SERVICE_IDENTIFIER,
            database: "unavailable",
        });
    }
});

app.get("/api/movies/coming-soon", async (req, res) => {
    const year = req.query.year === undefined ? 2026 : Number(req.query.year);
    if (!Number.isInteger(year) || year < 1888 || year > 2100) {
        return res.status(400).json({
            error: {
                code: "INVALID_RELEASE_YEAR",
                message: 'Query parameter "year" must be a year from 1888 to 2100.',
            },
        });
    }

    try {
        return res.json(await getComingSoonMovies(year));
    } catch (error) {
        console.error("Could not load Coming Soon movies from PostgreSQL:", error);
        return res.status(500).json({
            error: {
                code: "MOVIE_CATALOG_READ_FAILED",
                message: "Could not load movies from the database.",
            },
        });
    }
});

// MUST BE KEPT BEFORE /api/movies/:id
app.get("/api/movies/now-showing", async (req, res) => {
    try {
        return res.json(await getNowShowingMovies());
    } catch (error) {
        console.error("Could not load Now Showing movies from PostgreSQL:", error);

        return res.status(500).json({
            error: {
                code: "MOVIE_CATALOG_READ_FAILED",
                message: "Could not load currently showing movies.",
            },
        });
    }
});

app.get("/api/movies", async (req, res) => {
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    const query = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
    const releaseYear = req.query.year === undefined ? undefined : Number(req.query.year);

    if (!Number.isInteger(page) || page < 1) {
        return res.status(400).json({
            error: {
                code: "INVALID_PAGE",
                message: "Page must be a positive integer.",
            },
        });
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return res.status(400).json({
            error: {
                code: "INVALID_LIMIT",
                message: "Limit must be between 1 and 100.",
            },
        });
    }
    if (query !== undefined && query.length > 100) {
        return res.status(400).json({
            error: {
                code: "INVALID_QUERY",
                message: "Search query cannot exceed 100 characters.",
            },
        });
    }
    if (
        releaseYear !== undefined &&
        (!Number.isInteger(releaseYear) || releaseYear < 1888 || releaseYear > 2100)
    ) {
        return res.status(400).json({
            error: {
                code: "INVALID_RELEASE_YEAR",
                message: "Year must be from 1888 to 2100.",
            },
        });
    }

    try {
        const options = {
            query: query || undefined,
            releaseYear,
            limit,
            offset: (page - 1) * limit,
        };

        let result = await getMovieList(options);

        // TODO: Remove temporary OMDb search fallback when the Admin panel is implemented.
        if (query && query.length >= 2 && page === 1 && result.total === 0) {
            try {
                const url = new URL("/api/movies/search", MOVIES_API_URL);
                url.searchParams.set("q", query);
                url.searchParams.set("type", "movie");

                const response = await fetch(url, {
                    signal: AbortSignal.timeout(12000),
                });

                if (response.ok) {
                    const data = await response.json();

                    for (const movie of (data.Search ?? []).slice(0, 10)) {
                        try {
                            await getMovieByImdbId(movie.imdbID);
                        } catch (error) {
                            console.error("Could not import movie:", movie.imdbID, error);
                        }
                    }

                    result = await getMovieList(options);
                }
            } catch (error) {
                console.error("Temporary OMDb search failed:", error);
            }
        }

        return res.json({ ...result, page, limit });
    } catch (error) {
        console.error("Could not list movies from PostgreSQL:", error);
        return res.status(500).json({
            error: {
                code: "MOVIE_CATALOG_READ_FAILED",
                message: "Could not load movies from the database.",
            },
        });
    }
});

// TODO: Restrict this endpoint to authenticated administrators. It will be used for Admin panel; potentially change later to "/api/admin/movies/search" just for differentiation
// Public movie searches must use PostgreSQL through GET /api/movies.
app.get("/api/movies/search", async (req, res) => {
    try {
        const queryString = new URLSearchParams(req.query).toString();
        const targetUrl = new URL(`/api/movies/search?${queryString}`, MOVIES_API_URL);

        const response = await fetch(targetUrl);
        const data = await response.json();

        return res.status(response.status).json(data);
    } catch (error) {
        console.error("Could not fetch search results from movies service:", error);
        return res.status(500).json({
            error: {
                code: "MOVIES_SERVICE_ERROR",
                message: "Could not fetch search results from the movies service.",
            },
        });
    }
});

// TODO: When authentication is implemented, restrict OMDb fallback to administrators.
// Public users must only retrieve movies already stored in PostgreSQL.
app.get("/api/movies/:id", async (req, res) => {
    const { id } = req.params;
    const numericId = Number(id);

    if (/^\d+$/.test(id)) {
        if (!Number.isSafeInteger(numericId) || numericId < 1) {
            return res.status(400).json({
                error: {
                    code: "INVALID_MOVIE_ID",
                    message: "Movie ID must be a positive integer.",
                },
            });
        }

        try {
            const movie = await getMovie(numericId);

            if (!movie) {
                return res.status(404).json({
                    error: {
                        code: "MOVIE_NOT_FOUND",
                        message: "Movie was not found.",
                    },
                });
            }

            return res.json(movie);
        } catch (error) {
            console.error("Could not read movie from PostgreSQL:", error);

            return res.status(500).json({
                error: {
                    code: "MOVIE_CATALOG_READ_FAILED",
                    message: "Could not load movie from the database.",
                },
            });
        }
    }

    if (!/^tt\d+$/.test(id)) {
        return res.status(400).json({
            error: {
                code: "INVALID_MOVIE_ID",
                message: "Movie ID must be a positive integer or a valid IMDb ID.",
            },
        });
    }

    try {
        const movie = await getMovieByImdbId(id);
        return res.json(movie);
    } catch (error) {
        if (error instanceof MovieCatalogError) {
            const code =
                error.status === 404
                    ? "MOVIE_NOT_FOUND"
                    : error.status === 502
                      ? "MOVIES_SERVICE_UNAVAILABLE"
                      : "MOVIE_DETAILS_FAILED";

            return res.status(error.status).json({
                error: {
                    code,
                    message: error.message,
                },
            });
        }

        console.error("Could not load movie details:", error);

        return res.status(500).json({
            error: {
                code: "MOVIE_CATALOG_READ_FAILED",
                message: "Could not load movie details.",
            },
        });
    }
});

app.get("/api/movies/:id/screenings", async (req, res) => {
    const { id } = req.params;
    const movieId = Number(id);

    if (!/^\d+$/.test(id) || !Number.isSafeInteger(movieId) || movieId < 1) {
        return res.status(400).json({
            error: {
                code: "INVALID_MOVIE_ID",
                message: "Movie ID must be a positive integer.",
            },
        });
    }

    try {
        const movie = await getMovie(movieId);

        if (!movie) {
            return res.status(404).json({
                error: {
                    code: "MOVIE_NOT_FOUND",
                    message: "Movie was not found.",
                },
            });
        }

        const screenings = await getUpcomingMovieScreenings(movieId);

        return res.json(screenings);
    } catch (error) {
        console.error("Could not load movie screenings from PostgreSQL:", error);

        return res.status(500).json({
            error: {
                code: "MOVIE_SCREENINGS_READ_FAILED",
                message: "Could not load movie screenings.",
            },
        });
    }
});

// TODO: Restrict movie imports from OMDb to authenticated administrators.
// Imported movies must be persisted to PostgreSQL.
app.post("/api/movies/import", async (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const year = req.body?.year === undefined ? undefined : String(req.body.year);

    if (!title || title.length > 100) {
        return res.status(400).json({
            error: {
                code: "INVALID_TITLE",
                message: "Title must contain 1 to 100 characters.",
            },
        });
    }
    if (year !== undefined && !/^\d{4}$/.test(year)) {
        return res.status(400).json({
            error: {
                code: "INVALID_RELEASE_YEAR",
                message: "Year must be a four-digit year.",
            },
        });
    }

    try {
        const movie = await importMovieByTitle(title, year);
        return res.status(200).json(movie);
    } catch (error) {
        if (error instanceof MovieCatalogError) {
            return res.status(error.status).json({
                error: { code: "MOVIE_IMPORT_FAILED", message: error.message },
            });
        }
        console.error("Could not import movie into PostgreSQL:", error);
        return res.status(500).json({
            error: {
                code: "MOVIE_IMPORT_FAILED",
                message: "Could not save movie to the database.",
            },
        });
    }
});

// --- ADMIN DASHBOARD ROUTES ---

app.get("/api/admin/sales", async (req, res) => {
    try {
        const sales = await getAdminSales();
        return res.json(sales);
    } catch (error) {
        console.error("Could not load admin sales from PostgreSQL:", error);
        return res.status(500).json({
            error: {
                code: "ADMIN_SALES_READ_FAILED",
                message: "Could not load sales overview from the database.",
            },
        });
    }
});

app.get("/api/admin/movies/search", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) {
        return res.status(400).json({
            error: {
                code: "INVALID_QUERY",
                message: "Search query is required.",
            },
        });
    }

    try {
        if (/^tt\d+$/.test(q)) {
            const targetUrl = new URL(`/api/movies/${encodeURIComponent(q)}`, MOVIES_API_URL);
            const response = await fetch(targetUrl, { signal: AbortSignal.timeout(12000) });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                return res.status(response.status).json(data);
            }
            return res.json({ Search: [data] });
        }

        const targetUrl = new URL("/api/movies/search", MOVIES_API_URL);
        targetUrl.searchParams.set("q", q);
        targetUrl.searchParams.set("type", "movie");
        const response = await fetch(targetUrl, { signal: AbortSignal.timeout(12000) });
        const data = await response.json().catch(() => ({}));
        return res.status(response.status).json(data);
    } catch (error) {
        console.error("Could not search OMDb via movies service:", error);
        return res.status(502).json({
            error: {
                code: "MOVIES_SERVICE_ERROR",
                message: "Could not fetch search results from the movies service.",
            },
        });
    }
});

app.post("/api/admin/movies/import", async (req, res) => {
    try {
        const movie = await importAdminMovie(req.body);
        return res.status(200).json(movie);
    } catch (error) {
        if (error instanceof AdminServiceError || error instanceof MovieCatalogError) {
            return res.status(error.status).json({
                error: {
                    code: error.code || "MOVIE_IMPORT_FAILED",
                    message: error.message,
                },
            });
        }
        console.error("Could not import movie in admin route:", error);
        return res.status(500).json({
            error: {
                code: "MOVIE_IMPORT_FAILED",
                message: "Could not save movie to the database.",
            },
        });
    }
});

app.get("/api/admin/screenings", async (req, res) => {
    try {
        const screenings = await getAdminScreenings();
        return res.json(screenings);
    } catch (error) {
        console.error("Could not load admin screenings from PostgreSQL:", error);
        return res.status(500).json({
            error: {
                code: "ADMIN_SCREENINGS_READ_FAILED",
                message: "Could not load scheduled screenings.",
            },
        });
    }
});

app.post("/api/admin/screenings", async (req, res) => {
    try {
        const created = await createAdminScreening(req.body);
        return res.status(201).json(created);
    } catch (error) {
        if (error instanceof AdminServiceError) {
            return res.status(error.status).json({
                error: { code: error.code, message: error.message },
            });
        }
        console.error("Could not create admin screening:", error);
        return res.status(500).json({
            error: {
                code: "ADMIN_SCREENING_CREATE_FAILED",
                message: "Could not schedule screening.",
            },
        });
    }
});

app.put("/api/admin/screenings/:id", async (req, res) => {
    const screeningId = Number(req.params.id);
    if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(screeningId) || screeningId < 1) {
        return res.status(400).json({
            error: {
                code: "INVALID_SCREENING_ID",
                message: "Screening ID must be a positive integer.",
            },
        });
    }

    try {
        const updated = await updateAdminScreening(screeningId, req.body);
        return res.status(200).json(updated);
    } catch (error) {
        if (error instanceof AdminServiceError) {
            return res.status(error.status).json({
                error: { code: error.code, message: error.message },
            });
        }
        console.error("Could not update admin screening:", error);
        return res.status(500).json({
            error: {
                code: "ADMIN_SCREENING_UPDATE_FAILED",
                message: "Could not update screening.",
            },
        });
    }
});

app.delete("/api/admin/screenings/:id", async (req, res) => {
    const screeningId = Number(req.params.id);
    if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(screeningId) || screeningId < 1) {
        return res.status(400).json({
            error: {
                code: "INVALID_SCREENING_ID",
                message: "Screening ID must be a positive integer.",
            },
        });
    }

    try {
        const result = await deleteAdminScreening(screeningId);
        return res.status(200).json(result);
    } catch (error) {
        if (error instanceof AdminServiceError) {
            return res.status(error.status).json({
                error: { code: error.code, message: error.message },
            });
        }
        console.error("Could not delete admin screening:", error);
        return res.status(500).json({
            error: {
                code: "ADMIN_SCREENING_DELETE_FAILED",
                message: "Could not delete screening.",
            },
        });
    }
});

// MUST BE KEPT AFTER ALL ROUTES!!!
app.use((req, res) => {
    res.status(404).json({
        error: {
            code: "ROUTE_NOT_FOUND",
            message: "The requested API route does not exist.",
        },
    });
});

export default app;
