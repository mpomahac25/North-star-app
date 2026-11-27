import { createHash } from "node:crypto";
import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { createEmailVerificationService } from "../../email/emailVerificationService.js";

const emailEnvironment = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
  "GMAIL_SENDER_EMAIL",
  "APP_BASE_URL",
];
const previousEnvironment = new Map(
  emailEnvironment.map((key) => [key, process.env[key]]),
);

function configureEmail() {
  delete process.env.GMAIL_CLIENT_ID;
  delete process.env.GMAIL_CLIENT_SECRET;
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GMAIL_REFRESH_TOKEN = "test-refresh-token";
  process.env.GMAIL_SENDER_EMAIL = "rio@example.test";
  process.env.APP_BASE_URL = "http://localhost:3000/";
}

afterEach(() => {
  for (const [key, value] of previousEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("email verification service", () => {
  test("stores only a token hash and sends a 24-hour verification link", async () => {
    configureEmail();
    const user = {
      id: 17,
      username: "viewer",
      email: "viewer@example.test",
    };
    const persistence = {
      saveEmailVerificationToken: jest.fn().mockResolvedValue(user),
    };
    const sendEmail = jest.fn().mockResolvedValue(undefined);
    const service = createEmailVerificationService(persistence, sendEmail);
    const startedAt = Date.now();

    await service.sendAccountVerificationEmail(user);

    const [{ verificationUrl }] = sendEmail.mock.calls[0];
    const url = new URL(verificationUrl);
    const token = url.searchParams.get("token");
    const [{ tokenHash, expiresAt }] =
      persistence.saveEmailVerificationToken.mock.calls[0];
    expect(url.origin).toBe("http://localhost:3000");
    expect(url.pathname).toBe("/verify-email");
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(tokenHash).not.toBe(token);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(startedAt);
    expect(new Date(expiresAt).getTime()).toBeLessThanOrEqual(
      startedAt + 24 * 60 * 60 * 1000 + 1000,
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        username: user.username,
      }),
    );
  });

  test("hashes the supplied token before consuming it", async () => {
    const persistence = {
      verifyEmailToken: jest.fn().mockResolvedValue(undefined),
    };
    const service = createEmailVerificationService(persistence, jest.fn());
    const token = "b".repeat(64);

    await service.verifyEmailToken(token);

    expect(persistence.verifyEmailToken).toHaveBeenCalledWith(
      createHash("sha256").update(token).digest("hex"),
    );
  });

  test("rejects malformed verification tokens without contacting persistence", async () => {
    const persistence = { verifyEmailToken: jest.fn() };
    const service = createEmailVerificationService(persistence, jest.fn());

    await expect(service.verifyEmailToken("not-a-token")).rejects.toMatchObject(
      {
        status: 400,
      },
    );
    expect(persistence.verifyEmailToken).not.toHaveBeenCalled();
  });
});
