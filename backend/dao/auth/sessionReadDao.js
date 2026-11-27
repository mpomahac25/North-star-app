export function createSessionReadDao(db) {
  return {
    async findUserByTokenHash(tokenHash) {
      const result = await db.query(
        `SELECT u.id, u.username, u.email,
                u.display_name AS "displayName",
                u.is_admin AS "isAdmin"
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1
           AND s.expires_at > NOW()
           AND u.email_verified = TRUE`,
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },
  };
}
