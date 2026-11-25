import {
  afterAll,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import request from "supertest";

const oidcMocks = {
  discovery: jest.fn(),
  randomState: jest.fn(),
  randomNonce: jest.fn(),
  randomPKCECodeVerifier: jest.fn(),
  calculatePKCECodeChallenge: jest.fn(),
  buildAuthorizationUrl: jest.fn(),
  authorizationCodeGrant: jest.fn(),
};
const persistenceMocks = {
  findOrCreateGoogleUser: jest.fn(),
  createSession: jest.fn(),
  findSession: jest.fn(),
  revokeSession: jest.fn(),
};

const envNames = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "FRONTEND_URL",
  "BACKEND_URL",
];
const originalEnv = Object.fromEntries(
  envNames.map((name) => [name, process.env[name]]),
);
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_REDIRECT_URI =
  "http://localhost:3001/api/auth/google/callback";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.BACKEND_URL = "http://localhost:3001";

jest.unstable_mockModule("openid-client", () => oidcMocks);
jest.unstable_mockModule("../../authPersistenceClient.js", () => ({
  createAuthPersistenceClient: () => persistenceMocks,
}));

const { default: app } = await import("../../app.js");

describe("Google OAuth HTTP flow", () => {
  beforeEach(() => {
    for (const mock of Object.values(oidcMocks)) mock.mockReset();
    for (const mock of Object.values(persistenceMocks)) mock.mockReset();
    oidcMocks.discovery.mockResolvedValue({
      issuer: "https://accounts.google.com",
    });
    oidcMocks.randomState.mockReturnValue("state-123");
    oidcMocks.randomNonce.mockReturnValue("nonce-123");
    oidcMocks.randomPKCECodeVerifier.mockReturnValue("verifier-123");
    oidcMocks.calculatePKCECodeChallenge.mockResolvedValue("challenge-123");
    oidcMocks.buildAuthorizationUrl.mockReturnValue(
      new URL("https://accounts.google.com/o/oauth2/v2/auth"),
    );
  });

  test("starts authorization with state, nonce and S256 PKCE cookies", async () => {
    const response = await request(app).get("/api/auth/google").expect(302);
    expect(oidcMocks.buildAuthorizationUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        state: "state-123",
        nonce: "nonce-123",
        code_challenge: "challenge-123",
        code_challenge_method: "S256",
        scope: "openid email profile",
      }),
    );
    const cookies = response.headers["set-cookie"];
    expect(cookies).toHaveLength(3);
    expect(cookies.join(" ")).toContain("HttpOnly");
    expect(cookies.join(" ")).toContain("SameSite=Lax");
  });

  test("rejects a callback with missing state cookies without contacting Google", async () => {
    const response = await request(app)
      .get("/api/auth/google/callback?code=code&state=state-123")
      .expect(400);
    expect(response.body.error).toMatch(/could not be verified/i);
    expect(oidcMocks.authorizationCodeGrant).not.toHaveBeenCalled();
  });

  test("rejects a mismatched state before exchanging the authorization code", async () => {
    const agent = request.agent(app);
    await agent.get("/api/auth/google").expect(302);
    await agent
      .get("/api/auth/google/callback?code=code&state=attacker-state")
      .expect(400);
    expect(oidcMocks.authorizationCodeGrant).not.toHaveBeenCalled();
  });

  test("persists a verified Google identity, establishes a session and redirects to the frontend", async () => {
    const agent = request.agent(app);
    await agent.get("/api/auth/google").expect(302);
    oidcMocks.authorizationCodeGrant.mockResolvedValue({
      claims: () => ({
        sub: "google-subject",
        email: "user@example.test",
        email_verified: true,
      }),
    });
    persistenceMocks.findOrCreateGoogleUser.mockResolvedValue({
      id: 42,
      email: "user@example.test",
    });
    persistenceMocks.createSession.mockResolvedValue({
      sessionToken: "opaque-session",
      expiresInSeconds: 3600,
    });

    const response = await agent
      .get("/api/auth/google/callback?code=auth-code&state=state-123")
      .expect(302);
    expect(response.headers.location).toBe("http://localhost:3000/");
    expect(oidcMocks.authorizationCodeGrant).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(URL),
      expect.objectContaining({
        expectedState: "state-123",
        expectedNonce: "nonce-123",
        pkceCodeVerifier: "verifier-123",
      }),
    );
    expect(persistenceMocks.findOrCreateGoogleUser).toHaveBeenCalledWith({
      subject: "google-subject",
      email: "user@example.test",
    });
    expect(persistenceMocks.createSession).toHaveBeenCalledWith(42, undefined);
    expect(response.headers["set-cookie"].join(" ")).toContain(
      "rio_session=opaque-session",
    );
  });

  test("does not persist an identity when Google has not verified its email", async () => {
    const agent = request.agent(app);
    await agent.get("/api/auth/google").expect(302);
    oidcMocks.authorizationCodeGrant.mockResolvedValue({
      claims: () => ({
        sub: "google-subject",
        email: "user@example.test",
        email_verified: false,
      }),
    });
    const response = await agent
      .get("/api/auth/google/callback?code=auth-code&state=state-123")
      .expect(401);
    expect(response.body.error).toMatch(/verified email/i);
    expect(persistenceMocks.findOrCreateGoogleUser).not.toHaveBeenCalled();
  });

  test("requires a same-origin request to log out and revokes the session", async () => {
    await request(app).post("/api/auth/logout").expect(403);
    persistenceMocks.revokeSession.mockResolvedValue(null);
    const response = await request(app)
      .post("/api/auth/logout")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", "rio_session=opaque-session")
      .expect(204);
    expect(persistenceMocks.revokeSession).toHaveBeenCalledWith(
      "opaque-session",
    );
    expect(response.headers["set-cookie"].join(" ")).toContain("rio_session=");
  });
});

afterAll(() => {
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});
