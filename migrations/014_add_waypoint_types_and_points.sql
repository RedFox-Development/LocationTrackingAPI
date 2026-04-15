-- Add waypoint types and point values
-- This migration adds support for different waypoint types (start, checkpoint, end)
-- and point values for scoring

ALTER TABLE waypoints
ADD COLUMN type VARCHAR(20) DEFAULT 'CHECKPOINT' NOT NULL,
ADD COLUMN point_value INTEGER DEFAULT 1 NOT NULL;

-- Add check constraint for valid types
ALTER TABLE waypoints
ADD CONSTRAINT check_valid_waypoint_type CHECK (type IN ('START', 'CHECKPOINT', 'END'));

-- Add comment
COMMENT ON COLUMN waypoints.type IS 'Waypoint type: START, CHECKPOINT, or END';
COMMENT ON COLUMN waypoints.point_value IS 'Points awarded for visiting this waypoint';
