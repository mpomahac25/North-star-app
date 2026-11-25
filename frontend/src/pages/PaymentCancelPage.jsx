import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CreditCard } from "lucide-react";
import "./CheckoutPage.css";

const ACTIVE_BOOKING_STORAGE_KEY = "rio_active_booking_id";

function resolveStoredBookingId(searchParams) {
    const queryId = searchParams.get("bookingId") || searchParams.get("booking_id");
    if (queryId && /^\d+$/.test(queryId.trim())) {
        return queryId.trim();
    }

    try {
        const storedId = window.sessionStorage.getItem(ACTIVE_BOOKING_STORAGE_KEY);
        if (storedId && /^\d+$/.test(storedId.trim())) {
            return storedId.trim();
        }
    } catch {
        // Ignore storage restrictions
    }

    return "";
}

export default function PaymentCancelPage() {
    const [searchParams] = useSearchParams();
    const bookingId = resolveStoredBookingId(searchParams);

    const retryCheckoutUrl = bookingId
        ? `/checkout?bookingId=${encodeURIComponent(bookingId)}`
        : "/checkout";

    return (
        <div className="payment-page">
            <div className="payment-shell">
                <div className="payment-top-bar">
                    <Link to="/cart" className="payment-back-link">
                        <ArrowLeft size={16} />
                        <span>Back to Cart</span>
                    </Link>

                    <ol className="checkout-stepper" aria-label="Checkout progress">
                        <li className="checkout-step completed">
                            <span className="checkout-step-num">01</span>
                            <span>Cart</span>
                        </li>
                        <li className="checkout-step-divider" aria-hidden="true">
                            /
                        </li>
                        <li className="checkout-step active" aria-current="step">
                            <span className="checkout-step-num">02</span>
                            <span>Payment</span>
                        </li>
                        <li className="checkout-step-divider" aria-hidden="true">
                            /
                        </li>
                        <li className="checkout-step">
                            <span className="checkout-step-num">03</span>
                            <span>Confirmation</span>
                        </li>
                    </ol>
                </div>

                <section
                    className="payment-card result-card"
                    aria-labelledby="payment-cancel-heading"
                >
                    <div className="payment-card-header">
                        <div className="payment-card-icon warning">
                            <AlertTriangle size={22} />
                        </div>
                        <div>
                            <h1 id="payment-cancel-heading" className="payment-card-title">
                                Payment was not completed
                            </h1>
                            <p className="payment-card-caption">
                                Your checkout was cancelled or interrupted before payment finished.
                            </p>
                        </div>
                    </div>

                    <div className="payment-alert payment-alert-warning" role="status">
                        No payment was confirmed. Your booking has not been automatically
                        cancelled—you can return to checkout to complete your payment while your
                        seat hold is still active.
                    </div>

                    {bookingId && (
                        <div className="result-details-grid">
                            <div className="result-detail-item">
                                <span className="result-detail-label">Booking Reference</span>
                                <span className="result-detail-value gold">#{bookingId}</span>
                            </div>
                            <div className="result-detail-item">
                                <span className="result-detail-label">Status</span>
                                <span className="result-detail-value">Awaiting payment</span>
                            </div>
                        </div>
                    )}

                    <div className="result-actions">
                        <Link to={retryCheckoutUrl} className="payment-btn-primary">
                            <CreditCard size={16} />
                            <span>Retry Payment</span>
                        </Link>
                        <Link to="/cart" className="payment-btn-secondary">
                            Back to Cart
                        </Link>
                    </div>
                </section>
            </div>
        </div>
    );
}
