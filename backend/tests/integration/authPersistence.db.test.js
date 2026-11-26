import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { createAuthPersistenceService } from "../../services/authPersistenceService.js";

const { Pool } = pg;
const databaseUrl = process.env.DB_TEST_URL;
if (!databaseUrl) {
  throw new Error(
    "DB_TEST_URL is required to run PostgreSQL integration tests.",
  );
}

const schemaName = `auth_test_${randomUUID().replaceAll("-", "")}`;
const adminPool = new Pool({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5000,
});
const databasePool = new Pool({
  connectionString: databaseUrl,
  options: `-c search_path=${schemaName}`,
  connectionTimeoutMillis: 5000,
});
let schemaCreated = false;

describe("Auth persistence with PostgreSQL", () => {
  beforeAll(async () => {
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    schemaCreated = true;
    const migrationsPath = fileURLToPath(
      new URL("../../../db/migrations/", import.meta.url),
    );
    const files = (await readdir(migrationsPath))
      .filter((file) => /^V\d+__.*\.sql$/.test(file))
      .sort();
    const client = await databasePool.connect();
    try {
      for (const file of files) {
        await client.query(
          await readFile(path.join(migrationsPath, file), "utf8"),
        );
      }
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    try {
      await databasePool.end();
    } finally {
      try {
        if (schemaCreated)
          await adminPool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      } finally {
        await adminPool.end();
      }
    }
  });

  test("creates a Google user and reuses the same provider identity", async () => {
    const service = createAuthPersistenceService(databasePool);
    const suffix = randomUUID();
    const first = await service.findOrCreateGoogleUser({
      subject: `subject-${suffix}`,
      email: `${suffix}@example.test`,
      displayName: "First Display Name",
    });
    const reused = await service.findOrCreateGoogleUser({
      subject: `subject-${suffix}`,
      email: `${suffix}@example.test`,
      displayName: "Updated Display Name",
    });
    expect(reused.id).toBe(first.id);
    expect(reused.displayName).toBe("Updated Display Name");
    expect(reused.emailVerified).toBe(true);
    expect(reused.isAdmin).toBe(false);

    const count = await databasePool.query(
      "SELECT COUNT(*)::int AS count FROM users WHERE lower(email) = lower($1)",
      [`${suffix}@example.test`],
    );
    expect(count.rows[0].count).toBe(1);
  });

  test("does not link Google to an existing password account with the same email", async () => {
    const service = createAuthPersistenceService(databasePool);
    const suffix = randomUUID();
    const email = `${suffix}@example.test`;
    const passwordUser = await service.createPasswordUser({
      username: `password_${suffix}`,
      email,
      password: "RioTestPassword!123",
    });

    await expect(
      service.findOrCreateGoogleUser({
        subject: `google-subject-${suffix}`,
        email,
      }),
    ).rejects.toMatchObject({ status: 409 });

    const result = await databasePool.query(
      `SELECT u.id, u.password_hash IS NOT NULL AS has_password,
              COUNT(a.id)::int AS linked_accounts
       FROM users u
       LEFT JOIN oauth_accounts a ON a.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id, u.password_hash`,
      [passwordUser.id],
    );

    expect(result.rows).toEqual([
      {
        id: passwordUser.id,
        has_password: true,
        linked_accounts: 0,
      },
    ]);
  });

  test("stores only a verification token hash and consumes it once", async () => {
    const service = createAuthPersistenceService(databasePool);
    const suffix = randomUUID();
    const user = await service.createPasswordUser({
      username: `pending_${suffix}`,
      email: `pending-${suffix}@example.test`,
      password: "RioTestPassword!123",
    });
    const token = randomUUID().replaceAll("-", "").padEnd(64, "a");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await service.saveEmailVerificationToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    });
    const stored = await databasePool.query(
      `SELECT email_verification_token_hash, email_verified
       FROM users
       WHERE id = $1`,
      [user.id],
    );
    expect(stored.rows).toEqual([
      {
        email_verification_token_hash: tokenHash,
        email_verified: false,
      },
    ]);

    await service.verifyEmailToken(tokenHash);
    await expect(service.verifyEmailToken(tokenHash)).rejects.toMatchObject({
      status: 400,
    });
    const verified = await databasePool.query(
      `SELECT email_verification_token_hash, email_verified
       FROM users
       WHERE id = $1`,
      [user.id],
    );
    expect(verified.rows).toEqual([
      { email_verification_token_hash: null, email_verified: true },
    ]);
  });

  test("does not create sessions for unverified password accounts", async () => {
    const service = createAuthPersistenceService(databasePool);
    const suffix = randomUUID();
    const user = await service.createPasswordUser({
      username: `unverified_${suffix}`,
      email: `unverified-${suffix}@example.test`,
      password: "RioTestPassword!123",
    });

    await expect(
      service.createSession({ userId: user.id }),
    ).rejects.toMatchObject({ status: 403 });
  });

  test("rate-limits verification resends and rejects expired tokens", async () => {
    const service = createAuthPersistenceService(databasePool);
    const suffix = randomUUID();
    const email = `resend-${suffix}@example.test`;
    const user = await service.createPasswordUser({
      username: `resend_${suffix}`,
      email,
      password: "RioTestPassword!123",
    });
    const firstHash = createHash("sha256").update(randomUUID()).digest("hex");
    const secondHash = createHash("sha256").update(randomUUID()).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await expect(
      service.issueEmailVerificationToken({
        email,
        tokenHash: firstHash,
        expiresAt,
      }),
    ).resolves.toMatchObject({ id: user.id });
    await expect(
      service.issueEmailVerificationToken({
        email,
        tokenHash: secondHash,
        expiresAt,
      }),
    ).resolves.toBeNull();

    const expiredUser = await service.createPasswordUser({
      username: `expired_${suffix}`,
      email: `expired-${suffix}@example.test`,
      password: "RioTestPassword!123",
    });
    const expiredHash = createHash("sha256").update(randomUUID()).digest("hex");
    await service.saveEmailVerificationToken({
      userId: expiredUser.id,
      tokenHash: expiredHash,
      expiresAt: new Date(Date.now() - 60_000),
    });
    await expect(service.verifyEmailToken(expiredHash)).rejects.toMatchObject({
      status: 400,
    });
  });

  test("stores only a hashed session token and supports lookup, expiry, and revocation", async () => {
    const service = createAuthPersistenceService(databasePool);
    const suffix = randomUUID();
    const user = await service.findOrCreateGoogleUser({
      subject: `session-subject-${suffix}`,
      email: `session-${suffix}@example.test`,
    });
    const session = await service.createSession({ userId: user.id });
    expect(session.token).toBeDefined();
    const stored = await databasePool.query(
      "SELECT token_hash, expires_at FROM auth_sessions WHERE user_id = $1",
      [user.id],
    );
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].token_hash).not.toBe(session.token);
    expect(stored.rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.rows[0].expires_at.getTime()).toBeGreaterThan(Date.now());
    await expect(service.findSession(session.token)).resolves.toMatchObject({
      id: user.id,
    });

    await service.revokeSession(session.token);
    await expect(service.findSession(session.token)).resolves.toBeNull();
  });
});
