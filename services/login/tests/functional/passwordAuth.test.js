import express from "express";
import { describe, expect, jest, test } from "@jest/globals";
import request from "supertest";
import { createPasswordAuthHandlers } from "../../passwordAuthHandlers.js";

describe("Password authentication", () => {
  function createApp(persistence, emailVerification) {
    const app = express();
    app.use(express.json());
    const handlers = createPasswordAuthHandlers(persistence, emailVerification);
    app.post("/api/auth/register", handlers.register);
    app.post("/api/auth/login", handlers.login);
    app.post("/api/auth/verify-email", handlers.verifyEmail);
    app.post("/api/auth/resend-verification", handlers.resendVerification);
    return app;
  }

  test("returns 401 for invalid credentials without creating a session", async () => {
    const persistence = {
      authenticatePasswordUser: jest.fn().mockResolvedValue(null),
      createSession: jest.fn(),
    };
    const emailVerification = {};
    const app = createApp(persistence, emailVerification);

    const response = await request(app)
      .post("/api/auth/login")
      .send({ identifier: "viewer@example.test", password: "wrong-password" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Invalid username/email or password.",
    });
    expect(persistence.createSession).not.toHaveBeenCalled();
  });

  test("registers a pending account and sends verification without creating a session", async () => {
    const user = { id: 21, username: "viewer", email: "viewer@example.test" };
    const persistence = {
      createPasswordUser: jest.fn().mockResolvedValue(user),
      createSession: jest.fn(),
    };
    const emailVerification = {
      assertConfigured: jest.fn(),
      sendAccountVerificationEmail: jest.fn(),
    };
    const app = createApp(persistence, emailVerification);

    const response = await request(app)
      .post("/api/auth/register")
      .send({
        username: user.username,
        email: user.email,
        password: "RioTestPassword!123",
      })
      .expect(202);

    expect(response.body.message).toMatch(/check your email/i);
    expect(emailVerification.assertConfigured).toHaveBeenCalled();
    expect(emailVerification.sendAccountVerificationEmail).toHaveBeenCalledWith(
      user,
    );
    expect(persistence.createSession).not.toHaveBeenCalled();
  });

  test("does not create a session for a password account with unverified email", async () => {
    const persistence = {
      authenticatePasswordUser: jest.fn().mockResolvedValue({
        id: 22,
        username: "viewer",
        email: "viewer@example.test",
        emailVerified: false,
      }),
      createSession: jest.fn(),
    };
    const app = createApp(persistence, {});

    const response = await request(app)
      .post("/api/auth/login")
      .send({ identifier: "viewer", password: "RioTestPassword!123" })
      .expect(403);

    expect(response.body.code).toBe("EMAIL_VERIFICATION_REQUIRED");
    expect(persistence.createSession).not.toHaveBeenCalled();
  });

  test("creates a session for a verified password account", async () => {
    const user = {
      id: 23,
      username: "viewer",
      email: "viewer@example.test",
      emailVerified: true,
      isAdmin: false,
    };
    const persistence = {
      authenticatePasswordUser: jest.fn().mockResolvedValue(user),
      createSession: jest.fn().mockResolvedValue({
        sessionToken: "opaque-session-token",
        expiresInSeconds: 3600,
      }),
    };
    const app = createApp(persistence, {});

    const response = await request(app)
      .post("/api/auth/login")
      .send({ identifier: "viewer", password: "RioTestPassword!123" })
      .expect(200);

    expect(response.body.user).toEqual(user);
    expect(persistence.createSession).toHaveBeenCalledWith(user.id, undefined);
    expect(response.headers["set-cookie"].join(" ")).toContain(
      "rio_session=opaque-session-token",
    );
  });

  test("verifies the supplied email token", async () => {
    const emailVerification = {
      verifyEmailToken: jest.fn().mockResolvedValue(undefined),
    };
    const app = createApp({}, emailVerification);

    await request(app)
      .post("/api/auth/verify-email")
      .send({ token: "a".repeat(64) })
      .expect(204);

    expect(emailVerification.verifyEmailToken).toHaveBeenCalledWith(
      "a".repeat(64),
    );
  });

  test("returns a generic resend response", async () => {
    const emailVerification = {
      resendAccountVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };
    const app = createApp({}, emailVerification);

    const response = await request(app)
      .post("/api/auth/resend-verification")
      .send({ email: "viewer@example.test" })
      .expect(202);

    expect(response.body.message).toMatch(/if the address belongs/i);
  });
});
