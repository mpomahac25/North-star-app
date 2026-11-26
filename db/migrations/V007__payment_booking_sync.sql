CREATE TABLE booking_payment_sync (
    payment_id UUID PRIMARY KEY
        REFERENCES payment_attempts(id),

    desired_status VARCHAR(30) NOT NULL
        CHECK (desired_status IN ('paid', 'failed', 'expired')),

    synced_at TIMESTAMPTZ,

    attempts INTEGER NOT NULL DEFAULT 0
        CHECK (attempts >= 0),

    last_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX booking_payment_sync_pending_idx
ON booking_payment_sync (updated_at)
WHERE synced_at IS NULL;

INSERT INTO booking_payment_sync (
    payment_id,
    desired_status
)
SELECT
    id,
    status
FROM payment_attempts
WHERE status IN ('paid', 'failed', 'expired')
ON CONFLICT (payment_id) DO NOTHING;