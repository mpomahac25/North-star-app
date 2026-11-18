import { afterEach, describe, expect, test } from "@jest/globals";
import { decrypt, encrypt } from "../../security/encrypter.js";

const originalKey = process.env.ENCRYPTION_KEY;
const validKey = "0123456789abcdef".repeat(4);

afterEach(() => {
  if (originalKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = originalKey;
});

describe("backend encrypter", () => {
  test("round trips Unicode and empty plaintext", () => {
    process.env.ENCRYPTION_KEY = validKey;
    for (const value of ["Helsinki 🎬", ""]) {
      expect(decrypt(encrypt(value))).toBe(value);
    }
  });

  test("uses a fresh nonce for each encryption", () => {
    process.env.ENCRYPTION_KEY = validKey;
    expect(encrypt("same value")).not.toBe(encrypt("same value"));
  });

  test("rejects modified ciphertext and malformed payloads", () => {
    process.env.ENCRYPTION_KEY = validKey;
    const parts = encrypt("sensitive value").split(".");
    parts[3] = `${parts[3].slice(0, -1)}${parts[3].endsWith("A") ? "B" : "A"}`;
    expect(() => decrypt(parts.join("."))).toThrow();
    expect(() => decrypt("v2.invalid.invalid.invalid")).toThrow(
      "Ciphertext has an unsupported or invalid format.",
    );
  });

  test("requires a 32-byte hexadecimal key", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("value")).toThrow("ENCRYPTION_KEY must be 64 hexadecimal characters");
    process.env.ENCRYPTION_KEY = "short";
    expect(() => decrypt("v1.YWFhYWFhYWFhYWFh.YWFhYWFhYWFhYWFhYWFhYQ."))
      .toThrow("ENCRYPTION_KEY must be 64 hexadecimal characters");
  });
});
