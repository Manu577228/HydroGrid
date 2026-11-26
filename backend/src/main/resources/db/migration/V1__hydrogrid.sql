CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE graph_nodes (
    id text PRIMARY KEY,
    label text NOT NULL,
    position geometry(Point, 4326) NOT NULL
);

CREATE TABLE graph_roads (
    id text PRIMARY KEY,
    path geometry(LineString, 4326) NOT NULL
);
CREATE INDEX graph_roads_path_idx ON graph_roads USING gist(path);

CREATE TABLE graph_flood_zones (
    id text PRIMARY KEY,
    footprint geometry(Polygon, 4326) NOT NULL
);

CREATE TABLE demo_sessions (
    id uuid PRIMARY KEY,
    intensity integer NOT NULL DEFAULT 0 CHECK (intensity BETWEEN 0 AND 100),
    accessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX demo_sessions_accessed_idx ON demo_sessions(accessed_at);

CREATE TABLE rescue_units (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES demo_sessions(id) ON DELETE CASCADE,
    name text NOT NULL,
    node_id text NOT NULL REFERENCES graph_nodes(id),
    capacity integer NOT NULL CHECK (capacity > 0),
    equipment text[] NOT NULL DEFAULT '{}',
    status text NOT NULL CHECK (status IN ('AVAILABLE', 'BUSY')),
    UNIQUE(session_id, id)
);
CREATE INDEX rescue_units_session_idx ON rescue_units(session_id);

CREATE TABLE incidents (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES demo_sessions(id) ON DELETE CASCADE,
    client_id uuid NOT NULL,
    summary text NOT NULL,
    hazard text NOT NULL CHECK (hazard IN ('FLOOD','MEDICAL','LANDSLIDE','INFRASTRUCTURE','OTHER')),
    people integer NOT NULL CHECK (people > 0),
    medical boolean NOT NULL,
    vulnerable boolean NOT NULL,
    depth_cm integer NOT NULL CHECK (depth_cm >= 0),
    immediate_danger boolean NOT NULL,
    position geometry(Point, 4326) NOT NULL,
    node_id text NOT NULL REFERENCES graph_nodes(id),
    reported_severity text NOT NULL,
    override_severity text,
    override_reason text,
    status text NOT NULL CHECK (status IN ('REPORTED','ASSIGNED','EN_ROUTE','ON_SCENE','RESOLVED')),
    assigned_unit_id uuid,
    group_id uuid,
    created_at timestamptz NOT NULL,
    FOREIGN KEY (session_id, assigned_unit_id) REFERENCES rescue_units(session_id, id),
    UNIQUE(session_id, id),
    UNIQUE(session_id, client_id)
);
CREATE INDEX incidents_session_time_idx ON incidents(session_id, created_at DESC);
CREATE INDEX incidents_position_idx ON incidents USING gist ((position::geography));
CREATE UNIQUE INDEX incidents_active_unit_idx ON incidents(session_id, assigned_unit_id)
    WHERE status IN ('ASSIGNED', 'EN_ROUTE', 'ON_SCENE');

CREATE TABLE mission_actions (
    session_id uuid NOT NULL,
    client_id uuid NOT NULL,
    incident_id uuid NOT NULL,
    status text NOT NULL,
    FOREIGN KEY (session_id, incident_id) REFERENCES incidents(session_id, id) ON DELETE CASCADE,
    PRIMARY KEY (session_id, client_id)
);

CREATE TABLE shelters (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES demo_sessions(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL CHECK (type IN ('RELIEF','MEDICAL')),
    node_id text NOT NULL REFERENCES graph_nodes(id),
    capacity integer NOT NULL CHECK (capacity > 0),
    reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    admitted integer NOT NULL DEFAULT 0 CHECK (admitted >= 0),
    CHECK (reserved + admitted <= capacity),
    UNIQUE(session_id, id)
);
CREATE INDEX shelters_session_idx ON shelters(session_id);

CREATE TABLE reservations (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES demo_sessions(id) ON DELETE CASCADE,
    client_id uuid NOT NULL,
    shelter_id uuid NOT NULL,
    incident_id uuid,
    people integer NOT NULL CHECK (people > 0),
    status text NOT NULL CHECK (status IN ('RESERVED','ADMITTED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (session_id, shelter_id) REFERENCES shelters(session_id, id) ON DELETE CASCADE,
    FOREIGN KEY (session_id, incident_id) REFERENCES incidents(session_id, id),
    UNIQUE(session_id, client_id)
);
CREATE INDEX reservations_shelter_idx ON reservations(session_id, shelter_id);

CREATE TABLE audit_events (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES demo_sessions(id) ON DELETE CASCADE,
    incident_id uuid,
    type text NOT NULL,
    detail text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (session_id, incident_id) REFERENCES incidents(session_id, id) ON DELETE CASCADE
);
CREATE INDEX audit_session_time_idx ON audit_events(session_id, created_at DESC);
CREATE INDEX audit_incident_time_idx ON audit_events(session_id, incident_id, created_at);
