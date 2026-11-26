CREATE TABLE ops_observations (
    kind varchar(8) NOT NULL CHECK (kind IN ('FLOOD', 'TRAFFIC', 'SHELTER')),
    site_id varchar(64) NOT NULL,
    label varchar(100) NOT NULL,
    position geometry(Point, 4326) NOT NULL,
    observed_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL CHECK (expires_at > observed_at),
    source_ref varchar(160) NOT NULL,
    value double precision,
    capacity integer,
    occupancy integer,
    state varchar(6),
    reported_by varchar(48) NOT NULL,
    PRIMARY KEY (kind, site_id),
    CHECK (state IS NULL OR state IN ('OPEN', 'CLOSED')),
    CHECK (value IS NULL OR value BETWEEN 0 AND 2000),
    CHECK (capacity IS NULL OR capacity BETWEEN 0 AND 100000),
    CHECK (occupancy IS NULL OR occupancy BETWEEN 0 AND capacity),
    CHECK (
        (kind = 'FLOOD' AND value IS NOT NULL AND capacity IS NULL AND occupancy IS NULL AND state IS NULL)
        OR (kind = 'TRAFFIC' AND value IS NULL AND capacity IS NULL AND occupancy IS NULL AND state IS NOT NULL)
        OR (kind = 'SHELTER' AND value IS NULL AND capacity IS NOT NULL AND occupancy IS NOT NULL
            AND state IS NOT NULL AND (state = 'CLOSED' OR capacity > 0))
    )
);
CREATE INDEX ops_observations_latest_idx ON ops_observations(kind, observed_at DESC, site_id);

CREATE TABLE ops_observation_history (
    LIKE ops_observations INCLUDING CONSTRAINTS,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, site_id, observed_at)
);

CREATE INDEX ops_observation_history_recorded_idx ON ops_observation_history(recorded_at);

CREATE TABLE ops_handoffs (
    id uuid PRIMARY KEY,
    reference varchar(80) NOT NULL UNIQUE,
    state varchar(12) NOT NULL CHECK (state IN ('RELAYED', 'ACKNOWLEDGED', 'CLOSED')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    reported_by varchar(48) NOT NULL
);
CREATE INDEX ops_handoffs_updated_idx ON ops_handoffs(updated_at DESC, id);

CREATE TABLE ops_handoff_events (
    id uuid NOT NULL REFERENCES ops_handoffs(id) ON DELETE CASCADE,
    reference varchar(80) NOT NULL,
    state varchar(12) NOT NULL CHECK (state IN ('RELAYED', 'ACKNOWLEDGED', 'CLOSED')),
    updated_at timestamptz NOT NULL,
    reported_by varchar(48) NOT NULL,
    PRIMARY KEY (id, state)
);
