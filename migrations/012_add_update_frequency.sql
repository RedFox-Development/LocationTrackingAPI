-- Add update_frequency column to events table
-- Stores location update interval in milliseconds
-- Default: 10000 ms (10 seconds)

ALTER TABLE events
ADD COLUMN IF NOT EXISTS update_frequency INTEGER NOT NULL DEFAULT 10000;

-- Add constraint to validate frequency is between 1 and 60 seconds
ALTER TABLE events
ADD CONSTRAINT update_frequency_range 
CHECK (update_frequency >= 1000 AND update_frequency <= 60000);

-- Create index for potential future filtering by frequency
CREATE INDEX IF NOT EXISTS idx_events_update_frequency ON events(update_frequency);
