import { Search, MapPin, Star } from "lucide-react";
import heroImg from "../assets/hero.png";
import "./HomePage.css";

export default function HomePage() {
    return (
        <div className="home-container">
            {/* 1. Header */}
            <header className="home-header">
                <div>
                    <span className="greeting">Welcome Back,</span>
                    <h1 className="username">Kakaroto</h1>
                </div>
                <div className="avatar">
                    <img src="https://i.pravatar.cc/100?img=12" alt="Kakaroto" />
                </div>
            </header>

            {/* 2. Search Bar */}
            <div className="search-bar">
                <Search size={18} className="search-icon" />
                <input type="text" placeholder="Search your favourite movie" readOnly />
            </div>

            {/* 3. Section: Coming Soon */}
            <section className="section-coming-soon">
                <h2 className="section-title">Coming Soon</h2>

                <div className="movie-card-coming">
                    <div className="poster-wrapper">
                        <img src={heroImg} alt="One Battle After Another" className="poster-img" />
                    </div>
                    <h3 className="movie-title">One Battle After Another</h3>
                    <span className="release-date">December 2026</span>
                    <button className="btn-book">Book Tickets</button>
                </div>
            </section>

            {/* 4. Section: Rio Movie Theater's */}
            <section className="section-cinemas">
                <div className="section-header">
                    <h2 className="section-title">Rio Movie Theater's</h2>
                    <span className="see-details">See details</span>
                </div>

                <div className="cinema-list">
                    {/* Oulu Cinema Card */}
                    <div className="cinema-card">
                        <div className="cinema-logo">
                            <span className="logo-text">RIO</span>
                        </div>
                        <div className="cinema-info">
                            <div className="cinema-distance">
                                <MapPin size={12} /> 2km
                            </div>
                            <h4 className="cinema-name">Oulu Rio Cinema</h4>
                            <p className="cinema-status">Closed 10.00 PM</p>
                        </div>
                        <div className="cinema-rating">
                            <Star size={14} fill="#FFC107" color="#FFC107" />
                            <span>4,9</span>
                        </div>
                    </div>

                    {/* Tampere Cinema Card */}
                    <div className="cinema-card">
                        <div className="cinema-logo">
                            <span className="logo-text">RIO</span>
                        </div>
                        <div className="cinema-info">
                            <div className="cinema-distance">
                                <MapPin size={12} /> 540km
                            </div>
                            <h4 className="cinema-name">Tampere Rio Cinema</h4>
                            <p className="cinema-status">Closed 09.00 PM</p>
                        </div>
                        <div className="cinema-rating">
                            <Star size={14} fill="#FFC107" color="#FFC107" />
                            <span>5,0</span>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
