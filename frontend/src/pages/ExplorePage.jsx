import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import "./ExplorePage.css";

export default function ExplorePage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const query = searchParams.get("search") || "";
    const [movies, setMovies] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const controller = new AbortController();

        async function fetchMovies() {
            const trimmedQuery = query.trim();

            if (!trimmedQuery) {
                setMovies([]);
                setError("");
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            setError("");

            try {
                // By manually encoding the parameter, we ensure "Fast & Furious"
                // doesn't break the URL string.
                const safeQuery = encodeURIComponent(trimmedQuery);
                const url = `/api/movies/search?q=${safeQuery}&page=1`;

                const response = await fetch(url, {
                    signal: controller.signal,
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error?.message || "Could not load movies. Please try again later.",
                    );
                }

                if (!Array.isArray(data) && !data.Search && !data.movies && !data.results) {
                    throw new Error("Could not load movies. Please try again later.");
                }

                const rawList = Array.isArray(data)
                    ? data
                    : data.Search || data.movies || data.results || [];

                setMovies(
                    rawList.map((movie) => ({
                        id: movie.imdbID || movie.imdbId || movie.id,
                        title: movie.Title || movie.title,
                        year: movie.Year || movie.year,
                        poster:
                            movie.Poster === "N/A" || movie.poster === "N/A"
                                ? null
                                : movie.Poster || movie.poster,
                    })),
                );
            } catch (requestError) {
                if (requestError.name !== "AbortError") {
                    setError("Could not load movies. Please try again later.");
                    setMovies([]);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            }
        }

        fetchMovies();

        return () => controller.abort();
    }, [query]);

    return (
        <div className="explore-container">
            <header className="explore-header">
                <h1 className="explore-title">Explore movies</h1>
                <p className="explore-subtitle">
                    Find your favourite movie, search by title or browse the full catalogue.
                </p>
            </header>

            <div className="explore-grid">
                {isLoading && <p role="status">Loading movies...</p>}

                {!isLoading && error && <p role="alert">{error}</p>}

                {!isLoading && !error && movies.length === 0 && (
                    <p role="status">
                        {query ? `No movies found for "${query}".` : "Search for a movie."}
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
                                    />
                                )}
                            </div>

                            <div className="explore-card-footer">
                                <div>
                                    <h3 className="explore-movie-title">{movie.title}</h3>
                                    <span className="explore-movie-meta">{movie.year}</span>
                                </div>

                                <ArrowUpRight size={16} className="card-arrow" />
                            </div>
                        </div>
                    ))}
            </div>
        </div>
    );
}
