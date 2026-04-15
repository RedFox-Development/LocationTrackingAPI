-- Location Tracker Database Schema
-- Run this script on your PostgreSQL database to set up the tables

-- Events table: stores tracking events
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    keycode VARCHAR(255) NOT NULL,
    view_keycode VARCHAR(255) NOT NULL,
    image_data TEXT,
    image_mime_type VARCHAR(50),
    logo_data TEXT,
    logo_mime_type VARCHAR(50),
    geofence_data TEXT,
    organization_name VARCHAR(255),
    expiration_date TIMESTAMPTZ,
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    timeframe_start TIMESTAMPTZ,
    timeframe_end TIMESTAMPTZ,
    UNIQUE(name, keycode),
    UNIQUE(name, view_keycode),
    CHECK (expiration_date IS NULL OR timeframe_end IS NULL OR timeframe_end <= expiration_date),
    CHECK (timeframe_start IS NULL OR timeframe_end IS NULL OR timeframe_start <= timeframe_end)
);

-- Teams table: stores teams participating in events
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(7) DEFAULT '#3B82F6',
    activated BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(event_id, name)
);

-- Locations table: stores location updates from teams
CREATE TABLE IF NOT EXISTS location_updates (
    id SERIAL PRIMARY KEY,
    team VARCHAR(255) NOT NULL REFERENCES teams(name) ON DELETE CASCADE,
    event VARCHAR(255) NOT NULL REFERENCES events(name) ON DELETE CASCADE,
    lat DECIMAL(10, 8) NOT NULL,
    lon DECIMAL(11, 8) NOT NULL,
    timestamp TIMESTAMP NOT NULL
);

-- Waypoints table: stores event checkpoints
CREATE TABLE IF NOT EXISTS waypoints (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    lat DECIMAL(10, 8) NOT NULL,
    lon DECIMAL(11, 8) NOT NULL,
    type VARCHAR(20) DEFAULT 'CHECKPOINT' NOT NULL,
    point_value INTEGER DEFAULT 0 NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (type IN ('START', 'CHECKPOINT', 'END'))
);

-- Waypoint visits table: tracks first visit per team/waypoint
CREATE TABLE IF NOT EXISTS waypoint_visits (
    id SERIAL PRIMARY KEY,
    waypoint_id INTEGER NOT NULL REFERENCES waypoints(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    visited_at TIMESTAMP NOT NULL,
    lat DECIMAL(10, 8) NOT NULL,
    lon DECIMAL(11, 8) NOT NULL,
    UNIQUE (waypoint_id, team_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_teams_event_id ON teams(event_id);
CREATE INDEX IF NOT EXISTS idx_location_updates_team ON location_updates(team);
CREATE INDEX IF NOT EXISTS idx_location_updates_timestamp ON location_updates(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_name_keycode ON events(name, keycode);
CREATE INDEX IF NOT EXISTS idx_events_name_view_keycode ON events(name, view_keycode);
CREATE INDEX IF NOT EXISTS idx_events_expiration ON events(expiration_date);
CREATE INDEX IF NOT EXISTS idx_events_timeframe ON events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_teams_activated ON teams(activated);
CREATE INDEX IF NOT EXISTS idx_waypoints_event_id ON waypoints(event_id);
CREATE INDEX IF NOT EXISTS idx_waypoint_visits_waypoint_id ON waypoint_visits(waypoint_id);
CREATE INDEX IF NOT EXISTS idx_waypoint_visits_team_id ON waypoint_visits(team_id);
CREATE INDEX IF NOT EXISTS idx_location_updates_team_timestamp ON location_updates(team, timestamp DESC);

-- Comments
COMMENT ON TABLE events IS 'Tracking events with authentication';
COMMENT ON TABLE teams IS 'Teams participating in events';
COMMENT ON TABLE location_updates IS 'Location updates from team devices';
COMMENT ON TABLE waypoints IS 'Event waypoints with required/optional flag';
COMMENT ON TABLE waypoint_visits IS 'First visit records for each team and waypoint';
COMMENT ON COLUMN events.image_data IS 'Base64 encoded event image data';
COMMENT ON COLUMN events.image_mime_type IS 'MIME type of event image (e.g., image/png, image/jpeg)';
COMMENT ON COLUMN events.logo_data IS 'Base64 encoded organization logo data';
COMMENT ON COLUMN events.logo_mime_type IS 'MIME type of logo (e.g., image/png, image/jpeg)';
COMMENT ON COLUMN events.geofence_data IS 'Geofence polygon coordinates as JSON array of [lat, lon] pairs';
COMMENT ON COLUMN events.timezone IS 'IANA timezone identifier used by clients';
COMMENT ON COLUMN events.start_date IS 'Optional event access window start timestamp';
COMMENT ON COLUMN events.end_date IS 'Optional event access window end timestamp';
COMMENT ON COLUMN teams.activated IS 'Set true after mobile setup succeeds';
