import { randomUUID } from "node:crypto";
import pg from "pg";

const schemas = ["ci_fresh", "ci_upgrade"];

describe.each(schemas)("V006 Google auth migration in %s", (schema) => {
  let client;

  beforeAll(async () => {
    const connectionString = process.env.DB_TEST_URL;

    if (
      !connectionString ||
      decodeURIComponent(new URL(connectionString).pathname.slice(1)) !==
        "rio_schema_test"
    ) {
      throw new Error("Google auth migration tests require rio_schema_test");
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

  async function insertGoogleUser() {
    const suffix = randomUUID();
    const user = await client.query(
      `INSERT INTO ${schema}.users (username, email, password_hash)
             VALUES ($1, $2, NULL) RETURNING id`,
      [`google_${suffix}`, `${suffix}@example.test`],
    );
    const subject = `google-sub-${suffix}`;
    await client.query(
      `INSERT INTO ${schema}.oauth_accounts
                (user_id, provider, provider_subject, email)
             VALUES ($1, 'google', $2, $3)`,
      [user.rows[0].id, subject, `${suffix}@example.test`],
    );
    return {
      userId: user.rows[0].id,
      subject,
      email: `${suffix}@example.test`,
    };
  }

  test("allows OAuth users without a local password and stores provider identity", async () => {
    const user = await insertGoogleUser();
    const result = await client.query(
      `SELECT u.password_hash, a.provider, a.provider_subject, a.email
             FROM ${schema}.oauth_accounts a
             JOIN ${schema}.users u ON u.id = a.user_id
             WHERE a.provider_subject = $1`,
      [user.subject],
    );

    expect(result.rows).toEqual([
      {
        password_hash: null,
        provider: "google",
        provider_subject: user.subject,
        email: user.email,
      },
    ]);
  });

  test("enforces unique Google identities", async () => {
    const first = await insertGoogleUser();
    const second = await client.query(
      `INSERT INTO ${schema}.users (username, email, password_hash)
             VALUES ($1, $2, NULL) RETURNING id`,
      [`other_${randomUUID()}`, `${randomUUID()}@example.test`],
    );

    await expect(
      client.query(
        `INSERT INTO ${schema}.oauth_accounts
                (user_id, provider, provider_subject, email)
             VALUES ($1, 'google', $2, $3)`,
        [second.rows[0].id, first.subject, first.email],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  test("stores only a 64-character session token hash and links it to the user", async () => {
    const user = await insertGoogleUser();
    const tokenHash = randomUUID().replaceAll("-", "").padEnd(64, "a");
    const result = await client.query(
      `INSERT INTO ${schema}.auth_sessions (token_hash, user_id, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '1 day')
             RETURNING token_hash, user_id, expires_at`,
      [tokenHash, user.userId],
    );

    expect(result.rows[0].token_hash.trim()).toBe(tokenHash);
    expect(result.rows[0].user_id).toBe(user.userId);
    expect(result.rows[0].expires_at).toBeInstanceOf(Date);
  });

  test("cascades account and session removal when a user is deleted", async () => {
    const user = await insertGoogleUser();
    await client.query(
      `INSERT INTO ${schema}.auth_sessions (token_hash, user_id, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '1 day')`,
      [randomUUID().replaceAll("-", "").padEnd(64, "b"), user.userId],
    );
    await client.query(`DELETE FROM ${schema}.users WHERE id = $1`, [
      user.userId,
    ]);

    const result = await client.query(
      `SELECT
                (SELECT COUNT(*) FROM ${schema}.oauth_accounts WHERE user_id = $1) AS accounts,
                (SELECT COUNT(*) FROM ${schema}.auth_sessions WHERE user_id = $1) AS sessions`,
      [user.userId],
    );
    expect(result.rows[0]).toEqual({ accounts: "0", sessions: "0" });
  });
});
