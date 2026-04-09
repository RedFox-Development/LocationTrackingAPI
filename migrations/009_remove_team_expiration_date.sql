-- Remove redundant teams.expiration_date column (replaced by access_end_date)

-- Drop the index first
DROP INDEX IF EXISTS idx_teams_expiration;

-- Drop the unused column
ALTER TABLE teams
DROP COLUMN IF EXISTS expiration_date;
