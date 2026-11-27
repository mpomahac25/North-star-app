import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowUpRight, ChevronLeft } from "lucide-react";
import { formatDate } from "../utils/dateFormat";
import "./ExplorePage.css";

function getVisiblePages(currentPage, totalPages) {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (currentPage <= 4) {
        return [1, 2, 3, 4, 5, 6, "...", totalPages];
    }

    if (currentPage >= totalPages - 3) {
        return [
            1,
            "...",
            totalPages - 5,
            totalPages - 4,
            totalPages - 3,
            totalPages - 2,
            totalPages - 1,
            totalPages,
        ];
    }

    return [
        1,
        "...",
        currentPage - 2,
        currentPage - 1,
        currentPage,
        currentPage + 1,
        currentPage + 2,
        "...",
        totalPages,
    ];
}

export default function ExplorePage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const query = searchParams.get("search") || "";
    const [activeTab, setActiveTab] = useState("all");

    const [movies, setMovies] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);

    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState("");

    const abortControllerRef = useRef(null);

    const [prevQuery, setPrevQuery] = useState(query);
    if (query !== prevQuery) {
        setPrevQuery(query);
        setPage(1);
    }

    const handleTabChange = (newTab) => {
        if (newTab !== activeTab) {
            setActiveTab(newTab);
            setPage(1);
        }
    };

    const fetchMovies = useCallback(
        async (requestedPage, isPageTransition = false) => {
            abortControllerRef.current?.abort();
            const controller = new AbortController();
            abortControllerRef.current = controller;
            const trimmedQuery = query.trim();

            if (isPageTransition) {
                setIsLoadingMore(true);
                setError("");
            } else {
                setIsLoading(true);
                setError("");
                setMovies([]);
                setTotalPages(0);
            }

            try {
                let url = "";

                if (activeTab === "showing") {
                    url = "/api/movies/now-showing";
                } else {
                    const params = new URLSearchParams({
                        page: String(requestedPage),
                        limit: "10",
                    });

                    if (trimmedQuery) {
                        params.set("q", trimmedQuery);
                    }

                    url = `/api/movies?${params.toString()}`;
                }

                const response = await fetch(url, { signal: controller.signal });
                const data = await response.json();

                if (controller.signal.aborted || abortControllerRef.current !== controller) {
                    return;
                }

                if (!response.ok) {
                    throw new Error(data.error?.message || data.error || "Could not load movies.");
                }

                if (!Array.isArray(data) && !Array.isArray(data?.items)) {
                    throw new Error("Could not load movies. Please try again later.");
                }

                const rawList = Array.isArray(data) ? data : data.items;

                const totalResults = Array.isArray(data)
                    ? rawList.length
                    : Number(data.total ?? 0);

                const formattedList = rawList.map((movie) => ({
                    id: movie.id ?? movie.imdbId,
                    title: movie.title,
                    year: movie.releaseYear ?? movie.year ?? "",
                    poster: movie.posterUrl ?? movie.poster ?? null,
                    screenings: (movie.screenings ?? [])
                        .slice(0, 3)
                        .map((screening) => {
                            const date = new Date(screening.startTime);
                            const formattedDate = formatDate(screening.startTime, {
                                timeZone: "Europe/Helsinki",
                            });
                            const formattedTime = date.toLocaleTimeString("en-GB", {
                                timeZone: "Europe/Helsinki",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                            });

                            return `${screening.city} ${formattedDate} ${formattedTime}`;
                        }),
                }));

                setMovies(formattedList);
                setPage(requestedPage);
                setTotalPages(
                    activeTab === "showing"
                        ? 0
                        : Math.ceil(totalResults / 10),
                );

                if (isPageTransition) {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                }
            } catch (requestError) {
                if (requestError.name !== "AbortError") {
                    setError("Could not load movies. Please try again later.");
                    if (!isPageTransition) {
                        setMovies([]);
                    }
                }
            } finally {
                if (!controller.signal.aborted && abortControllerRef.current === controller) {
                    setIsLoading(false);
                    setIsLoadingMore(false);
                }
            }
        },
        [activeTab, query],
    );

    useEffect(() => {
        async function loadInitialMovies() {
            await fetchMovies(1);
        }

        loadInitialMovies();

        return () => {
            abortControllerRef.current?.abort();
        };
    }, [fetchMovies]);

    return (
        <div className="explore-container">
            <header className="explore-header">
                <div className="explore-title-row">
                    <button
                        className="btn-back mobile-only"
                        onClick={() => navigate(-1)}
                        aria-label="Go back"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <h1 className="explore-title">Explore movies</h1>
                </div>

                <p className="explore-subtitle">
                    Find your favourite movie, search by title or browse the full catalogue.
                </p>

                <div className="explore-tabs">
                    <button
                        className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
                        onClick={() => handleTabChange("all")}
                    >
                        All movies
                    </button>
                    <button
                        className={`tab-btn ${activeTab === "showing" ? "active" : ""}`}
                        onClick={() => handleTabChange("showing")}
                    >
                        Now showing
                    </button>
                </div>
            </header>

            {isLoading && <p role="status">Loading movies...</p>}
            {error && <p role="alert">{error}</p>}
            {!isLoading && !error && movies.length === 0 && (
                <p role="status" className="no-results">
                    {query ? `No movies found for "${query}".` : "No movies available."}
                </p>
            )}

            {!isLoading && movies.length > 0 && (
                <div className="explore-grid">
                    {movies.map((movie) => (
                        <div
                            key={movie.id}
                            className="explore-card"
                            onClick={() => navigate(`/details/${movie.id}`)}
                        >
                            <div className="explore-poster-wrapper">
                                {movie.poster && (
                                    <img
                                        src={movie.poster}
                                        alt={`${movie.title} poster`}
                                        className="explore-poster-img"
                                        loading="lazy"
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.src =
                                                "https://via.placeholder.com/300x450?text=No+Poster";
                                        }}
                                    />
                                )}
                            </div>

                            <div className="explore-card-footer">
                                <div className="explore-card-info">
                                    <h3 className="explore-movie-title">{movie.title}</h3>
                                    <span className="explore-movie-meta">{movie.year}</span>
                                    <div className="explore-screenings">
                                        {movie.screenings.map((time) => (
                                            <span key={time} className="screening-badge">
                                                {time}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <ArrowUpRight size={16} className="card-arrow" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!isLoading && totalPages > 1 && activeTab !== "showing" && (
                <div className="pagination-container">
                    {getVisiblePages(page, totalPages).map((item, index) =>
                        item === "..." ? (
                            <span key={`ellipsis-${index}`} className="pagination-ellipsis">
                                ...
                            </span>
                        ) : (
                            <button
                                key={item}
                                className={`btn-page ${page === item ? "active" : ""}`}
                                onClick={() => {
                                    if (page !== item && !isLoadingMore) {
                                        fetchMovies(item, true);
                                    }
                                }}
                                disabled={isLoadingMore}
                            >
                                {item}
                            </button>
                        ),
                    )}
                </div>
            )}
        </div>
    );
}
