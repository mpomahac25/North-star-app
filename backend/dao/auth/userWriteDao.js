export function createUserWriteDao(db) {
  return {
    async createOAuthUser({ username, email }) {
      const result = await db.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, NULL)
         RETURNING id, username, email`,
        [username, email],
      );
      return result.rows[0];
    },

    async createPasswordUser({ username, email, passwordHash }) {
      const result = await db.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username, email`,
        [username, email, passwordHash],
      );
      return result.rows[0];
    },

    async linkOAuthAccount({ userId, provider, subject, email }) {
      await db.query(
        `INSERT INTO oauth_accounts (user_id, provider, provider_subject, email)
         VALUES ($1, $2, $3, $4)`,
        [userId, provider, subject, email],
      );
    },
  };
}
