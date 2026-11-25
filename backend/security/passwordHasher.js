import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const COST = 32768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

async function derive(password, salt) {
  return scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEMORY,
  });
}

export async function hashPassword(password) {
  if (typeof password !== "string") {
    throw new TypeError("Password must be a string.");
  }

  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await derive(password, salt);
  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password, encodedHash) {
  if (typeof password !== "string" || typeof encodedHash !== "string") {
    return false;
  }

  const [
    algorithm,
    cost,
    blockSize,
    parallelization,
    saltPart,
    keyPart,
    ...extra
  ] = encodedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    cost !== String(COST) ||
    blockSize !== String(BLOCK_SIZE) ||
    parallelization !== String(PARALLELIZATION) ||
    !saltPart ||
    !keyPart ||
    extra.length ||
    !/^[A-Za-z0-9_-]+$/.test(saltPart) ||
    !/^[A-Za-z0-9_-]+$/.test(keyPart)
  ) {
    return false;
  }

  const salt = Buffer.from(saltPart, "base64url");
  const expectedKey = Buffer.from(keyPart, "base64url");
  if (salt.length !== SALT_LENGTH || expectedKey.length !== KEY_LENGTH) {
    return false;
  }

  const actualKey = await derive(password, salt);
  return timingSafeEqual(actualKey, expectedKey);
}
