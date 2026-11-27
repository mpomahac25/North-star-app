import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey() {
  const value = process.env.ENCRYPTION_KEY?.trim();
  if (!value || !/^[\da-fA-F]{64}$/.test(value)) {
    throw new Error(
      "ENCRYPTION_KEY must be 64 hexadecimal characters (32 bytes).",
    );
  }
  return Buffer.from(value, "hex");
}

export function encrypt(plaintext) {
  if (typeof plaintext !== "string") {
    throw new TypeError("Plaintext must be a string.");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decrypt(payload) {
  if (typeof payload !== "string") {
    throw new TypeError("Ciphertext must be a string.");
  }
  const [version, ivPart, tagPart, ciphertextPart, ...extra] =
    payload.split(".");
  if (
    version !== "v1" ||
    !ivPart ||
    !tagPart ||
    ciphertextPart === undefined ||
    extra.length ||
    !/^[A-Za-z0-9_-]+$/.test(ivPart) ||
    !/^[A-Za-z0-9_-]+$/.test(tagPart) ||
    (ciphertextPart && !/^[A-Za-z0-9_-]+$/.test(ciphertextPart))
  ) {
    throw new Error("Ciphertext has an unsupported or invalid format.");
  }

  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const ciphertext = Buffer.from(ciphertextPart, "base64url");
  if (iv.length !== IV_LENGTH || tag.length !== 16) {
    throw new Error("Ciphertext has an invalid IV or authentication tag.");
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
