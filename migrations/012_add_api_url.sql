-- Add api_url column to events table for storing custom API endpoints
ALTER TABLE events ADD COLUMN IF NOT EXISTS api_url VARCHAR(500);
