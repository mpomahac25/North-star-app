import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowUpRight, ChevronLeft } from "lucide-react";
import "./ExplorePage.css";

export default function ExplorePage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const query = searchParams.get("search") || "";
    const [activeTab, setActiveTab] = useState("all");
    const [movies, setMovies] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const [loadMoreError, setLoadMoreError] = useState("");
    const abortControllerRef = useRef(null);

    // Reset page to 1 during render when query changes (prevents cascading render warnings)
    const [prevQuery, setPrevQuery] = useState(query);
    if (query !== prevQuery) {
        setPrevQuery(query);
        setPage(1);
    }

    // Reset page to 1 on tab click
    const handleTabChange = (newTab) => {
        if (newTab !== activeTab) {
            setActiveTab(newTab);
            setPage(1);
        }
    };

    const fetchMovies = useCallback(async (requestedPage, append = false) => {
        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const trimmedQuery = query.trim();
        const searchQuery = trimmedQuery || "movie";

        if (append) {
            setIsLoadingMore(true);
            setLoadMoreError("");
        } else {
            setIsLoading(true);
            setError("");
            setLoadMoreError("");
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

            if (append) {
                setMovies((prev) => [...prev, ...formattedList]);
                setPage(requestedPage);
            } else {
                setMovies(formattedList);
            }
            setHasMore(totalResults > 0 && requestedPage * 10 < totalResults);
        } catch (requestError) {
            if (requestError.name !== "AbortError") {
                if (append) {
                    setLoadMoreError(
                        "Failed to load additional movies, please try again in a while.",
                    );
                } else {
                    setError("Could not load movies. Please try again later.");
                    setMovies([]);
                }
            }
        } finally {
            if (!controller.signal.aborted && abortControllerRef.current === controller) {
                setIsLoading(false);
                setIsLoadingMore(false);
            }
        }
    }, [activeTab, query]);

    useEffect(() => {
        async function loadInitialMovies() {
            await fetchMovies(1);
        }

        loadInitialMovies();

        return () => {
            abortControllerRef.current?.abort();
        };
    }, [fetchMovies]);

    const handleLoadMore = () => fetchMovies(page + 1, true);

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

                {/* Filter Tabs */}
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

            <div className="explore-grid">
                {isLoading && <p role="status">Loading movies...</p>}
                {!isLoading && error && <p role="alert">{error}</p>}
                {!isLoading && !error && movies.length === 0 && (
                    <p role="status" className="no-results">
                        {query ? `No movies found for "${query}".` : "No movies available."}
                    </p>
                )}
                {!isLoading && loadMoreError && <p role="alert">{loadMoreError}</p>}

                {!isLoading &&
                    !error &&
                    movies.map((movie) => (
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

            {!isLoading && !error && hasMore && activeTab !== "showing" && (
                <div className="load-more-container">
                    <button
                        className="btn-load-more"
                        onClick={handleLoadMore}
                        disabled={isLoadingMore}
                    >
                        {isLoadingMore
                            ? "Loading..."
                            : loadMoreError
                              ? "Try again"
                              : "Show more movies"}
                    </button>
                </div>
            )}
        </div>
    );
}
