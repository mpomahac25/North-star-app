import { useEffect, useState } from "react";
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

    useEffect(() => {
        const controller = new AbortController();

        async function fetchMovies() {
            const trimmedQuery = query.trim();
            const searchQuery = trimmedQuery || "movie";

            if (page === 1) {
                setIsLoading(true);
            } else {
                setIsLoadingMore(true);
            }
            setError("");

            try {
                let url = "";

                if (activeTab === "showing") {
                    url = "/api/movies/coming-soon";
                } else {
                    const safeQuery = encodeURIComponent(searchQuery);
                    url = `/api/movies/search?q=${safeQuery}&page=${page}&type=movie`;
                }

                const response = await fetch(url, { signal: controller.signal });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error?.message || data.error || "Could not load movies.");
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
                    // Mock Rio screenings for Oulu & Tampere until /api/screenings is wired in backend
                    screenings:
                        index % 2 === 0
                            ? ["Oulu 18:00", "Tampere 20:30"]
                            : ["Oulu 19:15", "Tampere 17:45"],
                }));

                if (page === 1) {
                    setMovies(formattedList);
                } else {
                    setMovies((prev) => [...prev, ...formattedList]);
                }

                setHasMore(totalResults > 0 && page * 10 < totalResults);
            } catch (requestError) {
                if (requestError.name !== "AbortError") {
                    setError("Could not load movies. Please try again later.");
                    if (page === 1) setMovies([]);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                    setIsLoadingMore(false);
                }
            }
        }

        fetchMovies();

        return () => controller.abort();
    }, [query, activeTab, page]);

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
                        onClick={() => setPage((prev) => prev + 1)}
                        disabled={isLoadingMore}
                    >
                        {isLoadingMore ? "Loading..." : "Show more movies"}
                    </button>
                </div>
            )}
        </div>
    );
}
