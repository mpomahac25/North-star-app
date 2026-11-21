import express from "express";
import request from "supertest";
import { describe, expect, test } from "@jest/globals";
import { createApp } from "../../app.js";

describe("Frontend authentication proxy", () => {
  let loginServer;
  let app;

  beforeAll(async () => {
    const login = express();
    login.get("/api/auth/google", (req, res) => {
      res.cookie("rio_oauth_state", "state-value", {
        httpOnly: true,
        sameSite: "Lax",
        path: "/api/auth",
      });
      res.redirect("https://accounts.google.com/o/oauth2/v2/auth");
    });
    login.get("/api/auth/me", (req, res) => {
      res.json({
        authenticated: req.get("cookie") === "rio_session=session-value",
      });
    });

    await new Promise((resolve) => {
      loginServer = login.listen(0, "127.0.0.1", resolve);
    });
    app = createApp(
      "http://127.0.0.1:1",
      `http://127.0.0.1:${loginServer.address().port}`,
    );
  });

  afterAll(async () => {
    if (!loginServer) return;
    await new Promise((resolve, reject) => {
      loginServer.close((error) => (error ? reject(error) : resolve()));
    });
  });

  test("forwards Google sign-in redirects and OAuth cookies", async () => {
    const response = await request(app).get("/api/auth/google").expect(302);

    expect(response.headers.location).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(response.headers["set-cookie"][0]).toContain(
      "rio_oauth_state=state-value",
    );
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
  });

  test("forwards the browser session cookie when checking sign-in status", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", "rio_session=session-value")
      .expect(200);

    expect(response.body).toEqual({ authenticated: true });
  });
});
