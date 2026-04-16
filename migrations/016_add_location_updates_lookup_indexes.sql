-- Speed up event+team location update lookups used by Query.updates and Team.updates
CREATE INDEX IF NOT EXISTS idx_location_updates_event_team_timestamp
  ON location_updates (event, team, timestamp DESC);
