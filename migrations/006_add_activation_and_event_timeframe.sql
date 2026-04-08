-- Add activation flag for teams and timeframe/timezone fields for events
ALTER TABLE teams
ADD COLUMN IF NOT EXISTS activated BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE events
ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;

-- Event access window must be valid when both bounds are defined
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

CREATE INDEX IF NOT EXISTS idx_teams_activated ON teams(activated);
CREATE INDEX IF NOT EXISTS idx_events_timeframe ON events(start_date, end_date);

COMMENT ON COLUMN teams.activated IS 'Set true after a team completes mobile QR setup';
COMMENT ON COLUMN events.timezone IS 'IANA timezone identifier used by clients (for example Europe/Helsinki)';
COMMENT ON COLUMN events.start_date IS 'Optional event access window start timestamp';
COMMENT ON COLUMN events.end_date IS 'Optional event access window end timestamp';
