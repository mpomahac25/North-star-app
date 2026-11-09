import { useState } from "react";
import { Search, ShoppingCart, ChevronDown } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import rioLogo from "../../assets/rio-logo.png";
import "./TopNav.css";

export default function TopNav() {
    const [searchTerm, setSearchTerm] = useState("");
    const navigate = useNavigate();

    // This function runs when Enter is pressed or the search icon is clicked
    const handleSearch = (e) => {
        if (e.key === "Enter" || e.type === "click") {
            const cleanedSearch = searchTerm.trim().toLowerCase();

            if (cleanedSearch) {
                // Safely encode special characters for desktop search as well
                navigate(`/explore?search=${encodeURIComponent(cleanedSearch)}`);
            }
        }
    };

    return (
        <header className="top-nav">
            <div className="top-nav-left">
                <div className="top-nav-logo">
                    <img src={rioLogo} alt="Rio Cinema Logo" />
                </div>
                <nav className="top-nav-links">
                    <NavLink
                        to="/"
                        className={({ isActive }) => (isActive ? "top-link active" : "top-link")}
                    >
                        Home
                    </NavLink>
                    <NavLink
                        to="/explore"
                        className={({ isActive }) => (isActive ? "top-link active" : "top-link")}
                    >
                        Explore
                    </NavLink>
                </nav>
            </div>

            <div className="top-nav-search">
                <Search
                    size={16}
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

            <div className="top-nav-right">
                <NavLink to="/cart" className="top-cart-link">
                    <ShoppingCart size={18} />
                    <span>Cart</span>
                </NavLink>
                <div className="top-user-profile">
                    <img
                        src="https://i.pravatar.cc/150?img=12"
                        alt="Kakaroto"
                        className="top-avatar"
                    />
                    <div className="top-user-info">
                        <span className="top-username">Kakaroto</span>
                        <span className="top-user-role">Profile</span>
                    </div>
                    <ChevronDown size={14} />
                </div>
            </div>
        </header>
    );
}
