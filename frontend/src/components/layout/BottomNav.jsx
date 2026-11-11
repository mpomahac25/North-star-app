import { Home, Compass, ShoppingCart, User } from "lucide-react";
import { NavLink } from "react-router-dom";
import "./BottomNav.css";

export default function BottomNav() {
    return (
        <nav className="bottom-nav">
            <NavLink to="/" className="nav-link-wrapper">
                {({ isActive }) => (
                    <div className={`nav-item ${isActive ? "active" : ""}`}>
                        <Home size={20} fill={isActive ? "currentColor" : "none"} />
                        <span>Home</span>
                    </div>
                )}
            </NavLink>

            <NavLink to="/explore" className="nav-link-wrapper">
                {({ isActive }) => (
                    <div className={`nav-item ${isActive ? "active" : ""}`}>
                        <Compass size={20} fill={isActive ? "currentColor" : "none"} />
                        <span>Explore</span>
                    </div>
                )}
            </NavLink>

            <NavLink to="/cart" className="nav-link-wrapper">
                {({ isActive }) => (
                    <div className={`nav-item ${isActive ? "active" : ""}`}>
                        <ShoppingCart size={20} fill={isActive ? "currentColor" : "none"} />
                        <span>Cart</span>
                    </div>
                )}
            </NavLink>

            <NavLink to="/profile" className="nav-link-wrapper">
                {({ isActive }) => (
                    <div className={`nav-item ${isActive ? "active" : ""}`}>
                        <User size={20} fill={isActive ? "currentColor" : "none"} />
                        <span>Profile</span>
                    </div>
                )}
            </NavLink>
        </nav>
    );
}
