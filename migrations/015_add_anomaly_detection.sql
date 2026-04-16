-- Add anomaly detection to location_updates
-- This allows filtering of suspicious readings (too high speed or sudden jumps)

ALTER TABLE location_updates
ADD COLUMN IF NOT EXISTS is_anomaly BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for filtering clean data during export and analytics
CREATE INDEX IF NOT EXISTS idx_location_updates_not_anomaly ON location_updates(timestamp DESC) 
WHERE is_anomaly = FALSE;

-- Index for finding anomalies for review
CREATE INDEX IF NOT EXISTS idx_location_updates_anomaly ON location_updates(timestamp DESC) 
WHERE is_anomaly = TRUE;
