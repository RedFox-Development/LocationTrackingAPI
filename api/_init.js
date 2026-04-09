/**
 * Database initialization - creates tables if they don't exist
 */

import { query } from './_db.js';

const initSQL = `
-- Events table: stores tracking events
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    keycode VARCHAR(255) NOT NULL,
  view_keycode VARCHAR(255),
    image_data TEXT,
    image_mime_type VARCHAR(50),
    logo_data TEXT,
    logo_mime_type VARCHAR(50),
  geofence_data TEXT,
    organization_name VARCHAR(255),
    expiration_date TIMESTAMPTZ,
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    team_access_timeframe_start TIMESTAMPTZ,
    team_access_timeframe_end TIMESTAMPTZ,
    CHECK (expiration_date IS NULL OR end_date IS NULL OR end_date <= expiration_date),
    CHECK (team_access_timeframe_start IS NULL OR team_access_timeframe_end IS NULL OR team_access_timeframe_start <= team_access_timeframe_end),
    UNIQUE(name, keycode)
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
  is_required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Waypoint visits table: tracks first visit of each team per waypoint
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

-- Backward-compatible column migrations for existing databases
ALTER TABLE events ADD COLUMN IF NOT EXISTS geofence_data TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS view_keycode VARCHAR(255);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'events'
      AND column_name = 'expiration_date'
      AND data_type = 'date'
  ) THEN
    ALTER TABLE events
    ALTER COLUMN expiration_date TYPE TIMESTAMPTZ
    USING CASE
      WHEN expiration_date IS NULL THEN NULL
      ELSE (expiration_date::timestamp + time '23:59:59') AT TIME ZONE 'UTC'
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'teams'
      AND column_name = 'expiration_date'
      AND data_type = 'date'
  ) THEN
    ALTER TABLE teams
    ALTER COLUMN expiration_date TYPE TIMESTAMPTZ
    USING CASE
      WHEN expiration_date IS NULL THEN NULL
      ELSE (expiration_date::timestamp + time '23:59:59') AT TIME ZONE 'UTC'
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'events'
      AND column_name = 'start_date'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE events
    ALTER COLUMN start_date TYPE TIMESTAMPTZ
    USING CASE
      WHEN start_date IS NULL THEN NULL
      ELSE start_date AT TIME ZONE 'UTC'
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'events'
      AND column_name = 'end_date'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE events
    ALTER COLUMN end_date TYPE TIMESTAMPTZ
    USING CASE
      WHEN end_date IS NULL THEN NULL
      ELSE end_date AT TIME ZONE 'UTC'
    END;
  END IF;
END $$;

ALTER TABLE events ADD COLUMN IF NOT EXISTS timezone VARCHAR(100);
ALTER TABLE events ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;
UPDATE events
SET timezone = 'UTC'
WHERE timezone IS NULL OR timezone = '';
ALTER TABLE events ALTER COLUMN timezone SET DEFAULT 'UTC';
ALTER TABLE events ALTER COLUMN timezone SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_timeframe_valid'
  ) THEN
    ALTER TABLE events
    ADD CONSTRAINT events_timeframe_valid
    CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_end_not_after_expiration'
  ) THEN
    ALTER TABLE events
    ADD CONSTRAINT events_end_not_after_expiration
    CHECK (expiration_date IS NULL OR end_date IS NULL OR end_date <= expiration_date);
  END IF;
END $$;

ALTER TABLE teams ADD COLUMN IF NOT EXISTS activated BOOLEAN;
UPDATE teams
SET activated = FALSE
WHERE activated IS NULL;
ALTER TABLE teams ALTER COLUMN activated SET DEFAULT FALSE;
ALTER TABLE teams ALTER COLUMN activated SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_team_access_timeframe_valid'
  ) THEN
    ALTER TABLE events
    ADD CONSTRAINT events_team_access_timeframe_valid
    CHECK (team_access_timeframe_start IS NULL OR team_access_timeframe_end IS NULL OR team_access_timeframe_start <= team_access_timeframe_end);
  END IF;
END $$;

UPDATE events
SET view_keycode = UPPER(SUBSTRING(MD5(RANDOM()::text || clock_timestamp()::text) FROM 1 FOR 8))
WHERE view_keycode IS NULL OR view_keycode = '';
UPDATE events
SET view_keycode = UPPER(view_keycode)
WHERE view_keycode <> UPPER(view_keycode);
ALTER TABLE events ALTER COLUMN view_keycode SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_name_view_keycode_key'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_name_view_keycode_key UNIQUE(name, view_keycode);
  END IF;
END $$;
`;

let initialized = false;

/**
 * Initialize database schema if needed
 * Safe to call multiple times - uses IF NOT EXISTS
 */
export async function initDatabase() {
  if (initialized) {
    return;
  }

  try {
    await query(initSQL);
    initialized = true;
    console.log('Database schema initialized');
  } catch (error) {
    console.error('Database initialization error:', error.message);
    // Don't throw - let the API continue and fail on actual queries
    // This allows better error messages for connection issues
  }
}
