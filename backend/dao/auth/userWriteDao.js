export function createUserWriteDao(db) {
  return {
    async createOAuthUser({ username, email, displayName }) {
      const result = await db.query(
        `INSERT INTO users
           (username, email, password_hash, email_verified, display_name)
         VALUES ($1, $2, NULL, TRUE, $3)
         RETURNING id, username, email,
                   display_name AS "displayName",
                   is_admin AS "isAdmin",
                   email_verified AS "emailVerified"`,
        [username, email, displayName],
      );
      return result.rows[0];
    },

    async createPasswordUser({ username, email, passwordHash }) {
      const result = await db.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username, email,
                   display_name AS "displayName",
                   is_admin AS "isAdmin",
                   email_verified AS "emailVerified"`,
        [username, email, passwordHash],
      );
      return result.rows[0];
    },

    async updateOAuthProfile({ userId, displayName }) {
      if (!displayName) return;
      await db.query(
        `UPDATE users
         SET display_name = $1
         WHERE id = $2`,
        [displayName, userId],
      );
    },

    async linkOAuthAccount({ userId, provider, subject, email }) {
      await db.query(
        `INSERT INTO oauth_accounts (user_id, provider, provider_subject, email)
         VALUES ($1, $2, $3, $4)`,
        [userId, provider, subject, email],
      );
    },

    async saveEmailVerificationToken({ userId, tokenHash, expiresAt }) {
      const result = await db.query(
        `UPDATE users
         SET email_verification_token_hash = $1,
             email_verification_expires_at = $2,
             email_verification_sent_at = NOW()
         WHERE id = $3
           AND email_verified = FALSE
         RETURNING id, username, email`,
        [tokenHash, expiresAt, userId],
      );
      return result.rows[0] ?? null;
    },

    async issueEmailVerificationToken({ email, tokenHash, expiresAt }) {
      const result = await db.query(
        `UPDATE users
         SET email_verification_token_hash = $1,
             email_verification_expires_at = $2,
             email_verification_sent_at = NOW()
         WHERE lower(email) = lower($3)
           AND email_verified = FALSE
           AND (
             email_verification_sent_at IS NULL
             OR email_verification_sent_at < NOW() - INTERVAL '1 minute'
           )
         RETURNING id, username, email`,
        [tokenHash, expiresAt, email],
      );
      return result.rows[0] ?? null;
    },

    async verifyEmailToken(tokenHash) {
      const result = await db.query(
        `UPDATE users
         SET email_verified = TRUE,
             email_verification_token_hash = NULL,
             email_verification_expires_at = NULL,
             email_verification_sent_at = NULL
         WHERE email_verification_token_hash = $1
           AND email_verified = FALSE
           AND email_verification_expires_at > NOW()
         RETURNING id`,
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },
  };
}
