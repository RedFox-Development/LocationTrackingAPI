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
    UNIQUE(name, keycode)
);

-- Teams table: stores teams participating in events
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(7) DEFAULT '#3B82F6',
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_teams_event_id ON teams(event_id);
CREATE INDEX IF NOT EXISTS idx_location_updates_team ON location_updates(team);
CREATE INDEX IF NOT EXISTS idx_location_updates_timestamp ON location_updates(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_name_keycode ON events(name, keycode);
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
