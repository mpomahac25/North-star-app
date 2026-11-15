CREATE TABLE payment_attempts (
    id UUID PRIMARY KEY,
    booking_id INTEGER NOT NULL,
    checkout_attempt_id UUID NOT NULL UNIQUE,
    stripe_session_id TEXT UNIQUE,
    stripe_checkout_url TEXT,
    stripe_payment_intent_id TEXT UNIQUE,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency VARCHAR(3) NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
    status VARCHAR(30) NOT NULL DEFAULT 'creating'
        CHECK (status IN ('creating', 'pending_payment', 'paid', 'expired', 'cancelled', 'failed')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX payment_attempts_one_active_per_booking
ON payment_attempts (booking_id)
WHERE status IN ('creating', 'pending_payment');

CREATE UNIQUE INDEX payment_attempts_one_paid_per_booking
ON payment_attempts (booking_id)
WHERE status = 'paid';

CREATE TABLE stripe_webhook_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    payment_id UUID REFERENCES payment_attempts(id),
    processing_status VARCHAR(20) NOT NULL DEFAULT 'received'
        CHECK (processing_status IN ('received', 'processed', 'failed')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    last_error TEXT
);