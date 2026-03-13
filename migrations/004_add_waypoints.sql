-- Add waypoint system for event tracking and scoring

CREATE TABLE IF NOT EXISTS waypoints (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    lat DECIMAL(10, 8) NOT NULL,
    lon DECIMAL(11, 8) NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS waypoint_visits (
    id SERIAL PRIMARY KEY,
    waypoint_id INTEGER NOT NULL REFERENCES waypoints(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    visited_at TIMESTAMP NOT NULL,
    lat DECIMAL(10, 8) NOT NULL,
    lon DECIMAL(11, 8) NOT NULL,
    UNIQUE (waypoint_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_waypoints_event_id ON waypoints(event_id);
CREATE INDEX IF NOT EXISTS idx_waypoint_visits_waypoint_id ON waypoint_visits(waypoint_id);
CREATE INDEX IF NOT EXISTS idx_waypoint_visits_team_id ON waypoint_visits(team_id);
CREATE INDEX IF NOT EXISTS idx_location_updates_team_timestamp ON location_updates(team, timestamp DESC);
