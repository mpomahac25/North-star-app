import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import { createAuthPersistenceService } from "../../services/authPersistenceService.js";

const { Pool } = pg;
const databaseUrl = process.env.DB_TEST_URL;
if (!databaseUrl) {
  throw new Error("DB_TEST_URL is required to run PostgreSQL integration tests.");
}

const schemaName = `auth_test_${randomUUID().replaceAll("-", "")}`;
const adminPool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
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
    const migrationsPath = fileURLToPath(new URL("../../../db/migrations/", import.meta.url));
    const files = (await readdir(migrationsPath))
      .filter((file) => /^V\d+__.*\.sql$/.test(file))
      .sort();
    const client = await databasePool.connect();
    try {
      for (const file of files) {
        await client.query(await readFile(path.join(migrationsPath, file), "utf8"));
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
        if (schemaCreated) await adminPool.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      } finally {
        await adminPool.end();
      }
    }
  });

  test("creates a Google user, links a matching email, and reuses the provider identity", async () => {
    const service = createAuthPersistenceService(databasePool);
    const suffix = randomUUID();
    const first = await service.findOrCreateGoogleUser({
      subject: `subject-${suffix}`,
      email: `${suffix}@example.test`,
    });
    const reused = await service.findOrCreateGoogleUser({
      subject: `subject-${suffix}`,
      email: `${suffix}@example.test`,
    });
    expect(reused.id).toBe(first.id);

    const count = await databasePool.query(
      "SELECT COUNT(*)::int AS count FROM users WHERE lower(email) = lower($1)",
      [`${suffix}@example.test`],
    );
    expect(count.rows[0].count).toBe(1);
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
    await expect(service.findSession(session.token)).resolves.toMatchObject({ id: user.id });

    await service.revokeSession(session.token);
    await expect(service.findSession(session.token)).resolves.toBeNull();
  });
});
