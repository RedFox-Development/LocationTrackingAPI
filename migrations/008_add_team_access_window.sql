-- Add per-team access window support

ALTER TABLE teams
ADD COLUMN IF NOT EXISTS access_start_date TIMESTAMPTZ;

ALTER TABLE teams
ADD COLUMN IF NOT EXISTS access_end_date TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'teams_access_window_valid'
  ) THEN
    ALTER TABLE teams
    ADD CONSTRAINT teams_access_window_valid
    CHECK (access_start_date IS NULL OR access_end_date IS NULL OR access_start_date <= access_end_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_teams_access_window ON teams(access_start_date, access_end_date);