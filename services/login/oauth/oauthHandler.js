import * as oidc from "openid-client";
import { createAuthPersistenceClient } from "../authPersistenceClient.js";
import {
  SESSION_COOKIE_NAME,
  authCookieOptions,
  clearSessionCookie,
  readAuthCookie,
  setSessionCookie,
} from "../authCookies.js";

const COOKIE_NAMES = {
  state: "rio_oauth_state",
  nonce: "rio_oauth_nonce",
  verifier: "rio_oauth_verifier",
};
const OAUTH_COOKIE_MAX_AGE = 5 * 60 * 1000;
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

function clearOauthCookies(res) {
  for (const name of [
    COOKIE_NAMES.state,
    COOKIE_NAMES.nonce,
    COOKIE_NAMES.verifier,
  ]) {
    res.clearCookie(name, authCookieOptions(0));
  }
}

export function createGoogleAuthHandlers() {
  const persistence = createAuthPersistenceClient();

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
          res.cookie(name, value, authCookieOptions(OAUTH_COOKIE_MAX_AGE));
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
        const state = readAuthCookie(req, COOKIE_NAMES.state);
        const nonce = readAuthCookie(req, COOKIE_NAMES.nonce);
        const verifier = readAuthCookie(req, COOKIE_NAMES.verifier);
        if (!state || !nonce || !verifier) {
          clearOauthCookies(res);
          return res.status(400).json({
            error: "Google sign-in could not be verified. Please try again.",
          });
        }
        if (req.query.state !== state) {
          clearOauthCookies(res);
          return res.status(400).json({
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
          return res.status(401).json({
            error: "Google did not provide a verified email address.",
          });
        }

        const user = await persistence.findOrCreateGoogleUser({
          subject: claims.sub,
          email: claims.email,
          displayName:
            typeof claims.name === "string" ? claims.name.trim() || null : null,
        });
        const session = await persistence.createSession(
          user.id,
          readAuthCookie(req, SESSION_COOKIE_NAME),
        );
        clearOauthCookies(res);
        setSessionCookie(res, session);
        const frontendUrl = process.env.FRONTEND_URL?.trim();
        return frontendUrl
          ? res.redirect(new URL("/", frontendUrl).href)
          : res.status(200).json({ authenticated: true });
      } catch (error) {
        clearOauthCookies(res);
        if (error.status === 409) {
          return res.status(409).json({
            error:
              "This email already has an account. Sign in with that account first.",
          });
        }
        return next(error);
      }
    },

    async me(req, res, next) {
      try {
        const token = readAuthCookie(req, SESSION_COOKIE_NAME);
        if (!token)
          return res.status(401).json({ error: "Authentication required." });
        const user = await persistence.findSession(token);
        if (!user) {
          await persistence.revokeSession(token);
          clearSessionCookie(res);
          return res.status(401).json({ error: "Authentication required." });
        }
        return res.json({ user });
      } catch (error) {
        return next(error);
      }
    },

    async logout(req, res, next) {
      try {
        const token = readAuthCookie(req, SESSION_COOKIE_NAME);
        if (token) await persistence.revokeSession(token);
        clearSessionCookie(res);
        return res.status(204).end();
      } catch (error) {
        return next(error);
      }
    },
  };
}
