-- Migration: Add organization name and expiration dates
-- Run this migration on existing databases to add organization name and expiration tracking
-- Date: 2026-02-26

-- Add organization_name column to events table
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS organization_name VARCHAR(255);

-- Add expiration_date column to events table
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS expiration_date DATE;

-- Add expiration_date column to teams table
ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS expiration_date DATE;

-- Create indexes for expiration queries (important for cleanup operations)
CREATE INDEX IF NOT EXISTS idx_events_expiration ON events(expiration_date);
CREATE INDEX IF NOT EXISTS idx_teams_expiration ON teams(expiration_date);

-- Add comments
COMMENT ON COLUMN events.organization_name IS 'Name of the organization hosting the event';
COMMENT ON COLUMN events.expiration_date IS 'Date when the event expires and can be cleaned up';
COMMENT ON COLUMN teams.expiration_date IS 'Date when the team expires and can be cleaned up';
