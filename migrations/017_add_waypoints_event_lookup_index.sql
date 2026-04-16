-- Speed up waypoint lookups by event for desktop and export flows
CREATE INDEX IF NOT EXISTS idx_waypoints_event_id_created_at
  ON waypoints (event_id, created_at ASC, id ASC);
