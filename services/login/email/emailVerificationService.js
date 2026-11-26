import { createHash, randomBytes } from "node:crypto";
import { createAuthPersistenceClient } from "../authPersistenceClient.js";
import {
  assertEmailConfigured,
  sendVerificationEmail,
} from "./emailService.js";

const VERIFICATION_TOKEN_BYTES = 32;
const VERIFICATION_TOKEN_EXPIRES_HOURS = 24;

function hashVerificationToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function createVerificationToken() {
  const token = randomBytes(VERIFICATION_TOKEN_BYTES).toString("hex");
  return {
    token,
    tokenHash: hashVerificationToken(token),
    expiresAt: new Date(
      Date.now() + VERIFICATION_TOKEN_EXPIRES_HOURS * 60 * 60 * 1000,
    ),
  };
}

function buildVerificationUrl(token) {
  assertEmailConfigured();
  const url = new URL("/verify-email", process.env.APP_BASE_URL);
  url.searchParams.set("token", token);
  return url.href;
}

export function createEmailVerificationService(
  persistence = createAuthPersistenceClient(),
  sendEmail = sendVerificationEmail,
) {
  async function sendToUser(user, verification) {
    await sendEmail({
      to: user.email,
      username: user.username,
      verificationUrl: buildVerificationUrl(verification.token),
    });
  }

  return {
    assertConfigured() {
      assertEmailConfigured();
    },

    async sendAccountVerificationEmail(user) {
      assertEmailConfigured();
      const verification = createVerificationToken();
      const savedUser = await persistence.saveEmailVerificationToken({
        userId: user.id,
        tokenHash: verification.tokenHash,
        expiresAt: verification.expiresAt.toISOString(),
      });
      await sendToUser(savedUser, verification);
    },

    async resendAccountVerificationEmail(email) {
      assertEmailConfigured();
      const verification = createVerificationToken();
      const user = await persistence.issueEmailVerificationToken({
        email,
        tokenHash: verification.tokenHash,
        expiresAt: verification.expiresAt.toISOString(),
      });
      if (user) await sendToUser(user, verification);
    },

    async verifyEmailToken(token) {
      if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
        const error = new Error("Verification link is invalid or expired.");
        error.status = 400;
        throw error;
      }
      await persistence.verifyEmailToken(hashVerificationToken(token));
    },
  };
}
