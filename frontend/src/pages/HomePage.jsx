import { Search, MapPin, Star } from "lucide-react";
import heroImg from "../assets/hero.png";
import rioLogo from "../assets/rio-logo.png";
import "./HomePage.css";

export default function HomePage() {
    return (
        <div className="home-container">
            <header className="home-header">
                <div className="header-text">
                    <span className="greeting">Welcome Back,</span>
                    <h1 className="username">Kakaroto</h1>
                </div>
                <div className="avatar">
                    <img src="https://i.pravatar.cc/150?img=12" alt="Profile avatar" />
                </div>
            </header>

            <div className="search-bar">
                <Search size={18} className="search-icon" />
                <input type="text" placeholder="Search your favourite movie" readOnly />
            </div>

            <section className="section-coming-soon">
                <h2 className="section-title">Coming Soon</h2>

                <div className="coming-soon-carousel">
                    <div className="movie-card-coming">
                        <div className="poster-wrapper">
                            <img
                                src={heroImg}
                                alt="One Battle After Another"
                                className="poster-img"
                            />
                        </div>
                        <h3 className="movie-title">One Battle After Another</h3>
                        <span className="release-date">December 2026</span>
                        <button className="btn-explore">Explore movies</button>
                    </div>

                    <div className="movie-card-coming secondary-peek">
                        <div className="poster-wrapper">
                            <img src={heroImg} alt="Shang-Chi" className="poster-img" />
                        </div>
                        <h3 className="movie-title">Shang-Chi</h3>
                        <span className="release-date">December 2026</span>
                    </div>
                </div>
            </section>

            <section className="section-cinemas">
                <div className="section-header">
                    <h2 className="section-title">Rio Movie Theaters</h2>
                    <span className="see-details">See details</span>
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
                        <div className="cinema-rating">
                            <Star size={14} fill="var(--gold-warm)" color="var(--gold-warm)" />
                            <span>4,9</span>
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
                        <div className="cinema-rating">
                            <Star size={14} fill="var(--gold-warm)" color="var(--gold-warm)" />
                            <span>5,0</span>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
