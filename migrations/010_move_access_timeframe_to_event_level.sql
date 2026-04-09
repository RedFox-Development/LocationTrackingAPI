-- Move team access window from per-team to event level
-- Teams now share the same access timeframe defined at the event level

-- Add new columns to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS team_access_timeframe_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS team_access_timeframe_end TIMESTAMPTZ;

-- Add constraint for valid timeframe ordering on events
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

-- Remove per-team access columns from teams table
ALTER TABLE teams
DROP CONSTRAINT IF EXISTS teams_access_window_valid;

ALTER TABLE teams
DROP COLUMN IF EXISTS access_start_date,
DROP COLUMN IF EXISTS access_end_date;
