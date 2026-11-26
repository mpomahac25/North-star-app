import { createAuthPersistenceClient } from "./authPersistenceClient.js";
import {
  SESSION_COOKIE_NAME,
  readAuthCookie,
  setSessionCookie,
} from "./authCookies.js";
import { createEmailVerificationService } from "./email/emailVerificationService.js";

function validCredentials(identifier, password) {
  return (
    typeof identifier === "string" &&
    identifier.trim().length > 0 &&
    identifier.length <= 255 &&
    typeof password === "string" &&
    password.length > 0 &&
    password.length <= 128
  );
}

function validRegistration({ username, email, password }) {
  return (
    typeof username === "string" &&
    username.trim().length > 0 &&
    username.trim().length <= 50 &&
    typeof email === "string" &&
    email.trim().length <= 255 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    typeof password === "string" &&
    password.length >= 8 &&
    password.length <= 128
  );
}

export function createPasswordAuthHandlers(
  persistence = createAuthPersistenceClient(),
  emailVerification = createEmailVerificationService(persistence),
) {
  return {
    async register(req, res, next) {
      const { username, email, password } = req.body ?? {};
      if (!validRegistration({ username, email, password })) {
        return res.status(400).json({
          error:
            "Username, valid email, and a password of 8 to 128 characters are required.",
        });
      }

      try {
        emailVerification.assertConfigured();
        const user = await persistence.createPasswordUser({
          username: username.trim(),
          email: email.trim(),
          password,
        });
        await emailVerification.sendAccountVerificationEmail(user);
        return res.status(202).json({
          message: "Check your email for a link to verify your account.",
        });
      } catch (error) {
        if (error.status === 409) {
          return res.status(409).json({
            error: "An account with that username or email already exists.",
          });
        }
        return next(error);
      }
    },

    async login(req, res, next) {
      const { identifier, password } = req.body ?? {};
      if (!validCredentials(identifier, password)) {
        return res.status(400).json({
          error: "A username or email and password are required.",
        });
      }

      try {
        const user = await persistence.authenticatePasswordUser({
          identifier: identifier.trim(),
          password,
        });
        if (!user) {
          return res.status(401).json({
            error: "Invalid username/email or password.",
          });
        }
        if (!user.emailVerified) {
          return res.status(403).json({
            code: "EMAIL_VERIFICATION_REQUIRED",
            error: "Verify your email address before signing in.",
          });
        }
        const session = await persistence.createSession(
          user.id,
          readAuthCookie(req, SESSION_COOKIE_NAME),
        );
        setSessionCookie(res, session);
        return res.json({ user });
      } catch (error) {
        if (error.status === 401) {
          return res.status(401).json({
            error: "Invalid username/email or password.",
          });
        }
        return next(error);
      }
    },

    async verifyEmail(req, res, next) {
      const { token } = req.body ?? {};
      if (typeof token !== "string" || token.length > 128) {
        return res.status(400).json({
          error: "Verification link is invalid or expired.",
        });
      }

      try {
        await emailVerification.verifyEmailToken(token);
        return res.status(204).end();
      } catch (error) {
        if (error.status === 400) {
          return res.status(400).json({ error: error.message });
        }
        return next(error);
      }
    },

    async resendVerification(req, res, next) {
      const { email } = req.body ?? {};
      if (
        typeof email !== "string" ||
        email.trim().length > 255 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ) {
        return res.status(400).json({ error: "A valid email is required." });
      }

      try {
        await emailVerification.resendAccountVerificationEmail(email.trim());
        return res.status(202).json({
          message:
            "If the address belongs to an unverified account, a verification email will be sent.",
        });
      } catch (error) {
        return next(error);
      }
    },
  };
}
