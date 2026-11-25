import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, Check, Clock, RefreshCw } from "lucide-react";
import { fetchPaymentSessionStatus } from "../api";
import "./CheckoutPage.css";

const ACTIVE_BOOKING_STORAGE_KEY = "rio_active_booking_id";
const MAX_POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 2000;

function formatStatusLabel(status) {
    switch (status) {
        case "paid":
            return "Paid";
        case "pending_payment":
        case "creating":
            return "Pending confirmation";
        case "expired":
            return "Expired";
        case "cancelled":
            return "Cancelled";
        case "failed":
            return "Failed";
        default:
            return status || "Unknown";
    }
}

function PaymentSuccessContent({ sessionId }) {
    const [paymentData, setPaymentData] = useState(null);
    const [errorMessage, setErrorMessage] = useState("");
    const [isChecking, setIsChecking] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        let isCancelled = false;
        let timeoutId = null;
        let attempts = 0;

        async function verifyPaymentStatus() {
            try {
                const data = await fetchPaymentSessionStatus(sessionId);
                if (isCancelled) return;

                setPaymentData(data);
                setErrorMessage("");

                if (data?.status === "paid") {
                    setIsChecking(false);
                    try {
                        window.sessionStorage.removeItem(ACTIVE_BOOKING_STORAGE_KEY);
                    } catch {
                        // Ignore storage errors
                    }
                    return;
                }

                const isPending = data?.status === "pending_payment" || data?.status === "creating";

                if (isPending && attempts < MAX_POLL_ATTEMPTS) {
                    attempts += 1;
                    timeoutId = window.setTimeout(verifyPaymentStatus, POLL_INTERVAL_MS);
                } else {
                    setIsChecking(false);
                }
            } catch (error) {
                if (isCancelled) return;
                setErrorMessage(
                    error instanceof Error
                        ? error.message
                        : "Could not verify payment status with the server.",
                );
                setIsChecking(false);
            }
        }

        verifyPaymentStatus();

        return () => {
            isCancelled = true;
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
        };
    }, [sessionId, refreshTrigger]);

    function handleManualRefresh() {
        setIsChecking(true);
        setErrorMessage("");
        setRefreshTrigger((prev) => prev + 1);
    }

    const status = paymentData?.status || "";
    const isPaid = status === "paid";
    const isPending =
        !errorMessage && (isChecking || status === "pending_payment" || status === "creating");
    const isUnsuccessful = !isPaid && !isPending && Boolean(status || errorMessage);

    const retryUrl = paymentData?.bookingId
        ? `/checkout?bookingId=${encodeURIComponent(paymentData.bookingId)}`
        : "/checkout";

    return (
        <div className="payment-page">
            <div className="payment-shell">
                <div className="payment-top-bar">
                    <span />
                    <ol className="checkout-stepper" aria-label="Checkout progress">
                        <li className="checkout-step completed">
                            <span className="checkout-step-num">01</span>
                            <span>Cart</span>
                        </li>
                        <li className="checkout-step-divider" aria-hidden="true">
                            /
                        </li>
                        <li className="checkout-step completed">
                            <span className="checkout-step-num">02</span>
                            <span>Payment</span>
                        </li>
                        <li className="checkout-step-divider" aria-hidden="true">
                            /
                        </li>
                        <li className="checkout-step active" aria-current="step">
                            <span className="checkout-step-num">03</span>
                            <span>Confirmation</span>
                        </li>
                    </ol>
                </div>

                <section
                    className="payment-card result-card"
                    aria-labelledby="payment-result-heading"
                >
                    {isPaid && (
                        <>
                            <div className="figma-success-hero">
                                <div className="figma-success-badge">
                                    <Check size={28} strokeWidth={2.75} />
                                </div>
                                <h1 id="payment-result-heading" className="payment-card-title">
                                    Booking confirmed
                                </h1>
                                <p className="payment-card-caption">
                                    Your seats are booked. Your payment has been verified and
                                    confirmed.
                                </p>
                            </div>

                            <div className="payment-alert payment-alert-success" role="status">
                                Payment confirmed by server webhook. Your tickets are ready.
                            </div>
                        </>
                    )}

                    {isPending && (
                        <>
                            <div className="payment-card-header">
                                <div className="payment-card-icon gold">
                                    <Clock size={22} />
                                </div>
                                <div>
                                    <h1 id="payment-result-heading" className="payment-card-title">
                                        Verifying your payment...
                                    </h1>
                                    <p className="payment-card-caption">
                                        Waiting for Stripe webhook confirmation from our server.
                                    </p>
                                </div>
                            </div>

                            <div className="payment-alert payment-alert-warning" role="status">
                                Please keep this page open for a moment while we confirm your
                                transaction.
                            </div>
                        </>
                    )}

                    {isUnsuccessful && (
                        <>
                            <div className="payment-card-header">
                                <div className="payment-card-icon warning">
                                    <AlertCircle size={22} />
                                </div>
                                <div>
                                    <h1 id="payment-result-heading" className="payment-card-title">
                                        Payment not confirmed
                                    </h1>
                                    <p className="payment-card-caption">
                                        We could not confirm a completed payment for this session.
                                    </p>
                                </div>
                            </div>

                            <div className="payment-alert payment-alert-error" role="alert">
                                {errorMessage ||
                                    `Current payment status: ${formatStatusLabel(status)}. Please retry checkout if your payment did not complete.`}
                            </div>
                        </>
                    )}

                    <div className="result-details-grid">
                        {paymentData?.bookingId !== undefined && (
                            <div className="result-detail-item">
                                <span className="result-detail-label">Booking ID</span>
                                <span className="result-detail-value gold">
                                    #{paymentData.bookingId}
                                </span>
                            </div>
                        )}

                        <div className="result-detail-item">
                            <span className="result-detail-label">Payment Status</span>
                            <span className={`result-detail-value ${isPaid ? "success" : "gold"}`}>
                                {isChecking && !status ? "Checking..." : formatStatusLabel(status)}
                            </span>
                        </div>

                        {paymentData?.paymentId && (
                            <div className="result-detail-item">
                                <span className="result-detail-label">Payment Reference</span>
                                <span className="result-detail-value">{paymentData.paymentId}</span>
                            </div>
                        )}

                        <div className="result-detail-item">
                            <span className="result-detail-label">Stripe Session</span>
                            <span className="result-detail-value">{sessionId}</span>
                        </div>
                    </div>

                    <div className="result-actions">
                        {isPaid ? (
                            <>
                                <Link to="/explore" className="payment-btn-primary">
                                    Browse More Movies
                                </Link>
                                <Link to="/" className="payment-btn-secondary">
                                    Back to Home
                                </Link>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="payment-btn-secondary"
                                    onClick={handleManualRefresh}
                                    disabled={isChecking}
                                >
                                    <RefreshCw size={16} />
                                    <span>
                                        {isChecking ? "Checking status..." : "Check Status Again"}
                                    </span>
                                </button>
                                <Link to={retryUrl} className="payment-btn-primary">
                                    Return to Checkout
                                </Link>
                            </>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}

export default function PaymentSuccessPage() {
    const [searchParams] = useSearchParams();
    const sessionId = (
        searchParams.get("session_id") ||
        searchParams.get("sessionId") ||
        ""
    ).trim();

    if (!sessionId) {
        return (
            <div className="payment-page">
                <div className="payment-shell">
                    <section
                        className="payment-card result-card"
                        aria-labelledby="missing-session-heading"
                    >
                        <div className="payment-card-header">
                            <div className="payment-card-icon warning">
                                <AlertCircle size={22} />
                            </div>
                            <div>
                                <h1 id="missing-session-heading" className="payment-card-title">
                                    Missing payment session
                                </h1>
                                <p className="payment-card-caption">
                                    No Stripe session ID was found in the return URL.
                                </p>
                            </div>
                        </div>

                        <div className="payment-alert payment-alert-error" role="alert">
                            We cannot verify payment without a valid Stripe session identifier.
                        </div>

                        <div className="result-actions">
                            <Link to="/checkout" className="payment-btn-primary">
                                Go to Checkout
                            </Link>
                            <Link to="/" className="payment-btn-secondary">
                                Back to Home
                            </Link>
                        </div>
                    </section>
                    <footer className="payment-footer">
                        <span>Rio Cinema</span>
                        <span>Made for the big screen.</span>
                    </footer>
                </div>
            </div>
        );
    }

    return <PaymentSuccessContent key={sessionId} sessionId={sessionId} />;
}
