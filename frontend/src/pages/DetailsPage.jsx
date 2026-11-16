import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    ArrowLeft,
    ArrowRight,
    Award,
    Calendar,
    ChevronLeft,
    Clock,
    Film,
    Globe,
    MapPin,
    Play,
    Star,
    Ticket,
    Users,
} from "lucide-react";
import "./DetailsPage.css";

function formatRuntime(runtime) {
    if (!runtime || runtime === "N/A") {
        return "N/A";
    }

    const match = runtime.match(/^(\d+)\s*min$/i);
    if (!match) {
        return runtime;
    }

    const totalMinutes = Number(match[1]);
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const minutes = String(totalMinutes % 60).padStart(2, "0");
    return `${hours}h ${minutes}m`;
}

function cleanValue(value, fallback = "Not available") {
    return value && value !== "N/A" ? value : fallback;
}

function formatReleaseDate(value) {
    if (!value) return "Not available";

    const date = new Date(`${value}T00:00:00Z`);

    return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    });
}

function formatScreeningTime(value) {
    return new Date(value).toLocaleString("en-GB", {
        timeZone: "Europe/Helsinki",
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

export default function DetailsPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [movie, setMovie] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false);
    const [screenings, setScreenings] = useState([]);
    const [isLoadingScreenings, setIsLoadingScreenings] = useState(false);
    const [screeningsError, setScreeningsError] = useState("");

    useEffect(() => {
        const controller = new AbortController();

        async function loadMovieDetails() {
            setIsLoading(true);
            setError("");
            setIsSynopsisExpanded(false);

            try {
                const safeId = encodeURIComponent(id || "");
                const response = await fetch(`/api/movies/${safeId}`, {
                    signal: controller.signal,
                });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error?.message || data.error || "Could not load movie details.",
                    );
                }

                setMovie({
                    id: data.id ?? id,
                    title: cleanValue(data.title, "Untitled movie"),
                    year: data.releaseYear ?? "",
                    rated: cleanValue(data.ageRating, "Unrated"),
                    released: formatReleaseDate(data.releaseDate),
                    poster: data.posterUrl ?? null,
                    director: cleanValue(data.directors?.join(", "), "Unknown"),
                    writer: cleanValue(data.writers?.join(", "), "Unknown"),
                    actors: data.actors ?? [],
                    genres: data.genres ?? [],
                    runtime: formatRuntime(
                        Number.isInteger(data.durationMinutes)
                            ? `${data.durationMinutes} min`
                            : null,
                    ),
                    rating: data.imdbRating ?? "N/A",
                    votes:
                        data.imdbVotes == null
                            ? ""
                            : data.imdbVotes.toLocaleString("en-US"),
                    language: cleanValue(data.languages?.join(", ")),
                    country: cleanValue(data.country),
                    awards: cleanValue(data.awards, "No awards listed"),
                    boxOffice: cleanValue(data.boxOffice, ""),
                    synopsis: cleanValue(
                        data.description,
                        "No synopsis available for this movie.",
                    ),
                });
            } catch (requestError) {
                if (requestError.name !== "AbortError") {
                    setError(requestError.message || "Could not load movie details.");
                    setMovie(null);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            }
        }

        loadMovieDetails();
        return () => controller.abort();
    }, [id]);

    const movieId = movie?.id;

    useEffect(() => {
        if (movieId === undefined || movieId === null) {
            return;
        }

        const controller = new AbortController();

        async function loadScreenings() {
            setIsLoadingScreenings(true);
            setScreenings([]);
            setScreeningsError("");

            try {
                if (!Number.isSafeInteger(movieId)) {
                    throw new Error("Invalid movie ID.");
                }

                const response = await fetch(`/api/movies/${movieId}/screenings`, {
                    signal: controller.signal,
                });

                const data = await response.json();

                if (!response.ok || !Array.isArray(data)) {
                    throw new Error("Could not load upcoming screenings.");
                }

                if (!controller.signal.aborted) {
                    setScreenings(data);
                }
            } catch (requestError) {
                if (!controller.signal.aborted) {
                    setScreeningsError("Could not load upcoming screenings.");
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoadingScreenings(false);
                }
            }
        }

        loadScreenings();

        return () => controller.abort();
    }, [movieId]);

    const handleChooseSeats = () => {
        navigate(`/seats/${movie.id}`);
    };

    const handleWatchTrailer = () => {
        const query = encodeURIComponent(`${movie.title} ${movie.year} official trailer`);
        window.open(
            `https://www.youtube.com/results?search_query=${query}`,
            "_blank",
            "noopener,noreferrer",
        );
    };

    return (
        <div className="details-page">
            {/* Cinematic Blurred Backdrop */}
            {movie?.poster && (
                <div className="details-backdrop" aria-hidden="true">
                    <img src={movie.poster} alt="" className="details-backdrop-img" />
                    <div className="details-backdrop-overlay" />
                </div>
            )}

            <div className="details-shell">
                {/* Mobile Top Header */}
                <header className="details-mobile-header mobile-only">
                    <button
                        type="button"
                        className="details-mobile-back"
                        onClick={() => navigate(-1)}
                        aria-label="Go back"
                    >
                        <ChevronLeft size={22} />
                    </button>
                    <h1 className="details-mobile-heading">Movie details</h1>
                    <span className="details-mobile-spacer" aria-hidden="true" />
                </header>

                {/* Desktop Top Back Link */}
                <div className="details-desktop-topbar desktop-only">
                    <button
                        type="button"
                        className="details-back-link"
                        onClick={() => navigate("/explore")}
                    >
                        <ArrowLeft size={16} />
                        <span>Back to Explore</span>
                    </button>
                </div>

                {isLoading && (
                    <p role="status" className="details-status">
                        Loading movie details...
                    </p>
                )}

                {!isLoading && error && (
                    <div role="alert" className="details-error">
                        <p>{error}</p>
                        <button
                            type="button"
                            className="details-retry-btn"
                            onClick={() => navigate("/explore")}
                        >
                            Back to Explore
                        </button>
                    </div>
                )}

                {!isLoading && !error && movie && (
                    <>
                        <div className="details-content">
                            {/* Left Column: Poster */}
                            <div className="details-poster-column">
                                <div className="details-poster-wrapper">
                                    {movie.poster ? (
                                        <img
                                            src={movie.poster}
                                            alt={`${movie.title} poster`}
                                            className="details-poster-img"
                                            onError={(e) => {
                                                e.target.onerror = null;
                                                e.target.src =
                                                    "https://via.placeholder.com/400x600?text=No+Poster";
                                            }}
                                        />
                                    ) : (
                                        <div className="details-poster-fallback">
                                            No poster available
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Center Column: Movie Information */}
                            <section
                                className="details-info-column"
                                aria-labelledby="movie-details-title"
                            >
                                <div className="details-eyebrow-row desktop-only">
                                    <span className="details-eyebrow">MOVIE DETAILS</span>
                                    {movie.year && (
                                        <span className="details-year-badge">{movie.year}</span>
                                    )}
                                    <span className="details-rated-badge">{movie.rated}</span>
                                </div>

                                <h2 id="movie-details-title" className="details-title">
                                    {movie.title}
                                </h2>

                                {/* Mobile Director & Inline Metadata */}
                                <p className="details-director-mobile mobile-only">
                                    Director: {movie.director}
                                </p>
                                <p className="details-meta-inline mobile-only">
                                    {[...movie.genres, movie.runtime].filter(Boolean).join(" · ")}
                                </p>

                                {/* Rating Row */}
                                <div className="details-rating-row">
                                    <Star
                                        size={17}
                                        fill="var(--gold-warm)"
                                        color="var(--gold-warm)"
                                    />
                                    <span className="details-rating-value">{movie.rating}</span>
                                    <span className="details-rating-label">
                                        {movie.votes ? `IMDb (${movie.votes} votes)` : "Rating"}
                                    </span>
                                </div>

                                {/* Desktop Genre Pills & Duration */}
                                <div className="details-desktop-meta desktop-only">
                                    <div className="details-genre-list">
                                        {movie.genres.map((genre) => (
                                            <span key={genre} className="details-genre-pill">
                                                {genre}
                                            </span>
                                        ))}
                                    </div>
                                    <span className="details-runtime">
                                        <Clock size={15} />
                                        {movie.runtime}
                                    </span>
                                </div>

                                {/* Desktop Director & Writer */}
                                <div className="details-credits-row desktop-only">
                                    <div className="details-credit-item">
                                        <span className="details-field-label">Director</span>
                                        <p className="details-director-name">{movie.director}</p>
                                    </div>
                                    <div className="details-credit-item">
                                        <span className="details-field-label">Writers</span>
                                        <p className="details-director-name">{movie.writer}</p>
                                    </div>
                                </div>

                                <hr className="details-divider" />

                                {/* Synopsis Section */}
                                <div className="details-section-block">
                                    <h3 className="details-section-heading">Synopsis</h3>
                                    <p
                                        className={`details-synopsis-text ${
                                            isSynopsisExpanded ? "expanded" : ""
                                        }`}
                                    >
                                        {movie.synopsis}
                                    </p>
                                    {movie.synopsis.length > 150 && (
                                        <button
                                            type="button"
                                            className="details-read-more mobile-only"
                                            onClick={() => setIsSynopsisExpanded((prev) => !prev)}
                                        >
                                            {isSynopsisExpanded ? "Read less" : "Read more"}
                                        </button>
                                    )}
                                </div>

                                {/* Top Cast Section */}
                                {movie.actors.length > 0 && (
                                    <div className="details-section-block">
                                        <h3 className="details-section-heading">
                                            <Users size={16} />
                                            <span>Top Cast</span>
                                        </h3>
                                        <div className="details-cast-grid">
                                            {movie.actors.map((actor) => (
                                                <div key={actor} className="details-cast-card">
                                                    <span className="details-cast-avatar">
                                                        {actor.charAt(0)}
                                                    </span>
                                                    <span className="details-cast-name">
                                                        {actor}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Technical Details / Movie Info Grid */}
                                <div className="details-section-block">
                                    <h3 className="details-section-heading">Movie Info</h3>
                                    <div className="details-facts-grid">
                                        <div className="details-fact-card">
                                            <Calendar size={16} color="var(--gold-warm)" />
                                            <div>
                                                <span className="details-fact-label">
                                                    Release Date
                                                </span>
                                                <p className="details-fact-value">
                                                    {movie.released}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="details-fact-card">
                                            <Globe size={16} color="var(--gold-warm)" />
                                            <div>
                                                <span className="details-fact-label">
                                                    Language & Country
                                                </span>
                                                <p className="details-fact-value">
                                                    {movie.language} · {movie.country}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="details-fact-card">
                                            <Award size={16} color="var(--gold-warm)" />
                                            <div>
                                                <span className="details-fact-label">Awards</span>
                                                <p className="details-fact-value">{movie.awards}</p>
                                            </div>
                                        </div>

                                        <div className="details-fact-card">
                                            <Film size={16} color="var(--gold-warm)" />
                                            <div>
                                                <span className="details-fact-label">
                                                    {movie.boxOffice
                                                        ? "Box Office"
                                                        : "Classification"}
                                                </span>
                                                <p className="details-fact-value">
                                                    {movie.boxOffice || movie.rated}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="details-section-block">
                                    <h3 className="details-section-heading">
                                        <Calendar size={16} />
                                        <span>Upcoming Screenings</span>
                                    </h3>

                                    {isLoadingScreenings && (
                                        <p role="status">Loading upcoming screenings...</p>
                                    )}

                                    {!isLoadingScreenings && screeningsError && (
                                        <p role="alert">{screeningsError}</p>
                                    )}

                                    {!isLoadingScreenings && !screeningsError && screenings.length === 0 && (
                                        <p>No upcoming screenings scheduled.</p>
                                    )}

                                    {!isLoadingScreenings && !screeningsError && screenings.length > 0 && (
                                        <div className="details-facts-grid">
                                            {screenings.map((screening) => (
                                                <div className="details-fact-card" key={screening.id}>
                                                    <MapPin size={16} color="var(--gold-warm)" />

                                                    <div>
                                                        <span className="details-fact-label">
                                                            {screening.theatreName} · {screening.city}
                                                        </span>

                                                        <p className="details-fact-value">
                                                            {formatScreeningTime(screening.startTime)}
                                                        </p>

                                                        <span className="details-fact-label">
                                                            {screening.roomName}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Mobile Primary CTA Buttons */}
                                <div className="details-mobile-cta mobile-only">
                                    <button
                                        type="button"
                                        className="details-cta-btn"
                                        onClick={handleChooseSeats}
                                    >
                                        Choose seats
                                    </button>
                                    <button
                                        type="button"
                                        className="details-trailer-btn"
                                        onClick={handleWatchTrailer}
                                    >
                                        <Play size={16} />
                                        <span>Watch Trailer</span>
                                    </button>
                                </div>
                            </section>

                            {/* Right Column: Desktop Booking Card */}
                            <aside
                                className="details-booking-card desktop-only"
                                aria-label="Booking section"
                            >
                                <div className="booking-card-badge">
                                    <Ticket size={18} color="var(--gold-warm)" />
                                    <span>Your cinema visit</span>
                                </div>

                                <h3 className="booking-card-title">The big screen is waiting.</h3>
                                <p className="booking-card-copy">
                                    Make it a movie night. Continue to choose your seats for{" "}
                                    {movie.title}.
                                </p>

                                <div className="booking-locations-box">
                                    <span className="booking-locations-label">
                                        Available at Rio Theaters
                                    </span>

                                    {screenings.length > 0 ? (
                                        <div className="booking-location-pills">
                                            {[...new Set(screenings.map((screening) => screening.city))].map(
                                                (city) => (
                                                    <span className="booking-location-pill" key={city}>
                                                        <MapPin size={13} color="var(--gold-warm)" />
                                                        {city}
                                                    </span>
                                                ),
                                            )}
                                        </div>
                                    ) : (
                                        <p className="booking-card-caption">
                                            {isLoadingScreenings
                                                ? "Checking screening availability..."
                                                : screeningsError
                                                    ? "Screening information is unavailable."
                                                    : "No upcoming screenings scheduled."}
                                        </p>
                                    )}
                                </div>

                                <hr className="details-divider" />

                                <button
                                    type="button"
                                    className="details-cta-btn"
                                    onClick={handleChooseSeats}
                                >
                                    <span>Choose seats</span>
                                    <ArrowRight size={18} />
                                </button>

                                <button
                                    type="button"
                                    className="details-trailer-btn"
                                    onClick={handleWatchTrailer}
                                >
                                    <Play size={16} />
                                    <span>Watch Trailer</span>
                                </button>

                                <p className="booking-card-caption">Continue to seat selection</p>
                            </aside>
                        </div>

                        {/* Figma Bottom Footer */}
                        <footer className="details-footer desktop-only">
                            <span>Rio Cinema</span>
                            <span>Made for the big screen.</span>
                        </footer>
                    </>
                )}
            </div>
        </div>
    );
}
