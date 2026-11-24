import { createHash, randomBytes } from "node:crypto";
import { createSessionReadDao } from "../dao/auth/sessionReadDao.js";
import { createSessionWriteDao } from "../dao/auth/sessionWriteDao.js";
import { createUserReadDao } from "../dao/auth/userReadDao.js";
import { createUserWriteDao } from "../dao/auth/userWriteDao.js";
import { hashPassword, verifyPassword } from "../security/passwordHasher.js";

const GOOGLE_PROVIDER = "google";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function makeUsername(subject) {
  return `google_${hash(subject).slice(0, 40)}`;
}

export function createAuthPersistenceService(pool) {
  const sessionReads = createSessionReadDao(pool);
  const sessionWrites = createSessionWriteDao(pool);

  async function createPasswordUser({ username, email, password }) {
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const reads = createUserReadDao(client);
      const writes = createUserWriteDao(client);

      if (
        (await reads.findByEmail(normalizedEmail)) ||
        (await reads.findByUsername(normalizedUsername))
      ) {
        const error = new Error("An account with that username or email already exists.");
        error.status = 409;
        throw error;
      }

      const passwordHash = await hashPassword(password);
      const user = await writes.createPasswordUser({
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
      });
      await client.query("COMMIT");
      return user;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") {
        error.status = 409;
        error.message = "An account with that username or email already exists.";
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function authenticatePasswordUser({ identifier, password }) {
    const user = await createUserReadDao(pool).findForPasswordAuthentication(
      identifier.trim(),
    );
    if (!user?.password_hash) return null;

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) return null;

    return { id: user.id, username: user.username, email: user.email };
  }

  return {
    createPasswordUser,
    authenticatePasswordUser,

    async findOrCreateGoogleUser({ subject, email }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const reads = createUserReadDao(client);
        const writes = createUserWriteDao(client);
        const linkedUser = await reads.findByProviderSubject(
          GOOGLE_PROVIDER,
          subject,
        );
        if (linkedUser) {
          await client.query("COMMIT");
          return linkedUser;
        }

        const existingUser = await reads.findByEmail(email);
        const user =
          existingUser ??
          (await writes.createOAuthUser({
            username: makeUsername(subject),
            email,
          }));
        await writes.linkOAuthAccount({
          userId: user.id,
          provider: GOOGLE_PROVIDER,
          subject,
          email,
        });
        await client.query("COMMIT");
        return user;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async createSession({ userId, previousToken }) {
      const token = randomBytes(32).toString("base64url");
      await sessionWrites.create({
        tokenHash: hash(token),
        previousTokenHash: previousToken ? hash(previousToken) : null,
        userId,
        expiresInSeconds: SESSION_MAX_AGE_SECONDS,
      });
      return { token, expiresInSeconds: SESSION_MAX_AGE_SECONDS };
    },

    findSession(token) {
      return sessionReads.findUserByTokenHash(hash(token));
    },

    revokeSession(token) {
      return sessionWrites.deleteByTokenHash(hash(token));
    },
  };
}
