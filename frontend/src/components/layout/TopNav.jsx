import { Search, ShoppingCart, ChevronDown } from "lucide-react";
import { NavLink } from "react-router-dom";
import rioLogo from "../../assets/rio-logo.png";
import "./TopNav.css";

export default function TopNav() {
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
                <Search size={16} className="search-icon" />
                <input type="text" placeholder="Search your favourite movie" readOnly />
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
