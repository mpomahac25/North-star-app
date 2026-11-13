import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowUpRight, ChevronLeft } from "lucide-react";
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
            const searchQuery = trimmedQuery || "movie";

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
                    url = "/api/movies/coming-soon";
                } else {
                    const safeQuery = encodeURIComponent(searchQuery);
                    url = `/api/movies/search?q=${safeQuery}&page=${requestedPage}&type=movie`;
                }

                const response = await fetch(url, { signal: controller.signal });
                const data = await response.json();

                if (controller.signal.aborted || abortControllerRef.current !== controller) {
                    return;
                }

                if (!response.ok) {
                    throw new Error(data.error?.message || data.error || "Could not load movies.");
                }

                if (!Array.isArray(data) && !data.Search && !data.movies && !data.results) {
                    throw new Error("Could not load movies. Please try again later.");
                }

                const rawList = Array.isArray(data)
                    ? data
                    : data.Search || data.movies || data.results || [];

                const totalResults = Number(data.totalResults || 0);

                const formattedList = rawList.map((movie, index) => ({
                    id: movie.imdbID || movie.imdbId || movie.id,
                    title: movie.Title || movie.title,
                    year: movie.Year || movie.year,
                    poster:
                        movie.Poster === "N/A" || movie.poster === "N/A"
                            ? null
                            : movie.Poster || movie.poster,
                    screenings:
                        index % 2 === 0
                            ? ["Oulu 18:00", "Tampere 20:30"]
                            : ["Oulu 19:15", "Tampere 17:45"],
                }));

                setMovies(formattedList);
                setPage(requestedPage);
                setTotalPages(Math.min(100, Math.ceil(totalResults / 10)));

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
