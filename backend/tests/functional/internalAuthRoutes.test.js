import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { createInternalAuthRouter } from "../../routes/internalAuthRoutes.js";

const authService = {
  findOrCreateGoogleUser: jest.fn(),
  createSession: jest.fn(),
  findSession: jest.fn(),
  revokeSession: jest.fn(),
};
const app = express();
app.use(express.json());
app.use("/api/internal/auth", createInternalAuthRouter(authService));

describe("Internal auth persistence routes", () => {
  beforeEach(() => {
    for (const mock of Object.values(authService)) mock.mockReset();
  });

  test("creates an OAuth user without an internal API key and disables caching", async () => {
    const user = { id: 12, email: "user@example.test" };
    authService.findOrCreateGoogleUser.mockResolvedValueOnce(user);

    const response = await request(app)
      .post("/api/internal/auth/google-users")
      .send({ subject: "google-subject", email: "user@example.test" })
      .expect(200);

    expect(response.body).toEqual({ user });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(authService.findOrCreateGoogleUser).toHaveBeenCalledWith({
      subject: "google-subject",
      email: "user@example.test",
    });
  });

  test("continues to reject invalid persistence input", async () => {
    const response = await request(app)
      .post("/api/internal/auth/google-users")
      .send({ subject: "", email: "not-an-email" })
      .expect(400);

    expect(response.body.error).toMatch(/valid Google subject and email/i);
    expect(authService.findOrCreateGoogleUser).not.toHaveBeenCalled();
  });
});
