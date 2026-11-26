CREATE TABLE field_positions (
    device_id uuid PRIMARY KEY,
    label varchar(40) NOT NULL,
    position geometry(Point, 4326) NOT NULL,
    accuracy double precision NOT NULL CHECK (accuracy BETWEEN 0 AND 100000),
    seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX field_positions_seen_idx ON field_positions(seen_at);

CREATE TABLE field_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id uuid NOT NULL,
    client_id uuid NOT NULL,
    position geometry(Point, 4326) NOT NULL,
    accuracy double precision NOT NULL CHECK (accuracy BETWEEN 0 AND 100000),
    note varchar(280) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (device_id, client_id)
);
CREATE INDEX field_reports_created_idx ON field_reports(created_at);
