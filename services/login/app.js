/* This file will handle the following:
 *  - create and configure express instance
 *  - register and configure middleware and API routes
 *  - configure request validation
 *  - export express app
 */

import express from "express";
import { createGoogleAuthHandlers } from "./oauth/oauthHandler.js";

const app = express();
const SERVICE_IDENTIFIER = "login";

app.use(express.json());

app.get("/api/live", (req, res) => {
  res.json({
    status: "alive",
    service: SERVICE_IDENTIFIER,
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: SERVICE_IDENTIFIER,
  });
});

const googleAuth = createGoogleAuthHandlers();

function isSameOriginRequest(req) {
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  if (!frontendUrl) return false;

  try {
    const expectedOrigin = new URL(frontendUrl).origin;
    const requestOrigin =
      req.get("origin") ||
      (req.get("referer") ? new URL(req.get("referer")).origin : null);
    return requestOrigin === expectedOrigin;
  } catch {
    return false;
  }
}

app.get("/api/auth/google", googleAuth.start);
app.get("/api/auth/google/callback", googleAuth.callback);
app.get("/api/auth/me", googleAuth.me);
app.post(
  "/api/auth/logout",
  (req, res, next) => {
    if (!isSameOriginRequest(req)) {
      return res
        .status(403)
        .json({ error: "Request origin could not be verified." });
    }
    return next();
  },
  googleAuth.logout,
);

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error("Login service request failed.");
  return res.status(500).json({ error: "Authentication request failed." });
});

export default app;
