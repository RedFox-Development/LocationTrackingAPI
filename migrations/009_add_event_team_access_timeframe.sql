-- Add event-level team access timeframe support

ALTER TABLE events
ADD COLUMN IF NOT EXISTS team_access_timeframe_start_date TIMESTAMPTZ;

ALTER TABLE events
ADD COLUMN IF NOT EXISTS team_access_timeframe_end_date TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_team_access_timeframe_valid'
  ) THEN
    ALTER TABLE events
    ADD CONSTRAINT events_team_access_timeframe_valid
    CHECK (team_access_timeframe_start_date IS NULL OR team_access_timeframe_end_date IS NULL OR team_access_timeframe_start_date <= team_access_timeframe_end_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_team_access_timeframe ON events(team_access_timeframe_start_date, team_access_timeframe_end_date);
