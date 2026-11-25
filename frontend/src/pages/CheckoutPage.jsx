import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowLeft, CreditCard, ExternalLink, Lock, ShieldCheck, Ticket } from "lucide-react";
import { createPaymentCheckoutSession } from "../api";
import "./CheckoutPage.css";

const ACTIVE_BOOKING_STORAGE_KEY = "rio_active_booking_id";

function resolveInitialBookingId(searchParams, locationState) {
    const queryId = searchParams.get("bookingId") || searchParams.get("booking_id");
    if (queryId && /^\d+$/.test(queryId.trim())) {
        return queryId.trim();
    }

    const stateId = locationState?.bookingId;
    if (stateId !== undefined && stateId !== null && /^\d+$/.test(String(stateId).trim())) {
        return String(stateId).trim();
    }

    try {
        const storedId = window.sessionStorage.getItem(ACTIVE_BOOKING_STORAGE_KEY);
        if (storedId && /^\d+$/.test(storedId.trim())) {
            return storedId.trim();
        }
    } catch {
        // Ignore storage restrictions in private browsing modes
    }

    return "";
}

export default function CheckoutPage({ onRedirect = (url) => window.location.assign(url) }) {
    const [searchParams] = useSearchParams();
    const location = useLocation();

    const externalBookingId = resolveInitialBookingId(searchParams, location.state);
    const [overrideState, setOverrideState] = useState({
        key: location.key,
        value: null,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    const bookingIdInput =
        overrideState.key === location.key && overrideState.value !== null
            ? overrideState.value
            : externalBookingId;

    const summaryItems = Array.isArray(location.state?.items) ? location.state.items : [];
    const summaryTotal =
        typeof location.state?.totalFormatted === "string" ? location.state.totalFormatted : "";

    async function handleProceedToStripe(event) {
        event.preventDefault();
        if (isSubmitting) return;

        const cleanedId = bookingIdInput.trim();
        if (!/^\d+$/.test(cleanedId) || Number(cleanedId) < 1) {
            setErrorMessage("Please enter a valid positive numeric Booking ID.");
            return;
        }

        setIsSubmitting(true);
        setErrorMessage("");

        try {
            try {
                window.sessionStorage.setItem(ACTIVE_BOOKING_STORAGE_KEY, cleanedId);
            } catch {
                // Ignore storage errors
            }

            const sessionData = await createPaymentCheckoutSession(Number(cleanedId));

            if (!sessionData?.checkoutUrl) {
                throw new Error("Payment service did not return a Stripe checkout URL.");
            }

            onRedirect(sessionData.checkoutUrl);
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : "Unable to start Stripe Checkout. Please try again.",
            );
        } finally {
            setIsSubmitting(false);
        }
    }

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

                <header className="payment-header">
                    <h1 className="payment-title">Complete your payment</h1>
                    <p className="payment-subtitle">
                        Review your booking reference and continue to Stripe&apos;s secure hosted
                        checkout.
                    </p>
                </header>

                {errorMessage && (
                    <div className="payment-alert payment-alert-error" role="alert">
                        <span>{errorMessage}</span>
                    </div>
                )}

                <div className="checkout-grid">
                    <section className="payment-card" aria-labelledby="stripe-payment-heading">
                        <div className="payment-card-header">
                            <div className="payment-card-icon">
                                <CreditCard size={20} />
                            </div>
                            <div>
                                <h2 id="stripe-payment-heading" className="payment-card-title">
                                    Stripe Hosted Checkout
                                </h2>
                                <p className="payment-card-caption">
                                    Card details are entered only on Stripe&apos;s encrypted page.
                                </p>
                            </div>
                        </div>

                        <form className="checkout-form" onSubmit={handleProceedToStripe} noValidate>
                            <div className="payment-field">
                                <label htmlFor="checkout-booking-id" className="payment-label">
                                    Booking ID
                                </label>
                                <input
                                    id="checkout-booking-id"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    className="payment-input"
                                    placeholder="e.g. 123"
                                    value={bookingIdInput}
                                    onChange={(e) => {
                                        setOverrideState({
                                            key: location.key,
                                            value: e.target.value,
                                        });
                                        if (errorMessage) setErrorMessage("");
                                    }}
                                    disabled={isSubmitting}
                                    required
                                />
                                <span className="payment-hint">
                                    Passed automatically from your cart or reservation link.
                                </span>
                            </div>

                            <div className="stripe-security-box">
                                <div className="stripe-security-row">
                                    <Lock size={16} className="stripe-security-icon" />
                                    <span>
                                        You will be redirected to Stripe to complete your payment
                                        safely.
                                    </span>
                                </div>
                                <div className="stripe-security-row">
                                    <ShieldCheck size={16} className="stripe-security-icon" />
                                    <span>
                                        Final ticket prices and seat holds are verified on our
                                        server before payment.
                                    </span>
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="payment-btn-primary"
                                disabled={isSubmitting}
                            >
                                <span>
                                    {isSubmitting
                                        ? "Redirecting to Stripe..."
                                        : "Proceed to Stripe Checkout"}
                                </span>
                                <ExternalLink size={16} />
                            </button>

                            <p className="stripe-powered-note">
                                Payments powered by <strong>Stripe</strong> · Test sandbox mode
                            </p>
                        </form>
                    </section>

                    <aside
                        className="payment-card checkout-summary-card"
                        aria-label="Order summary"
                    >
                        <div className="summary-header-row">
                            <div className="payment-card-header">
                                <div className="payment-card-icon gold">
                                    <Ticket size={20} />
                                </div>
                                <div>
                                    <h2 className="payment-card-title">Booking summary</h2>
                                    <p className="payment-card-caption">
                                        {bookingIdInput.trim()
                                            ? `Reference #${bookingIdInput.trim()}`
                                            : "Awaiting booking reference"}
                                    </p>
                                </div>
                            </div>
                            <Link to="/cart" className="summary-edit-link">
                                Edit in cart
                            </Link>
                        </div>

                        {summaryItems.length > 0 ? (
                            <ul className="summary-item-list">
                                {summaryItems.map((item, idx) => (
                                    <li key={item.id ?? idx} className="summary-item">
                                        <div>
                                            <p className="summary-item-title">
                                                {item.movieTitle || "Cinema Ticket"}
                                            </p>
                                            <p className="summary-item-meta">
                                                {[item.theatre, item.showtime, item.seats]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </p>
                                        </div>
                                        {item.priceFormatted && (
                                            <span className="summary-item-price">
                                                {item.priceFormatted}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="summary-placeholder-box">
                                <p className="summary-placeholder-title">
                                    Server-verified booking details
                                </p>
                                <p className="summary-placeholder-text">
                                    Your selected screening, seat numbers, and exact EUR total are
                                    locked to Booking{" "}
                                    <strong>
                                        {bookingIdInput.trim() ? `#${bookingIdInput.trim()}` : "ID"}
                                    </strong>{" "}
                                    and displayed on the Stripe payment screen.
                                </p>
                            </div>
                        )}

                        <div className="summary-divider" />

                        <div className="summary-total-row">
                            <span className="summary-total-label">Total</span>
                            <span className="summary-total-value">
                                {summaryTotal || "Calculated at Stripe"}
                            </span>
                        </div>

                        <p className="summary-footnote">
                            Your seats remain reserved while you complete checkout. Once Stripe
                            confirms payment, your booking status updates automatically.
                        </p>
                    </aside>

                    <p className="summary-advisory-note">
                        <Ticket size={15} className="summary-advisory-icon" />
                        <span>
                            Review your dates and seats before completing payment. To make changes,
                            return to your cart.
                        </span>
                    </p>
                </div>
                <footer className="payment-footer">
                    <span>Rio Cinema</span>
                    <span>Made for the big screen.</span>
                </footer>
            </div>
        </div>
    );
}
