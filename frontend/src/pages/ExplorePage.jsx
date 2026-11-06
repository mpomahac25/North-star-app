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
                const params = new URLSearchParams({
                    q: trimmedQuery,
                    page: "1",
                });

                const response = await fetch(`/api/movies/search?${params.toString()}`, {
                    signal: controller.signal,
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Could not load movies.");
                }

                setMovies(
                    (data.Search || []).map((movie) => ({
                        id: movie.imdbID,
                        title: movie.Title,
                        year: movie.Year,
                        poster: movie.Poster === "N/A" ? null : movie.Poster,
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
