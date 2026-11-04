import { Search, MapPin, Star, ArrowUpRight } from "lucide-react";
import spidermanImg from "../assets/spiderman.jpg";
import rioLogo from "../assets/rio-logo.png";
import "./HomePage.css";

export default function HomePage() {
    return (
        <div className="home-container">
            {/* Mobile-only header elements */}
            <header className="home-header mobile-only">
                <div className="header-text">
                    <span className="greeting">Welcome Back,</span>
                    <h1 className="username">Kakaroto</h1>
                </div>
                <div className="avatar">
                    <img src="https://i.pravatar.cc/150?img=12" alt="Profile avatar" />
                </div>
            </header>

            {/* Mobile-only search bar */}
            <div className="search-bar mobile-only">
                <Search size={18} className="search-icon" />
                <input type="text" placeholder="Search your favourite movie" readOnly />
            </div>

            {/* Desktop-only greeting */}
            <div className="desktop-greeting desktop-only">
                <span className="greeting">Welcome Back,</span>
                <h1 className="username">Kakaroto</h1>
            </div>

            {/* Section: Coming Soon */}
            <section className="section-coming-soon">
                <div className="section-header">
                    <h2 className="section-title">Coming Soon</h2>
                    <button className="btn-explore-top">
                        Explore movies <ArrowUpRight size={16} />
                    </button>
                </div>

                <div className="coming-soon-carousel">
                    <div className="movie-card-coming">
                        <div className="poster-wrapper">
                            <img
                                src={spidermanImg}
                                alt="One Battle After Another"
                                className="poster-img"
                            />
                        </div>
                        <div className="movie-card-footer">
                            <div>
                                <h3 className="movie-title">One Battle After Another</h3>
                                <span className="release-date">December 2026</span>
                            </div>
                            <ArrowUpRight size={18} className="card-arrow desktop-only" />
                        </div>
                    </div>

                    <div className="movie-card-coming">
                        <div className="poster-wrapper">
                            <img
                                src={spidermanImg}
                                alt="Spider-Man: No Way Home"
                                className="poster-img"
                            />
                        </div>
                        <div className="movie-card-footer">
                            <div>
                                <h3 className="movie-title">Spider-Man: No Way Home</h3>
                                <span className="release-date">December 2026</span>
                            </div>
                            <ArrowUpRight size={18} className="card-arrow desktop-only" />
                        </div>
                    </div>
                </div>
            </section>

            {/* Section: Rio Movie Theaters */}
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
