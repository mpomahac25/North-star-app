/* This file will handle the following:
 *  - create and configure express instance
 *  - register and configure middleware and API routes
 *  - configure request validation
 *  - export express app
 */

import express from "express";
import pg from "pg";
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

const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "rio_theaters",
  user: process.env.DB_USER || "rio",
  password: process.env.DB_PASSWORD,
});
const googleAuth = createGoogleAuthHandlers(pool);

app.get("/api/auth/google", googleAuth.start);
app.get("/api/auth/google/callback", googleAuth.callback);
app.get("/api/auth/me", googleAuth.me);
app.post("/api/auth/logout", googleAuth.logout);

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error("Login service request failed.");
  return res.status(500).json({ error: "Authentication request failed." });
});

export default app;
