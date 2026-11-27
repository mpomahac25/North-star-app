import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./AuthPanel.css";

function GoogleMark() {
  return (
    <svg
      className="google-mark"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"
      />
      <path
        fill="#34A853"
        d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.7-5.1c-1.8 1.2-4.1 2-6.8 2-5.2 0-9.6-3.5-11.2-8.2H5.9v5.2A20 20 0 0 0 24 44Z"
      />
      <path
        fill="#FBBC05"
        d="M12.8 27.9a12 12 0 0 1 0-7.8v-5.2H5.9a20 20 0 0 0 0 18.2l6.9-5.2Z"
      />
      <path
        fill="#EA4335"
        d="M24 11.9c3 0 5.7 1 7.8 3.1l5.9-5.9A19.7 19.7 0 0 0 24 4 20 20 0 0 0 5.9 14.9l6.9 5.2c1.6-4.7 6-8.2 11.2-8.2Z"
      />
    </svg>
  );
}

export default function AuthPanel({ mode, onAuthenticated }) {
  const isRegistration = mode === "register";
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const verificationEmail = isRegistration ? email : identifier;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const endpoint = isRegistration ? "/api/auth/register" : "/api/auth/login";
    const body = isRegistration
      ? { username, email, password }
      : { identifier, password };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (
          result.code === "EMAIL_VERIFICATION_REQUIRED" ||
          result.code === "VERIFICATION_EMAIL_FAILED"
        ) {
          setVerificationRequired(true);
        }
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Could not authenticate. Please try again.",
        );
      }

      if (isRegistration && response.status === 202) {
        navigate("/verify-email", {
          state: { email, registrationPending: true },
        });
        return;
      }

      if (!result.user) {
        throw new Error(
          "Authentication succeeded, but the user profile was missing.",
        );
      }

      onAuthenticated(result.user);
      navigate("/");
    } catch (requestError) {
      setError(
        requestError.message || "Could not reach the authentication service.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-card" aria-labelledby="auth-heading">
        <p className="auth-eyebrow">RIO THEATERS</p>
        <h1 id="auth-heading">
          {isRegistration ? "Create your account" : "Sign in to Rio"}
        </h1>
        <p className="auth-intro">
          {isRegistration
            ? "Create an account to keep your cinema experience in one place."
            : "Sign in to continue to your Rio Theaters account."}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegistration ? (
            <>
              <label htmlFor="auth-username">Username</label>
              <input
                autoComplete="username"
                id="auth-username"
                maxLength={50}
                onChange={(event) => setUsername(event.target.value)}
                required
                value={username}
              />
              <label htmlFor="auth-email">Email</label>
              <input
                autoComplete="email"
                id="auth-email"
                maxLength={255}
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </>
          ) : (
            <>
              <label htmlFor="auth-identifier">Username or email</label>
              <input
                autoComplete="username"
                id="auth-identifier"
                maxLength={255}
                onChange={(event) => setIdentifier(event.target.value)}
                required
                value={identifier}
              />
            </>
          )}

          <label htmlFor="auth-password">Password</label>
          <input
            autoComplete={isRegistration ? "new-password" : "current-password"}
            id="auth-password"
            maxLength={128}
            minLength={isRegistration ? 8 : undefined}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {verificationRequired && (
            <p className="auth-error">
              {verificationEmail.trim().includes("@") ? (
                <Link
                  to="/verify-email"
                  state={{ email: verificationEmail.trim() }}
                >
                  Request a verification email
                </Link>
              ) : (
                "Use your email address to request another verification link."
              )}
            </p>
          )}

          <button
            className="auth-submit-button"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting
              ? "Please wait…"
              : isRegistration
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <div className="auth-divider" aria-hidden="true">
          <span>or</span>
        </div>

        <a className="google-auth-button" href="/api/auth/google">
          <GoogleMark />
          <span>
            {isRegistration ? "Sign up with Google" : "Continue with Google"}
          </span>
        </a>

        <p className="auth-switch">
          {isRegistration ? "Already have an account? " : "New to Rio? "}
          <Link to={isRegistration ? "/login" : "/register"}>
            {isRegistration ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </section>
    </div>
  );
}
