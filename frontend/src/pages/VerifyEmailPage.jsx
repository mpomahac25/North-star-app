import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

export default function VerifyEmailPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const email = location.state?.email || "";
  const canResend = Boolean(email);
  const [status, setStatus] = useState(
    location.state?.registrationPending ? "pending" : "idle",
  );
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitRequest(path, body, successStatus) {
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Could not complete the request. Please try again.",
        );
      }
      setStatus(successStatus);
    } catch (requestError) {
      setStatus("error");
      setError(
        requestError.message || "Could not reach the authentication service.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleVerify = (event) => {
    event.preventDefault();
    return submitRequest("/api/auth/verify-email", { token }, "verified");
  };

  const handleResend = (event) => {
    event.preventDefault();
    return submitRequest("/api/auth/resend-verification", { email }, "resent");
  };

  return (
    <div className="auth-page">
      <section className="auth-card" aria-labelledby="verify-email-heading">
        <p className="auth-eyebrow">RIO THEATERS</p>
        <h1 id="verify-email-heading">Verify your email</h1>
        {status === "pending" && (
          <p className="auth-intro" role="status">
            Check your inbox for a verification link. Don't forget to check spam
            folder!
          </p>
        )}
        {!token && canResend && status === "idle" && (
          <p className="auth-intro">
            You can request another verification link if needed.
          </p>
        )}
        {status === "verified" && (
          <>
            <p className="auth-intro" role="status">
              Your email is verified. You can now sign in.
            </p>
            <Link to="/login">Sign in</Link>
          </>
        )}
        {status === "resent" && (
          <p className="auth-intro" role="status">
            If the address belongs to an unverified account, a verification
            email will be sent.
          </p>
        )}
        {token && status !== "verified" && (
          <form className="auth-form" onSubmit={handleVerify}>
            <p className="auth-intro">
              Confirm that you own the email address used for this account.
            </p>
            {error && status === "error" && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="auth-submit-button"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Please wait…" : "Verify email"}
            </button>
          </form>
        )}
        {!token && canResend && status !== "resent" && (
          <form className="auth-form" onSubmit={handleResend}>
            {error && status === "error" && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="auth-submit-button"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Please wait…" : "Resend verification email"}
            </button>
          </form>
        )}
        {status !== "verified" && (
          <p className="auth-switch">
            <Link to="/login">Return to sign in</Link>
          </p>
        )}
      </section>
    </div>
  );
}
