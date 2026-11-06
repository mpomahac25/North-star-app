import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, ArrowUpRight } from "lucide-react";
import spidermanImg from "../assets/spiderman.jpg";
import heroImg from "../assets/hero.png";
import "./ExplorePage.css";

const MOCK_MOVIES = [
    {
        id: 1,
        title: "Spider-Man: No Way Home",
        category: "Coming Soon",
        release: "December 2026",
        poster: spidermanImg,
    },
    {
        id: 2,
        title: "One Battle After Another",
        category: "Coming Soon",
        release: "December 2026",
        poster: heroImg,
    },
    {
        id: 3,
        title: "Shang-Chi",
        category: "Now Showing",
        release: "Action, Fantasy",
        poster: spidermanImg,
    },
    {
        id: 4,
        title: "Black Panther",
        category: "Now Showing",
        release: "Action, Sci-Fi",
        poster: heroImg,
    },
];

export default function ExplorePage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const query = searchParams.get("search") || "";

    const filteredMovies = MOCK_MOVIES.filter((movie) =>
        movie.title.toLowerCase().includes(query.toLowerCase()),
    );

    return (
        <div className="explore-container">
            <header className="explore-header">
                <h1 className="explore-title">Explore movies</h1>
                <p className="explore-subtitle">
                    Find your favourite movie, search by title or browse the full catalogue.
                </p>
            </header>

            {/* Grid of Movie Cards */}
            <div className="explore-grid">
                {filteredMovies.length > 0 ? (
                    filteredMovies.map((movie) => (
                        <div
                            key={movie.id}
                            className="explore-card"
                            onClick={() => navigate("/details")}
                        >
                            <div className="explore-poster-wrapper">
                                <img
                                    src={movie.poster}
                                    alt={movie.title}
                                    className="explore-poster-img"
                                />
                            </div>
                            <div className="explore-card-footer">
                                <div>
                                    <h3 className="explore-movie-title">{movie.title}</h3>
                                    <span className="explore-movie-meta">{movie.release}</span>
                                </div>
                                <ArrowUpRight size={16} className="card-arrow" />
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="no-results">
                        <p>No movies found for "{query}".</p>
                    </div>
                )}
            </div>
        </div>
    );
}
