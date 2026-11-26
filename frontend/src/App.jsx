import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ExplorePage from "./pages/ExplorePage";
import DetailsPage from "./pages/DetailsPage";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import TopNav from "./components/layout/TopNav";
import BottomNav from "./components/layout/BottomNav";

export default function App() {
  const [user, setUser] = useState(null);
  const [authState, setAuthState] = useState("checking");
  const [logoutPending, setLogoutPending] = useState(false);
  const isLoggedIn = Boolean(user);
  const googleFallback = user?.email?.split("@")[0];
  const nickname =
    user?.displayName ||
    (user?.username && !user.username.startsWith("google_")
      ? user.username
      : googleFallback) ||
    null;

  useEffect(() => {
    let active = true;

    fetch("/api/auth/me", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error("Could not check sign-in status.");
        return response.json();
      })
      .then((result) => {
        if (!active) return;
        setUser(result?.user ?? null);
        setAuthState(result?.user ? "signed-in" : "signed-out");
      })
      .catch(() => {
        if (active) setAuthState("unavailable");
      });

    return () => {
      active = false;
    };
  }, []);

  const handleLogout = async () => {
    setLogoutPending(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Could not sign out.");
      setUser(null);
      setAuthState("signed-out");
    } catch {
      setAuthState("unavailable");
    } finally {
      setLogoutPending(false);
    }
  };

  const handleAuthenticated = (authenticatedUser) => {
    setUser(authenticatedUser);
    setAuthState("signed-in");
  };

  return (
    <Router>
      <TopNav
        user={user}
        nickname={nickname}
        authState={authState}
        isLoggedIn={isLoggedIn}
        logoutPending={logoutPending}
        onLogout={handleLogout}
      />
      <main>
        <Routes>
          <Route
            path="/"
            element={<HomePage isLoggedIn={isLoggedIn} nickname={nickname} />}
          />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/details/:id" element={<DetailsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route
            path="/login"
            element={<LoginPage onAuthenticated={handleAuthenticated} />}
          />
          <Route
            path="/register"
            element={<RegisterPage onAuthenticated={handleAuthenticated} />}
          />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route
            path="/seats/:id"
            element={
              <div style={{ padding: 20, textAlign: "center" }}>
                Select Seats Page (In Progress)
              </div>
            }
          />
          <Route
            path="/cart"
            element={
              <div style={{ padding: 20, textAlign: "center" }}>
                Shopping Cart Page (In Progress)
              </div>
            }
          />
          <Route
            path="/profile"
            element={
              <div style={{ padding: 20, textAlign: "center" }}>
                Profile Page (In Progress)
              </div>
            }
          />
        </Routes>
      </main>
      <BottomNav />
    </Router>
  );
}
