import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import BottomNav from "./components/layout/BottomNav";

export default function App() {
    return (
        <Router>
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
                        path="/settings"
                        element={
                            <div style={{ padding: 20, textAlign: "center" }}>
                                Settings Page (In Progress)
                            </div>
                        }
                    />
                </Routes>
            </main>
            <BottomNav />
        </Router>
    );
}
