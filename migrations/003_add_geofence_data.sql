-- Migration: Add geofence_data column to events table
-- Purpose: Support geofence feature for event location boundaries
-- Date: 2026-02-28

ALTER TABLE events ADD COLUMN IF NOT EXISTS geofence_data TEXT;

COMMENT ON COLUMN events.geofence_data IS 'Geofence polygon coordinates as JSON array of [lat, lon] pairs';
