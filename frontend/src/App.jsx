import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import TopNav from "./components/layout/TopNav";
import BottomNav from "./components/layout/BottomNav";

export default function App() {
    return (
        <Router>
            <TopNav />
            <main>
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route
                        path="/explore"
                        element={
                            <div style={{ padding: 20, textAlign: "center" }}>
                                Explore Page (In Progress)
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
