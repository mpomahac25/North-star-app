import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MapPin, Star, ArrowUpRight } from "lucide-react";
import rioLogo from "../assets/rio-logo.png";
import "./HomePage.css";

export default function HomePage() {
    const [searchTerm, setSearchTerm] = useState("");
    const [featuredMovies, setFeaturedMovies] = useState([]);
    const [isLoadingMovies, setIsLoadingMovies] = useState(true);
    const [moviesError, setMoviesError] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        const controller = new AbortController();

        async function loadFeaturedMovies() {
            try {
                const response = await fetch("/api/movies/coming-soon", {
                    signal: controller.signal,
                });
                const movies = await response.json();

                if (!response.ok) {
                    throw new Error(movies.error || "Could not load movies.");
                }

                if (!Array.isArray(movies)) {
                    throw new Error("Movies response must be a list.");
                }

                setFeaturedMovies(movies.slice(0, 5));
            } catch (error) {
                if (error.name !== "AbortError") {
                    setMoviesError("Could not load movies. Please try again later.");
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoadingMovies(false);
                }
            }
        }

        loadFeaturedMovies();
        return () => controller.abort();
    }, []);

    const handleSearch = (e) => {
        if (e.key === "Enter" || e.type === "click") {
            // Removes extra spaces and converts the text to lowercase
            const cleanedSearch = searchTerm.trim().toLowerCase();

            if (cleanedSearch) {
                navigate(`/explore?search=${cleanedSearch}`);
            }
        }
    };

    return (
        <div className="home-container">
            {/* Mobile Header */}
            <header className="home-header mobile-only">
                <div className="header-text">
                    <span className="greeting">Welcome Back,</span>
                    <h1 className="username">Kakaroto</h1>
                </div>
                <div className="avatar">
                    <img src="https://i.pravatar.cc/150?img=12" alt="Profile avatar" />
                </div>
            </header>

            {/* Mobile Search Bar */}
            <div className="search-bar mobile-only">
                <Search
                    size={18}
                    className="search-icon"
                    onClick={handleSearch}
                    style={{ cursor: "pointer" }}
                />
                <input
                    type="text"
                    placeholder="Search your favourite movie"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={handleSearch}
                />
            </div>

            {/* Desktop Greeting */}
            <div className="desktop-greeting desktop-only">
                <span className="greeting">Welcome Back,</span>
                <h1 className="username">Kakaroto</h1>
            </div>

            {/* Featured Movies Section */}
            <section className="section-coming-soon">
                <div className="section-header">
                    <h2 className="section-title">Featured Movies</h2>
                    {/* Explore button for desktop */}
                    <button className="btn-explore-top" onClick={() => navigate("/explore")}>
                        Explore movies <ArrowUpRight size={16} />
                    </button>
                </div>

                <div className="coming-soon-carousel">
                    {isLoadingMovies && <p role="status">Loading movies…</p>}
                    {!isLoadingMovies && moviesError && <p role="alert">{moviesError}</p>}
                    {!isLoadingMovies && !moviesError && featuredMovies.length === 0 && (
                        <p role="status">No movies available.</p>
                    )}
                    {!isLoadingMovies && !moviesError && featuredMovies.map((movie) => (
                        <div className="movie-card-coming" key={movie.imdbId}>
                            <div className="poster-wrapper">
                                {movie.poster && (
                                    <img
                                        src={movie.poster}
                                        alt={`${movie.title} (${movie.year}) poster`}
                                        className="poster-img"
                                    />
                                )}
                            </div>
                            <div className="movie-card-footer">
                                <div>
                                    <h3 className="movie-title">{movie.title}</h3>
                                    <span className="release-date">{movie.year}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Rio Movie Theaters Section */}
            <section className="section-cinemas">
                <div className="section-header">
                    <h2 className="section-title">Rio Movie Theaters</h2>
                    <span className="see-details">
                        See details <ArrowUpRight size={14} />
                    </span>
                </div>

                <div className="cinema-list">
                    <div className="cinema-card">
                        <div className="cinema-logo">
                            <img src={rioLogo} alt="Rio Cinema Logo" className="real-logo-img" />
                        </div>
                        <div className="cinema-info">
                            <div className="cinema-location-info">
                                <MapPin size={12} color="var(--text-muted-dark)" />
                                <span className="cinema-distance">2km</span>
                            </div>
                            <h4 className="cinema-name">Oulu Rio Cinema</h4>
                            <p className="cinema-status">Closed 22:00</p>
                        </div>
                        <div className="cinema-card-right">
                            <div className="cinema-rating">
                                <Star size={14} fill="var(--gold-warm)" color="var(--gold-warm)" />
                                <span>4,9</span>
                            </div>
                            <ArrowUpRight size={16} className="card-arrow desktop-only" />
                        </div>
                    </div>

                    <div className="cinema-card">
                        <div className="cinema-logo">
                            <img src={rioLogo} alt="Rio Cinema Logo" className="real-logo-img" />
                        </div>
                        <div className="cinema-info">
                            <div className="cinema-location-info">
                                <MapPin size={12} color="var(--text-muted-dark)" />
                                <span className="cinema-distance">540km</span>
                            </div>
                            <h4 className="cinema-name">Tampere Rio Cinema</h4>
                            <p className="cinema-status">Closed 21:00</p>
                        </div>
                        <div className="cinema-card-right">
                            <div className="cinema-rating">
                                <Star size={14} fill="var(--gold-warm)" color="var(--gold-warm)" />
                                <span>5,0</span>
                            </div>
                            <ArrowUpRight size={16} className="card-arrow desktop-only" />
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
