import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ExplorePage from "./pages/ExplorePage";
import DetailsPage from "./pages/DetailsPage";
import AdminPage from "./pages/AdminPage";
import CheckoutPage from "./pages/CheckoutPage";
import PaymentSuccessPage from "./pages/PaymentSuccessPage";
import PaymentCancelPage from "./pages/PaymentCancelPage";
import TopNav from "./components/layout/TopNav";
import BottomNav from "./components/layout/BottomNav";

export default function App() {
    return (
        <Router>
            <TopNav />
            <main>
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/explore" element={<ExplorePage />} />
                    <Route path="/details/:id" element={<DetailsPage />} />
                    <Route path="/admin" element={<AdminPage />} />
                    <Route path="/checkout" element={<CheckoutPage />} />
                    <Route path="/checkout/success" element={<PaymentSuccessPage />} />
                    <Route path="/checkout/cancel" element={<PaymentCancelPage />} />
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
