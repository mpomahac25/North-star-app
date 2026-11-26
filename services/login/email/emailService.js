import { randomUUID } from "node:crypto";
import { google } from "googleapis";

const REQUIRED_ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
  "GMAIL_SENDER_EMAIL",
  "APP_BASE_URL",
];

export class EmailConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "EmailConfigurationError";
    this.status = 503;
    this.publicCode = "EMAIL_NOT_CONFIGURED";
    this.publicMessage = message;
  }
}

export class VerificationEmailDeliveryError extends Error {
  constructor() {
    super("Verification email could not be sent.");
    this.name = "VerificationEmailDeliveryError";
    this.status = 503;
    this.publicCode = "VERIFICATION_EMAIL_FAILED";
    this.publicMessage =
      "Your account is pending verification, but the email could not be sent. Please try requesting another link shortly.";
  }
}

export function assertEmailConfigured() {
  const missingKeys = REQUIRED_ENV_KEYS.filter(
    (key) => !process.env[key]?.trim(),
  );
  if (missingKeys.length > 0) {
    throw new EmailConfigurationError(
      `Email service is not configured. Missing: ${missingKeys.join(", ")}`,
    );
  }

  let baseUrl;
  try {
    baseUrl = new URL(process.env.APP_BASE_URL);
  } catch {
    throw new EmailConfigurationError("APP_BASE_URL must be a valid URL.");
  }
  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new EmailConfigurationError("APP_BASE_URL must use HTTP or HTTPS.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.GMAIL_SENDER_EMAIL)) {
    throw new EmailConfigurationError("GMAIL_SENDER_EMAIL must be valid.");
  }
}

function createGmailClient() {
  assertEmailConfigured();
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI ||
      "https://developers.google.com/oauthplayground",
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

function encodeBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createRawEmail({ to, fromName, fromEmail, subject, text, html }) {
  const boundary = `rio_${randomUUID()}`;
  const message = [
    `To: ${to}`,
    `From: ${fromName} <${fromEmail}>`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
  ].join("\r\n");
  return encodeBase64Url(message);
}

export async function sendVerificationEmail({ to, username, verificationUrl }) {
  const greetingName = username || "there";
  const safeGreetingName = escapeHtml(greetingName);
  const safeVerificationUrl = escapeHtml(verificationUrl);
  const text = [
    `Hi ${greetingName},`,
    "",
    "Thanks for creating a Rio Theaters account.",
    "Verify your email address by opening this link:",
    "",
    verificationUrl,
    "",
    "This link expires in 24 hours.",
    "",
    "If you did not create this account, you can ignore this email.",
  ].join("\n");
  const html = [
    `<p>Hi ${safeGreetingName},</p>`,
    "<p>Thanks for creating a Rio Theaters account.</p>",
    "<p>Verify your email address by clicking the link below:</p>",
    `<p><a href="${safeVerificationUrl}">Verify email address</a></p>`,
    "<p>This link expires in 24 hours.</p>",
    "<p>If you did not create this account, you can ignore this email.</p>",
  ].join("");

  try {
    const gmail = createGmailClient();
    const fromName =
      (process.env.GMAIL_SENDER_NAME?.trim() || "Rio Theaters")
        .replace(/[\r\n"\\]/g, " ")
        .trim() || "Rio Theaters";
    const raw = createRawEmail({
      to,
      fromName: `"${fromName}"`,
      fromEmail: process.env.GMAIL_SENDER_EMAIL,
      subject: "Verify your Rio Theaters account",
      text,
      html,
    });
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
  } catch (error) {
    if (error instanceof EmailConfigurationError) throw error;
    const status = error?.response?.status;
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error(
      Number.isInteger(status)
        ? `Gmail verification email failed with HTTP ${status}.`
        : `Gmail verification email failed (${errorName}).`,
    );
    throw new VerificationEmailDeliveryError();
  }
}
