import { randomUUID } from "node:crypto";
import pg from "pg";

const schemas = ["ci_fresh", "ci_upgrade"];

describe.each(schemas)("V007 email and profile migration in %s", (schema) => {
  let client;

  beforeAll(async () => {
    const connectionString = process.env.DB_TEST_URL;

    if (!connectionString) {
      throw new Error("DB_TEST_URL is required");
    }

    client = new pg.Client({
      connectionString,
      connectionTimeoutMillis: 5000,
    });
    await client.connect();
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  beforeEach(async () => client.query("BEGIN"));
  afterEach(async () => client.query("ROLLBACK"));

  async function insertUser() {
    const suffix = randomUUID();
    const result = await client.query(
      `INSERT INTO ${schema}.users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`viewer_${suffix}`, `${suffix}@example.test`, "password-hash"],
    );
    return result.rows[0].id;
  }

  test("defaults new accounts to unverified and non-admin", async () => {
    const userId = await insertUser();
    const result = await client.query(
      `SELECT email_verified, is_admin, display_name,
              email_verification_token_hash, email_verification_expires_at
       FROM ${schema}.users
       WHERE id = $1`,
      [userId],
    );

    expect(result.rows).toEqual([
      {
        email_verified: false,
        is_admin: false,
        display_name: null,
        email_verification_token_hash: null,
        email_verification_expires_at: null,
      },
    ]);
  });

  test("stores a hashed verification token and user profile fields", async () => {
    const userId = await insertUser();
    const tokenHash = randomUUID().replaceAll("-", "").padEnd(64, "a");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await client.query(
      `UPDATE ${schema}.users
       SET email_verification_token_hash = $1,
           email_verification_expires_at = $2,
           email_verification_sent_at = NOW(),
           display_name = $3,
           is_admin = TRUE
       WHERE id = $4`,
      [tokenHash, expiresAt, "Rio Viewer", userId],
    );

    const result = await client.query(
      `SELECT email_verification_token_hash, email_verification_expires_at,
              display_name, is_admin
       FROM ${schema}.users
       WHERE id = $1`,
      [userId],
    );

    expect(result.rows[0]).toMatchObject({
      email_verification_token_hash: tokenHash,
      display_name: "Rio Viewer",
      is_admin: true,
    });
    expect(result.rows[0].email_verification_expires_at).toBeInstanceOf(Date);
  });

  test("requires verification token hash and expiry to be set together", async () => {
    const userId = await insertUser();
    await expect(
      client.query(
        `UPDATE ${schema}.users
         SET email_verification_token_hash = $1
         WHERE id = $2`,
        ["a".repeat(64), userId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
