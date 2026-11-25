export function createUserReadDao(db) {
  return {
    async findByProviderSubject(provider, subject) {
      const result = await db.query(
        `SELECT u.id, u.username, u.email
         FROM oauth_accounts a
         JOIN users u ON u.id = a.user_id
         WHERE a.provider = $1 AND a.provider_subject = $2`,
        [provider, subject],
      );
      return result.rows[0] ?? null;
    },

    async findByEmail(email) {
      const result = await db.query(
        `SELECT id, username, email
         FROM users
         WHERE lower(email) = lower($1)
         FOR UPDATE`,
        [email],
      );
      return result.rows[0] ?? null;
    },

    async findByUsername(username) {
      const result = await db.query(
        `SELECT id
         FROM users
         WHERE lower(username) = lower($1)
         FOR UPDATE`,
        [username],
      );
      return result.rows[0] ?? null;
    },

    async findForPasswordAuthentication(identifier) {
      const isEmail = identifier.includes("@");
      const result = await db.query(
        `SELECT id, username, email, password_hash
         FROM users
         WHERE lower(${isEmail ? "email" : "username"}) = lower($1)`,
        [identifier],
      );
      return result.rows[0] ?? null;
    },
  };
}
