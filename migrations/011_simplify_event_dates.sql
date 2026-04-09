-- Simplify event date columns
-- Remove start_date and end_date, rename team_access_timeframe_* to timeframe_*

-- First, drop the old constraint that references start_date and end_date
ALTER TABLE events
DROP CONSTRAINT IF EXISTS events_timeframe_valid;

-- Drop the constraint that references end_date
ALTER TABLE events
DROP CONSTRAINT IF EXISTS check_expiration_after_end;

-- Rename team_access_timeframe_start to timeframe_start
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'team_access_timeframe_start'
  ) THEN
    ALTER TABLE events
    RENAME COLUMN team_access_timeframe_start TO timeframe_start;
  END IF;
END $$;

-- Rename team_access_timeframe_end to timeframe_end
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'team_access_timeframe_end'
  ) THEN
    ALTER TABLE events
    RENAME COLUMN team_access_timeframe_end TO timeframe_end;
  END IF;
END $$;

-- Remove start_date and end_date columns
ALTER TABLE events
DROP COLUMN IF EXISTS start_date;

ALTER TABLE events
DROP COLUMN IF EXISTS end_date;

-- Add new constraint for timeframe validity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_timeframe_valid'
  ) THEN
    ALTER TABLE events
    ADD CONSTRAINT events_timeframe_valid
    CHECK (timeframe_start IS NULL OR timeframe_end IS NULL OR timeframe_start <= timeframe_end);
  END IF;
END $$;

-- Recreate index for timeframe columns
DROP INDEX IF EXISTS idx_events_team_access_timeframe;
CREATE INDEX IF NOT EXISTS idx_events_timeframe ON events(timeframe_start, timeframe_end);
