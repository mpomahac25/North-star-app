import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { createAuthServiceProxy } from "../../routes/authServiceProxy.js";

describe("Backend auth service proxy", () => {
  let loginServer;
  let app;

  beforeAll(async () => {
    const login = express();
    login.use(express.json());

    login.get("/api/auth/google/callback", (req, res) => {
      res.cookie("rio_session", "session-value", {
        httpOnly: true,
        sameSite: "Lax",
        path: "/api/auth",
      });
      res.redirect("/");
    });

    login.post("/api/auth/login", (req, res) => {
      res.json({
        body: req.body,
        cookie: req.get("cookie"),
        origin: req.get("origin"),
      });
    });

    await new Promise((resolve) => {
      loginServer = login.listen(0, "127.0.0.1", resolve);
    });

    app = express();
    app.use(
      "/api/auth",
      createAuthServiceProxy(`http://127.0.0.1:${loginServer.address().port}`),
    );
  });

  afterAll(async () => {
    if (!loginServer) return;
    await new Promise((resolve, reject) => {
      loginServer.close((error) => (error ? reject(error) : resolve()));
    });
  });

  test("forwards OAuth redirects and session cookies", async () => {
    const response = await request(app)
      .get("/api/auth/google/callback")
      .expect(302);

    expect(response.headers.location).toBe("/");
    expect(response.headers["set-cookie"][0]).toContain(
      "rio_session=session-value",
    );
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
  });

  test("forwards request body, cookie, and origin to login service", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Cookie", "rio_oauth_state=state-value")
      .set("Origin", "http://localhost:3000")
      .send({ identifier: "user@example.test", password: "secret-pass" })
      .expect(200);

    expect(response.body).toEqual({
      body: { identifier: "user@example.test", password: "secret-pass" },
      cookie: "rio_oauth_state=state-value",
      origin: "http://localhost:3000",
    });
  });
});
