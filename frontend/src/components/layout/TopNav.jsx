import { useEffect, useState } from "react";
import { Search, ShoppingCart, LogOut, UserRound } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import rioLogo from "../../assets/rio-logo.png";
import "./TopNav.css";

export default function TopNav({
  user,
  nickname,
  authState,
  isLoggedIn,
  isAdmin,
  logoutPending,
  onLogout,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!logoutDialogOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !logoutPending) {
        setLogoutDialogOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [logoutDialogOpen, logoutPending]);

  const handleSearch = (event) => {
    if (event.key === "Enter" || event.type === "click") {
      const cleanedSearch = searchTerm.trim().toLowerCase();

      if (cleanedSearch) {
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
        <nav className="top-nav-links" aria-label="Primary navigation">
          <NavLink
            to="/"
            className={({ isActive }) =>
              isActive ? "top-link active" : "top-link"
            }
          >
            Home
          </NavLink>
          <NavLink
            to="/explore"
            className={({ isActive }) =>
              isActive ? "top-link active" : "top-link"
            }
          >
            Explore
          </NavLink>
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                isActive ? "top-link active" : "top-link"
              }
            >
              Admin
            </NavLink>
          )}
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
          onChange={(event) => setSearchTerm(event.target.value)}
          onKeyDown={handleSearch}
        />
      </div>

      <div className="top-nav-right">
        <NavLink to="/cart" className="top-cart-link">
          <ShoppingCart size={18} />
          <span>Cart</span>
        </NavLink>
        {authState === "checking" ? (
          <span className="top-auth-status" role="status">
            Checking profile…
          </span>
        ) : isLoggedIn ? (
          <div className="top-authenticated-profile">
            <NavLink
              to="/profile"
              className="top-user-profile"
              aria-label={`Profile for ${user.email}`}
            >
              <span className="top-avatar-placeholder" aria-hidden="true">
                {nickname?.[0]?.toUpperCase() || <UserRound size={18} />}
              </span>
              <span className="top-user-info">
                <span className="top-username">{nickname}</span>
                <span className="top-user-role">Profile</span>
              </span>
            </NavLink>
            <button
              type="button"
              className="top-logout-button"
              onClick={() => setLogoutDialogOpen(true)}
              disabled={logoutPending}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        ) : (
          <NavLink
            className="top-auth-button"
            to="/login"
            title={
              authState === "unavailable"
                ? "Login service may be unavailable"
                : undefined
            }
          >
            <UserRound size={17} />
            <span>Sign in</span>
          </NavLink>
        )}
      </div>

      {logoutDialogOpen && (
        <div
          className="logout-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !logoutPending) {
              setLogoutDialogOpen(false);
            }
          }}
        >
          <section
            aria-labelledby="logout-dialog-title"
            aria-modal="true"
            className="logout-dialog"
            role="dialog"
          >
            <h2 id="logout-dialog-title">Sign out?</h2>
            <p>
              Are you sure you want to sign out of your Rio Theaters account?
            </p>
            <div className="logout-dialog-actions">
              <button
                autoFocus
                className="logout-cancel-button"
                disabled={logoutPending}
                onClick={() => setLogoutDialogOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="logout-confirm-button"
                disabled={logoutPending}
                onClick={async () => {
                  await onLogout();
                  setLogoutDialogOpen(false);
                }}
                type="button"
              >
                {logoutPending ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </section>
        </div>
      )}
    </header>
  );
}
