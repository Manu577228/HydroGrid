ALTER TABLE demo_sessions
    ADD COLUMN owner_hash bytea CHECK (owner_hash IS NULL OR octet_length(owner_hash) = 32);
