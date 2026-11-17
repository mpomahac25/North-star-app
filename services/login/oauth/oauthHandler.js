import { createHash, randomBytes } from "node:crypto";
import * as oidc from "openid-client";

const COOKIE_NAMES = {
  state: "rio_oauth_state",
  nonce: "rio_oauth_nonce",
  verifier: "rio_oauth_verifier",
  session: "rio_session",
};
const OAUTH_COOKIE_MAX_AGE = 5 * 60 * 1000;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
let configurationPromise;

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Google sign-in.`);
  return value;
}

function getOidcConfiguration() {
  configurationPromise ??= oidc.discovery(
    new URL("https://accounts.google.com"),
    requiredEnvironment("GOOGLE_CLIENT_ID"),
    requiredEnvironment("GOOGLE_CLIENT_SECRET"),
  );
  return configurationPromise;
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    sameSite: "Lax",
    path: "/api/auth",
    maxAge,
  };
}

function getCookie(req, name) {
  const item = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!item) return undefined;
  try {
    return decodeURIComponent(item.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

function clearOauthCookies(res) {
  for (const name of [
    COOKIE_NAMES.state,
    COOKIE_NAMES.nonce,
    COOKIE_NAMES.verifier,
  ]) {
    res.clearCookie(name, cookieOptions(0));
  }
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function createUserRepository(pool) {
  return {
    async findOrCreateGoogleUser({ subject, email }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const linked = await client.query(
          `SELECT u.id, u.username, u.email
                     FROM oauth_accounts a JOIN users u ON u.id = a.user_id
                     WHERE a.provider = 'google' AND a.provider_subject = $1`,
          [subject],
        );
        if (linked.rowCount) {
          await client.query("COMMIT");
          return linked.rows[0];
        }

        let user = await client.query(
          "SELECT id, username, email FROM users WHERE lower(email) = lower($1) FOR UPDATE",
          [email],
        );
        if (!user.rowCount) {
          const username = `google_${hash(subject).slice(0, 40)}`;
          user = await client.query(
            `INSERT INTO users (username, email, password_hash)
                         VALUES ($1, $2, NULL) RETURNING id, username, email`,
            [username, email],
          );
        }

        await client.query(
          `INSERT INTO oauth_accounts (user_id, provider, provider_subject, email)
                     VALUES ($1, 'google', $2, $3)`,
          [user.rows[0].id, subject, email],
        );
        await client.query("COMMIT");
        return user.rows[0];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async createSession(userId) {
      const token = randomBytes(32).toString("base64url");
      await pool.query("DELETE FROM auth_sessions WHERE expires_at <= NOW()");
      await pool.query(
        `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
                 VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 second'))`,
        [hash(token), userId, SESSION_MAX_AGE_SECONDS],
      );
      return token;
    },

    async findSession(token) {
      const result = await pool.query(
        `SELECT u.id, u.username, u.email
                 FROM auth_sessions s JOIN users u ON u.id = s.user_id
                 WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
        [hash(token)],
      );
      return result.rows[0] ?? null;
    },

    async deleteSession(token) {
      await pool.query("DELETE FROM auth_sessions WHERE token_hash = $1", [
        hash(token),
      ]);
    },
  };
}

export function createGoogleAuthHandlers(pool) {
  const users = createUserRepository(pool);

  return {
    async start(req, res, next) {
      try {
        const config = await getOidcConfiguration();
        const state = oidc.randomState();
        const nonce = oidc.randomNonce();
        const verifier = oidc.randomPKCECodeVerifier();
        const challenge = await oidc.calculatePKCECodeChallenge(verifier);
        for (const [name, value] of [
          [COOKIE_NAMES.state, state],
          [COOKIE_NAMES.nonce, nonce],
          [COOKIE_NAMES.verifier, verifier],
        ]) {
          res.cookie(name, value, cookieOptions(OAUTH_COOKIE_MAX_AGE));
        }

        const url = oidc.buildAuthorizationUrl(config, {
          redirect_uri: requiredEnvironment("GOOGLE_REDIRECT_URI"),
          scope: "openid email profile",
          state,
          nonce,
          code_challenge: challenge,
          code_challenge_method: "S256",
        });
        return res.redirect(url.href);
      } catch (error) {
        return next(error);
      }
    },

    async callback(req, res, next) {
      try {
        const state = getCookie(req, COOKIE_NAMES.state);
        const nonce = getCookie(req, COOKIE_NAMES.nonce);
        const verifier = getCookie(req, COOKIE_NAMES.verifier);
        if (!state || !nonce || !verifier) {
          clearOauthCookies(res);
          return res
            .status(400)
            .json({
              error: "Google sign-in could not be verified. Please try again.",
            });
        }
        if (req.query.state !== state) {
          clearOauthCookies(res);
          return res
            .status(400)
            .json({
              error: "Google sign-in could not be verified. Please try again.",
            });
        }
        if (req.query.error) {
          clearOauthCookies(res);
          return res
            .status(401)
            .json({ error: "Google sign-in was cancelled or denied." });
        }

        const config = await getOidcConfiguration();
        const callbackUrl = new URL(
          req.originalUrl,
          requiredEnvironment("GOOGLE_REDIRECT_URI"),
        );
        const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
          expectedState: state,
          expectedNonce: nonce,
          pkceCodeVerifier: verifier,
        });
        const claims = tokens.claims();
        if (!claims?.sub || !claims.email || claims.email_verified !== true) {
          clearOauthCookies(res);
          return res
            .status(401)
            .json({
              error: "Google did not provide a verified email address.",
            });
        }

        const user = await users.findOrCreateGoogleUser({
          subject: claims.sub,
          email: claims.email,
        });
        const token = await users.createSession(user.id);
        clearOauthCookies(res);
        res.cookie(
          COOKIE_NAMES.session,
          token,
          cookieOptions(SESSION_MAX_AGE_SECONDS * 1000),
        );
        const frontendUrl = process.env.FRONTEND_URL?.trim();
        return frontendUrl
          ? res.redirect(new URL("/", frontendUrl).href)
          : res.status(200).json({ authenticated: true });
      } catch (error) {
        clearOauthCookies(res);
        return next(error);
      }
    },

    async me(req, res, next) {
      try {
        const token = getCookie(req, COOKIE_NAMES.session);
        if (!token)
          return res.status(401).json({ error: "Authentication required." });
        const user = await users.findSession(token);
        if (!user)
          return res.status(401).json({ error: "Authentication required." });
        return res.json({ user });
      } catch (error) {
        return next(error);
      }
    },

    async logout(req, res, next) {
      try {
        const token = getCookie(req, COOKIE_NAMES.session);
        if (token) await users.deleteSession(token);
        res.clearCookie(COOKIE_NAMES.session, cookieOptions(0));
        return res.status(204).end();
      } catch (error) {
        return next(error);
      }
    },
  };
}
