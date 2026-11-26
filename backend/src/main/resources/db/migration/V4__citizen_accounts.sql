CREATE TABLE citizen_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(254) NOT NULL UNIQUE CHECK (email = lower(email)),
    display_name varchar(80) NOT NULL,
    password_hash varchar(100) NOT NULL,
    time_zone varchar(64) NOT NULL DEFAULT 'Asia/Kolkata',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE citizen_account_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES citizen_accounts(id) ON DELETE CASCADE,
    refresh_digest bytea NOT NULL UNIQUE CHECK (octet_length(refresh_digest) = 32),
    expires_at timestamptz NOT NULL
);

CREATE INDEX citizen_account_sessions_expiry_idx ON citizen_account_sessions(expires_at);
