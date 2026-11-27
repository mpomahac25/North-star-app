export function createSessionWriteDao(pool) {
  return {
    async create({ tokenHash, previousTokenHash, userId, expiresInSeconds }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const eligibleUser = await client.query(
          `SELECT id
           FROM users
           WHERE id = $1 AND email_verified = TRUE
           FOR SHARE`,
          [userId],
        );
        if (eligibleUser.rowCount === 0) {
          const error = new Error(
            "Email must be verified before creating a session.",
          );
          error.status = 403;
          throw error;
        }
        if (previousTokenHash) {
          await client.query(
            "DELETE FROM auth_sessions WHERE token_hash = $1",
            [previousTokenHash],
          );
        }
        await client.query(
          "DELETE FROM auth_sessions WHERE expires_at <= NOW()",
        );
        await client.query(
          `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
           VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 second'))`,
          [tokenHash, userId, expiresInSeconds],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async deleteByTokenHash(tokenHash) {
      await pool.query("DELETE FROM auth_sessions WHERE token_hash = $1", [
        tokenHash,
      ]);
    },
  };
}
