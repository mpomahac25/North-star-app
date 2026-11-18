export function createSessionReadDao(db) {
  return {
    async findUserByTokenHash(tokenHash) {
      const result = await db.query(
        `SELECT u.id, u.username, u.email
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },
  };
}
