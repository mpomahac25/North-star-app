import { createHash, randomBytes } from "node:crypto";
import { createSessionReadDao } from "../dao/auth/sessionReadDao.js";
import { createSessionWriteDao } from "../dao/auth/sessionWriteDao.js";
import { createUserReadDao } from "../dao/auth/userReadDao.js";
import { createUserWriteDao } from "../dao/auth/userWriteDao.js";

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

  return {
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
