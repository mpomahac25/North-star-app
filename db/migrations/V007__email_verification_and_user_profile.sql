ALTER TABLE users
    ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN email_verification_token_hash CHAR(64),
    ADD COLUMN email_verification_expires_at TIMESTAMPTZ,
    ADD COLUMN email_verification_sent_at TIMESTAMPTZ,
    ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN display_name VARCHAR(255),
    ADD CONSTRAINT users_email_verification_state_check
        CHECK (
            (email_verification_token_hash IS NULL) =
            (email_verification_expires_at IS NULL)
        );

UPDATE users
SET email_verified = TRUE
WHERE id IN (
    SELECT user_id
    FROM oauth_accounts
    WHERE provider = 'google'
);

CREATE UNIQUE INDEX users_email_verification_token_hash_idx
    ON users (email_verification_token_hash)
    WHERE email_verification_token_hash IS NOT NULL;
