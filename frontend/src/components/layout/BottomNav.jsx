import { Home, Compass, ShoppingCart, User } from "lucide-react";
import { NavLink } from "react-router-dom";
import "./BottomNav.css";

export default function BottomNav() {
    return (
        <nav className="bottom-nav">
            <NavLink
                to="/"
                className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
            >
                <Home size={22} />
            </NavLink>
            <NavLink
                to="/explore"
                className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
            >
                <Compass size={22} />
            </NavLink>
            <NavLink
                to="/cart"
                className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
            >
                <ShoppingCart size={22} />
            </NavLink>
            <NavLink
                to="/settings"
                className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
            >
                <User size={22} />
            </NavLink>
        </nav>
    );
}
